from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from .. import models, schemas, database, auth
from .logs import log_activity

router = APIRouter(
    prefix="/api/rooms",
    tags=["Rooms"]
)

"""
Room ownership.

A room is either shared campus space (`department_id IS NULL`) or a laboratory
a college runs itself. The split decides who may change it:

  shared      -- lecture halls, and laboratories the Registrar assigns centrally.
                 Administrator-only, because every college schedules into them.
  departmental-- a laboratory the owning college created. That college's chair
                 and coordinator manage it; nobody else does, including chairs of
                 other colleges.

Owning laboratories is optional. A college whose laboratories all come from the
Registrar simply never creates any, and nothing here asks it to. Registrar
assignment is not modelled -- those rooms are registered by an administrator as
ordinary shared rooms.
"""

#: The only types a department may own. A lecture hall is shared by definition.
LAB_TYPES = ('lab', 'computer_lab')

VALID_TYPES = ('lecture',) + LAB_TYPES

SCHEDULING_ROLES = ('program_chair', 'coordinator')


def _user_department(db: Session, user: models.User) -> Optional[models.Department]:
    """The college a chair or coordinator belongs to, or None."""
    if not user.department:
        return None
    return db.query(models.Department).filter(
        (models.Department.code == user.department) |
        (models.Department.name == user.department)
    ).first()


def _assert_may_manage(db: Session, user: models.User, room: models.Room) -> None:
    """
    Guard for renaming, retyping, or deleting an existing room.

    Refusals name the room's actual owner rather than saying "not authorized",
    because "who do I ask?" is the only useful next question.
    """
    if user.role == 'admin':
        return

    if user.role not in SCHEDULING_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators, program chairs, and coordinators can manage rooms."
        )

    if room.department_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"{room.name} is a shared campus room, not one your college manages. "
                "Only administrators can change it."
            )
        )

    dept = _user_department(db, user)
    if dept is None or room.department_id != dept.id:
        owner = room.department.code if room.department else "another college"
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{room.name} is managed by {owner}. Only that college can change it."
        )

    if room.type not in LAB_TYPES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Colleges manage laboratories only. Only administrators can change lecture rooms."
        )


@router.get("", response_model=List[schemas.RoomResponse])
def get_rooms(
    skip: int = 0,
    # Was 100. Every department schedules into the same pool, so the list is
    # campus-wide and a hard 100 silently hid rooms once the campus outgrew it.
    limit: int = 500,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    # Deliberately unscoped: a chair must see every shared room to schedule into
    # it, and seeing other colleges' laboratories is what stops two departments
    # registering the same physical room twice. Ownership travels with each row,
    # so the client can tell what it may act on.
    return db.query(models.Room).offset(skip).limit(limit).all()

@router.get("/{room_id}", response_model=schemas.RoomResponse)
def get_room(
    room_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    room = db.query(models.Room).filter(models.Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    return room

@router.post("", response_model=schemas.RoomResponse, status_code=status.HTTP_201_CREATED)
def create_room(
    room: schemas.RoomCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ('admin',) + SCHEDULING_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators, program chairs, and coordinators can manage rooms."
        )

    if room.type not in VALID_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown room type '{room.type}'. Expected one of: {', '.join(VALID_TYPES)}."
        )

    owner_id: Optional[int] = None

    if current_user.role == 'admin':
        # An administrator registers shared campus rooms by default, and may
        # hand a laboratory to a college explicitly.
        if room.department_id is not None:
            dept = db.query(models.Department).filter(
                models.Department.id == room.department_id
            ).first()
            if not dept:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="College not found.")
            if room.type not in LAB_TYPES:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Only laboratories can be assigned to a college. Lecture rooms are shared."
                )
            owner_id = dept.id
    else:
        # A department creates laboratories, and only for itself.
        if room.type not in LAB_TYPES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Colleges can add laboratories only. Lecture rooms are shared campus space -- "
                    "ask an administrator to register one."
                )
            )
        dept = _user_department(db, current_user)
        if dept is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Your account is not assigned to a college, so a laboratory has no owner. Ask an administrator to set one."
            )
        # `room.department_id` from the payload is ignored here on purpose.
        owner_id = dept.id

    db_room = db.query(models.Room).filter(
        models.Room.name == room.name,
        models.Room.building == room.building
    ).first()
    if db_room:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Room already exists in this building")

    new_room = models.Room(
        **{**room.model_dump(exclude={'department_id'}), 'department_id': owner_id}
    )
    db.add(new_room)
    db.commit()
    db.refresh(new_room)

    scope = f"{new_room.department.code} laboratory" if new_room.department else "shared room"
    log_activity(db, current_user.id, "Create Room", f"Created {scope}: {new_room.name}", "success", department_id=owner_id) # type: ignore

    return new_room

@router.put("/{room_id}", response_model=schemas.RoomResponse)
def update_room(
    room_id: int,
    room: schemas.RoomUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_room = db.query(models.Room).filter(models.Room.id == room_id).first()
    if not db_room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    _assert_may_manage(db, current_user, db_room)

    update_data = room.model_dump(exclude_unset=True)

    if 'type' in update_data and update_data['type'] not in VALID_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown room type '{update_data['type']}'. Expected one of: {', '.join(VALID_TYPES)}."
        )

    if current_user.role == 'admin':
        # Reassigning ownership, including handing a laboratory back to the
        # shared pool by passing null.
        if 'department_id' in update_data and update_data['department_id'] is not None:
            dept = db.query(models.Department).filter(
                models.Department.id == update_data['department_id']
            ).first()
            if not dept:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="College not found.")
    else:
        # Ownership is not a chair's to change: reassigning it would either hand
        # their laboratory to another college or take a shared room hostage.
        update_data.pop('department_id', None)
        # Nor is promoting their own laboratory into a shared lecture room.
        if update_data.get('type', db_room.type) not in LAB_TYPES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="A college laboratory cannot be changed into a lecture room. Ask an administrator."
            )

    for key, value in update_data.items():
        setattr(db_room, key, value)

    db.commit()
    db.refresh(db_room)

    log_activity(db, current_user.id, "Update Room", f"Updated room: {db_room.name}", "success", department_id=db_room.department_id) # type: ignore

    return db_room

@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_room(
    room_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_room = db.query(models.Room).filter(models.Room.id == room_id).first()
    if not db_room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    _assert_may_manage(db, current_user, db_room)

    # A departmental laboratory is still schedulable by its own college, and a
    # shared room by everyone. Either way, refuse to delete one that is still in
    # use rather than silently detaching classes from it.
    in_use = db.query(models.Schedule).filter(models.Schedule.room_id == room_id).count()
    if in_use:
        noun = "class" if in_use == 1 else "classes"
        pronoun = "it" if in_use == 1 else "them"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{db_room.name} is used by {in_use} scheduled {noun}. Reassign {pronoun} before deleting the room."
        )

    room_name = db_room.name
    owner_id = db_room.department_id
    db.delete(db_room)
    db.commit()

    log_activity(db, current_user.id, "Delete Room", f"Deleted room: {room_name}", "success", department_id=owner_id) # type: ignore

    return None

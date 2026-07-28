from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from .. import models, schemas, database, auth
from .logs import log_activity

router = APIRouter(
    prefix="/api/rooms",
    tags=["Rooms"]
)

@router.get("", response_model=List[schemas.RoomResponse])
def get_rooms(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
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
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins and program chairs can manage rooms")
        
    db_room = db.query(models.Room).filter(
        models.Room.name == room.name, 
        models.Room.building == room.building
    ).first()
    if db_room:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Room already exists in this building")
        
    new_room = models.Room(**room.model_dump())
    db.add(new_room)
    db.commit()
    db.refresh(new_room)
    
    log_activity(db, current_user.id, "Create Room", f"Created room: {new_room.name}", "success") # type: ignore
    
    return new_room

@router.put("/{room_id}", response_model=schemas.RoomResponse)
def update_room(
    room_id: int, 
    room: schemas.RoomUpdate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins and program chairs can manage rooms")
        
    db_room = db.query(models.Room).filter(models.Room.id == room_id).first()
    if not db_room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
        
    update_data = room.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_room, key, value)
        
    db.commit()
    db.refresh(db_room)
    
    log_activity(db, current_user.id, "Update Room", f"Updated room: {db_room.name}", "success") # type: ignore
    
    return db_room

@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_room(
    room_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins and program chairs can manage rooms")
        
    db_room = db.query(models.Room).filter(models.Room.id == room_id).first()
    if not db_room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
        
    room_name = db_room.name
    db.delete(db_room)
    db.commit()
    
    log_activity(db, current_user.id, "Delete Room", f"Deleted room: {room_name}", "success")
    
    return None

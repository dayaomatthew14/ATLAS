import os
import shutil
import secrets
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
from .. import models, schemas, database, auth
from .logs import log_activity

router = APIRouter(
    prefix="/api/users",
    tags=["Users"]
)

ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}
MAX_PROFILE_PICTURE_BYTES = 5 * 1024 * 1024  # 5 MB

@router.get("")
def get_users(
    skip: int = 0, 
    limit: int = 100, 
    role: Optional[str] = None,
    department: Optional[str] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair', 'coordinator']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    query = db.query(models.User)
    
    if current_user.role in ['program_chair', 'coordinator']:
        if not current_user.department:
            return []
        query = query.filter(models.User.department == current_user.department)
    elif department:
        query = query.filter(models.User.department == department)
        
    if role:
        query = query.filter(models.User.role == role)
        
    users = query.offset(skip).limit(limit).all()
    result = []
    for u in users:
        user_dict = {
            "id": u.id,
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "name": f"{u.first_name} {u.last_name}",
            "role": u.role,
            "department": u.department,
            "contact_number": u.contact_number,
            "is_verified": u.is_verified,
            "created_at": u.created_at,
        }
        result.append(user_dict)
    
    return result

@router.get("/{user_id}", response_model=schemas.UserResponse)
def get_user(
    user_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        
    if current_user.role in ['program_chair', 'coordinator']:
        if user.department != current_user.department:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this user")
    elif current_user.role not in ['admin'] and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
            
    return user

@router.post("", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user: schemas.UserCreate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair', 'coordinator']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    if current_user.role in ['program_chair', 'coordinator']:
        if user.department != current_user.department:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only create users in your department")
        if user.role not in ['program_chair', 'coordinator']:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot create users with this role")
            
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
        
    # UserCreate carries a plaintext `password`; the model stores `password_hash`.
    # Passing the raw dict through made every call to this endpoint a 500.
    user_data = user.model_dump()
    raw_password = user_data.pop('password')
    new_user = models.User(**user_data, password_hash=auth.get_password_hash(raw_password))
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user

@router.put("/{user_id}", response_model=schemas.UserResponse)
def update_user(
    user_id: int, 
    user: schemas.UserUpdate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        
    if current_user.role in ['program_chair', 'coordinator']:
        if db_user.department != current_user.department:
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to modify this user")
        if user.role and user.role not in ['program_chair', 'coordinator']:
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot assign this role")
    elif current_user.role != 'admin' and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    update_data = user.model_dump(exclude_unset=True)

    # Department scoping is what every other permission check keys off, so
    # reassigning it is an administrator action. A chair moving a user into
    # another department would push that account out of their own reach.
    if 'department' in update_data and current_user.role != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can change a user's department."
        )

    for key, value in update_data.items():
        setattr(db_user, key, value)
        
    db.commit()

    db.refresh(db_user)
    return db_user

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if current_user.role in ['program_chair', 'coordinator']:
        if db_user.department != current_user.department:
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this user")
    elif current_user.role != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    # Two guards against locking the institution out of its own system. There is
    # no recovery path if the last administrator goes: accounts come from
    # self-registration and only an administrator can grant the role back.
    if db_user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You cannot delete your own account. Ask another administrator to do it.",
        )

    if db_user.role == 'admin':
        remaining = db.query(models.User).filter(
            models.User.role == 'admin', models.User.id != db_user.id
        ).count()
        if remaining == 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "This is the only administrator account. Promote another user to "
                    "administrator before deleting it."
                ),
            )

    db.delete(db_user)
    db.commit()
    log_activity(
        db, current_user.id, "Delete User",
        f"Deleted account {db_user.email}", "success",
    )
    return None

@router.post("/{user_id}/toggle-verification")
def toggle_user_verification(
    user_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can toggle user verification")
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    db_user.is_verified = not db_user.is_verified # type: ignore
    db.commit()
    db.refresh(db_user)
    return {"id": db_user.id, "is_verified": db_user.is_verified, "msg": f"Verification status updated"}

@router.post("/{user_id}/upload-picture")
async def upload_profile_picture(
    user_id: int, 
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != 'admin' and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        
    # The extension comes from a client-controlled filename, so it is matched
    # against an allow-list rather than trusted. Taking it verbatim allowed
    # path separators through and let an upload escape the profiles directory.
    raw_filename = file.filename or "profile.jpg"
    candidate_ext = raw_filename.rsplit(".", 1)[-1].lower() if "." in raw_filename else ""
    if candidate_ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported image type. Allowed: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}"
        )

    contents = await file.read()
    if len(contents) > MAX_PROFILE_PICTURE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image is too large. Maximum size is {MAX_PROFILE_PICTURE_BYTES // (1024 * 1024)} MB."
        )
    if not contents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty")

    filename = f"user_{user_id}_{os.urandom(4).hex()}.{candidate_ext}"
    file_location = f"uploads/profiles/{filename}"
    os.makedirs("uploads/profiles", exist_ok=True)
    with open(file_location, "wb") as file_object:
        file_object.write(contents)


    # Delete old picture if exists
    if db_user.profile_picture:
        try:
            os.remove(str(db_user.profile_picture))
        except OSError:
            pass
            
    setattr(db_user, 'profile_picture', file_location)
    db.commit()
    db.refresh(db_user)
    
    return {"url": f"/{file_location}"}

@router.post("/change-password")
def change_password(
    payload: schemas.ChangePassword,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if not auth.verify_password(payload.old_password, str(current_user.password_hash)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password"
        )
    setattr(current_user, 'password_hash', auth.get_password_hash(payload.new_password))
    # Invalidate tokens issued before the change, matching what reset-password
    # already did. Without this a stolen token outlived the password it came from.
    current_user.session_version += 1  # type: ignore
    db.commit()
    return {"msg": "Password updated successfully. Please sign in again on your other devices."}

"""
`purge-all-users` was registered here on both POST and DELETE. It ran
`db.query(models.User).delete()` -- every account including the administrator
calling it, with no confirmation and no way back. Whatever it was for during
development, it has no place in a deployed system, so it is gone.
"""


@router.post("/{user_id}/reset-password")
def admin_reset_password(
    user_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Issue a one-time temporary password for a locked-out account.

    The only reset path used to be self-service via an emailed OTP, so a chair
    who had lost access to their inbox could not be helped by anyone. The
    generated password is returned once, is never stored in readable form, and
    every existing session for that account is invalidated.
    """
    if current_user.role != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can reset another user's password.",
        )

    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Long enough to clear the 12-character policy with room to spare.
    temporary = secrets.token_urlsafe(12)
    db_user.password_hash = auth.get_password_hash(temporary)  # type: ignore
    db_user.session_version = (db_user.session_version or 1) + 1  # type: ignore
    db.commit()

    log_activity(
        db, current_user.id, "Reset Password",
        f"Issued a temporary password for {db_user.email}", "success",
    )
    return {
        "temporary_password": temporary,
        "msg": (
            f"Temporary password issued for {db_user.email}. Give it to them directly "
            "and have them change it after signing in. It is shown only once."
        ),
    }

from fastapi import APIRouter, Depends, HTTPException, status, Response, Form
from sqlalchemy.orm import Session
from datetime import timedelta, datetime, timezone
import secrets
import string
import os
from .. import database, models, schemas, auth, notifications
from .logs import log_activity

router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"]
)

def generate_otp():
    return ''.join(secrets.choice(string.digits) for _ in range(6))

@router.post("/login")
def login_for_access_token(
    response: Response, 
    db: Session = Depends(database.get_db), 
    username: str = Form(...), 
    password: str = Form(...),
    remember_me: bool = Form(False)
):
    clean_username = username.strip().lower() if username else ""
    user = db.query(models.User).filter(models.User.email == clean_username).first()
    if not user:
        user = db.query(models.User).filter(models.User.email == username).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    allowed_roles = ['admin', 'program_chair', 'faculty', 'student']
    if user.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Your role is not authorized to use this system."
        )

    if not auth.verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
        )
        
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please check your email for the verification OTP."
        )
    
    access_token_expires = timedelta(days=30) if remember_me else timedelta(hours=auth.ACCESS_TOKEN_EXPIRE_MINUTES/60)
    
    access_token = auth.create_access_token(
        data={"sub": user.email, "sv": user.session_version}, 
        expires_delta=access_token_expires
    )
    
    # Set HttpOnly Cookie
    is_prod = os.getenv("ENV") == "production"
    samesite_val = "none" if is_prod else "lax"
    secure_val = True if is_prod else False

    print(f"DEBUG AUTH: Setting atlas_token cookie for user {user.email} (is_prod={is_prod})")
    response.set_cookie(
        key="atlas_token",
        value=access_token,
        httponly=True,
        secure=secure_val, 
        samesite=samesite_val,
        max_age=30*24*60*60 if remember_me else None
    )
    
    # Get department ID for logging if available
    dept_id = None
    dept_name = user.department
    if user.department:
        dept = db.query(models.Department).filter(
            (models.Department.code == user.department) | 
            (models.Department.name == user.department)
        ).first()
        if dept:
            dept_id = dept.id
            dept_name = dept.name
            
    log_activity(db, user.id, "Login", f"User {user.email} logged in", "success", department_id=dept_id) # type: ignore
    
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "role": user.role,
        "name": f"{user.first_name} {user.last_name}",
        "department": dept_name,
        "profile_picture": user.profile_picture
    }

@router.get("/me", response_model=schemas.UserResponse)
def read_users_me(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    dept = db.query(models.Department).filter(models.Department.code == current_user.department).first()
    dept_name = dept.name if dept else current_user.department
    
    return {
        "id": current_user.id,
        "email": current_user.email,
        "first_name": current_user.first_name,
        "last_name": current_user.last_name,
        "contact_number": current_user.contact_number,
        "role": current_user.role,
        "department": dept_name,
        "sex": current_user.sex,
        "date_of_birth": current_user.date_of_birth,
        "profile_picture": current_user.profile_picture,
        "is_verified": current_user.is_verified,
        "created_at": current_user.created_at
    }

@router.post("/register", response_model=schemas.UserResponse)
def register_user(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = auth.get_password_hash(user.password)
    otp = generate_otp()
    
    db_user = models.User(
        email=str(user.email),
        first_name=str(user.first_name),
        last_name=str(user.last_name),
        contact_number=str(user.contact_number) if user.contact_number else None,
        password_hash=str(hashed_password),
        role=str(user.role),
        department=str(user.department) if user.department else None,
        is_verified=False,
        verification_otp=str(otp)
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    # Automatically provision a private Department workspace for the newly registered chair/dean
    friendly_dept_name = user.department if user.department else "General"
    unique_dept_code = f"DEPT_{db_user.id}"
    
    new_dept = models.Department(
        code=unique_dept_code,
        name=friendly_dept_name,
        description=f"Isolated department workspace for {db_user.first_name} {db_user.last_name} ({friendly_dept_name})",
        owner_id=db_user.id
    )
    db.add(new_dept)
    
    # Update user's department field to the unique department code
    db_user.department = unique_dept_code  # type: ignore
    db.commit()
    db.refresh(db_user)
    
    log_activity(db, db_user.id, "Register", f"New user registered: {db_user.email}", "success") # type: ignore
    
    # Send OTP via Email (Primary)
    notifications.send_email_otp(to_email=user.email, otp=otp, purpose="Verification")
    
    # Also attempt via TextBee/SMS if contact number is available
    if user.contact_number:
        notifications.send_textbee_otp(to_phone=user.contact_number, otp=otp, purpose="Verification")
    
    # Return user details returning the friendly department name to the frontend
    return {
        "id": db_user.id,
        "email": db_user.email,
        "first_name": db_user.first_name,
        "last_name": db_user.last_name,
        "contact_number": db_user.contact_number,
        "role": db_user.role,
        "department": friendly_dept_name,
        "sex": db_user.sex,
        "date_of_birth": db_user.date_of_birth,
        "profile_picture": db_user.profile_picture,
        "is_verified": db_user.is_verified,
        "created_at": db_user.created_at
    }

@router.post("/verify-email")
def verify_email(payload: schemas.VerifyOTP, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.is_verified:
        return {"msg": "User already verified"}
        
    # Allow '123456' as a fallback OTP for testing and development
    if user.verification_otp != payload.otp:
        if payload.otp == "123456":
            pass
        else:
            raise HTTPException(status_code=400, detail="Invalid OTP")
        
    user.is_verified = True # type: ignore
    user.verification_otp = None # type: ignore
    db.commit()
    return {"msg": "Email verified successfully"}

@router.post("/resend-verification")
def resend_verification(payload: schemas.ForgotPassword, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.is_verified:
        return {"msg": "User already verified"}
    
    otp = generate_otp()
    user.verification_otp = str(otp) # type: ignore
    db.commit()
    
    # Send OTP via Email (Primary)
    notifications.send_email_otp(to_email=str(user.email), otp=otp, purpose="Verification")
    
    # Also attempt via TextBee/SMS if contact number is available
    if user.contact_number:
        notifications.send_textbee_otp(to_phone=str(user.contact_number), otp=otp, purpose="Verification")
        
    return {"msg": "Verification code resent successfully"}

@router.post("/forgot-password")
def forgot_password(payload: schemas.ForgotPassword, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    # Always return success to prevent user enumeration
    if user:
        otp = generate_otp()
        user.reset_otp = otp # type: ignore
        user.reset_otp_expiry = datetime.now(timezone.utc) + timedelta(minutes=15) # type: ignore
        db.commit()
        
        # Send OTP via Email (Primary)
        notifications.send_email_otp(to_email=str(user.email), otp=otp, purpose="Password Reset")
        
        # Also attempt via TextBee/SMS if contact number is available
        if user.contact_number:
            notifications.send_textbee_otp(to_phone=str(user.contact_number), otp=otp, purpose="Password Reset")
        
        # Get department for logging
        dept_id = None
        if user.department:
            dept = db.query(models.Department).filter(
                (models.Department.code == user.department) | 
                (models.Department.name == user.department)
            ).first()
            dept_id = dept.id if dept else None
            
        log_activity(db, user.id, "Forgot Password", f"Password reset requested for {user.email}", "success", department_id=dept_id) # type: ignore
    return {"msg": "If this account exists, a reset link or code has been sent."}

@router.post("/reset-password")
def reset_password(payload: schemas.ResetPassword, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    # Allow '123456' as a fallback OTP for testing and development
    if not user or (user.reset_otp != payload.otp and payload.otp != "123456"):
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
        
    if user.reset_otp_expiry and datetime.now(timezone.utc).replace(tzinfo=None) > user.reset_otp_expiry.replace(tzinfo=None):
        raise HTTPException(status_code=400, detail="OTP has expired")
        
    user.password_hash = auth.get_password_hash(payload.new_password) # type: ignore
    user.reset_otp = None # type: ignore
    user.reset_otp_expiry = None # type: ignore
    user.session_version += 1 # type: ignore # Log out all other devices
    db.commit()
    
    # Get department for logging
    dept_id = None
    if user.department:
        dept = db.query(models.Department).filter(
            (models.Department.code == user.department) | 
            (models.Department.name == user.department)
        ).first()
        dept_id = dept.id if dept else None
    
    log_activity(db, user.id, "Reset Password", f"Password reset successfully for {user.email}", "success", department_id=dept_id) # type: ignore
    
    return {"msg": "Password reset successfully"}

@router.post("/logout")
def logout(response: Response):
    is_prod = os.getenv("ENV") == "production"
    samesite_val = "none" if is_prod else "lax"
    secure_val = True if is_prod else False
    response.delete_cookie("atlas_token", samesite=samesite_val, secure=secure_val)
    return {"msg": "Logged out successfully"}

@router.post("/logout-all")
def logout_all(response: Response, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    current_user.session_version += 1 # type: ignore
    db.commit()
    
    dept = db.query(models.Department).filter(
        (models.Department.code == current_user.department) | 
        (models.Department.name == current_user.department)
    ).first()
    log_activity(db, current_user.id, "Logout All", "User logged out of all devices", "success", department_id=dept.id if dept else None) # type: ignore
    
    is_prod = os.getenv("ENV") == "production"
    samesite_val = "none" if is_prod else "lax"
    secure_val = True if is_prod else False
    response.delete_cookie("atlas_token", samesite=samesite_val, secure=secure_val)
    return {"msg": "Logged out of all devices successfully"}

@router.get("/seed")
def seed_admin(db: Session = Depends(database.get_db)):
    admin = db.query(models.User).filter(models.User.email == "admin@dlsau.edu.ph").first()
    if not admin:
        hashed = auth.get_password_hash("password123")
        new_admin = models.User(
            first_name="System",
            last_name="Administrator",
            email="admin@dlsau.edu.ph",
            password_hash=hashed,
            role="admin",
            department=None,
            is_verified=True
        )
        db.add(new_admin)
        db.commit()
        return {"msg": "Admin created"}
    else:
        return {"msg": "Admin already exists"}

@router.get("/clear-all-users")
def clear_all_users(db: Session = Depends(database.get_db)):
    """Temporary endpoint to clear all user accounts and reset the database for testing."""
    count = db.query(models.User).count()
    
    # Clear all dependent tables in correct dependency order
    db.query(models.Conflict).delete()
    db.query(models.Schedule).delete()
    db.query(models.SubjectOffering).delete()
    db.query(models.FacultyUnavailability).delete()
    db.query(models.Faculty).delete()
    db.query(models.Curriculum).delete()
    db.query(models.CurriculumBlock).delete()
    db.query(models.AIRule).delete()
    db.query(models.Department).delete()
    db.query(models.SystemLog).delete()
    db.query(models.User).delete()
    
    db.commit()
    return {"msg": f"Deleted {count} user accounts and reset all database tables successfully."}

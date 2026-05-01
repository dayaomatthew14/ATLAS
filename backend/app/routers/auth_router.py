from fastapi import APIRouter, Depends, HTTPException, status, Response, Form
from sqlalchemy.orm import Session
from datetime import timedelta, datetime, timezone
import secrets
import string
from .. import database, models, schemas, auth, notifications

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
    user = db.query(models.User).filter(models.User.email == username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
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
    print(f"DEBUG AUTH: Setting atlas_token cookie for user {user.email}")
    response.set_cookie(
        key="atlas_token",
        value=access_token,
        httponly=True,
        secure=False, 
        samesite="lax",
        max_age=30*24*60*60 if remember_me else None
    )
    
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "role": user.role,
        "name": f"{user.first_name} {user.last_name}",
        "department": user.department
    }

@router.get("/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user

@router.post("/register", response_model=schemas.UserResponse)
def register_user(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = auth.get_password_hash(user.password)
    otp = generate_otp()
    
    db_user = models.User(
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        contact_number=user.contact_number,
        password_hash=hashed_password,
        role=user.role,
        department=user.department,
        is_verified=False,
        verification_otp=otp
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    # Send OTP via TextBee (Primary) and fallback to SMTP if configured
    textbee_sent = notifications.send_textbee_otp(to_phone=user.contact_number, otp=otp, purpose="Verification")
    
    if not textbee_sent:
        notifications.send_email_otp(to_email=user.email, otp=otp, purpose="Verification")
        if user.contact_number:
            notifications.send_sms_otp(to_phone=user.contact_number, otp=otp, purpose="Verification")
    
    return db_user

@router.post("/verify-email")
def verify_email(payload: schemas.VerifyOTP, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.is_verified:
        return {"msg": "User already verified"}
        
    if user.verification_otp != payload.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")
        
    user.is_verified = True
    user.verification_otp = None
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
    user.verification_otp = otp
    db.commit()
    
    # Send OTP via TextBee (Primary) and fallback
    textbee_sent = notifications.send_textbee_otp(to_phone=user.contact_number, otp=otp, purpose="Verification")
    
    email_sent = False
    sms_sent = False
    
    if not textbee_sent:
        email_sent = notifications.send_email_otp(to_email=user.email, otp=otp, purpose="Verification")
        if user.contact_number:
            sms_sent = notifications.send_sms_otp(to_phone=user.contact_number, otp=otp, purpose="Verification")
        
    if not textbee_sent and not email_sent and not sms_sent:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send verification code. Please check server logs."
        )
        
    return {"msg": "Verification code resent successfully"}

@router.post("/forgot-password")
def forgot_password(payload: schemas.ForgotPassword, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    # Always return success to prevent user enumeration
    if user:
        otp = generate_otp()
        user.reset_otp = otp
        user.reset_otp_expiry = datetime.now(timezone.utc) + timedelta(minutes=15)
        db.commit()
        
        # Send OTP via TextBee (Primary) and fallback
        textbee_sent = notifications.send_textbee_otp(to_phone=user.contact_number, otp=otp, purpose="Password Reset")
        
        if not textbee_sent:
            notifications.send_email_otp(to_email=user.email, otp=otp, purpose="Password Reset")
            if user.contact_number:
                notifications.send_sms_otp(to_phone=user.contact_number, otp=otp, purpose="Password Reset")
        
    return {"msg": "If this account exists, a reset link or code has been sent."}

@router.post("/reset-password")
def reset_password(payload: schemas.ResetPassword, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or user.reset_otp != payload.otp:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
        
    if user.reset_otp_expiry and datetime.now(timezone.utc).replace(tzinfo=None) > user.reset_otp_expiry.replace(tzinfo=None):
        raise HTTPException(status_code=400, detail="OTP has expired")
        
    user.password_hash = auth.get_password_hash(payload.new_password)
    user.reset_otp = None
    user.reset_otp_expiry = None
    user.session_version += 1 # Log out all other devices
    db.commit()
    
    return {"msg": "Password reset successfully"}

@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("atlas_token", samesite="lax", secure=False)
    return {"msg": "Logged out successfully"}

@router.post("/logout-all")
def logout_all(response: Response, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    current_user.session_version += 1
    db.commit()
    response.delete_cookie("atlas_token", samesite="lax", secure=False)
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

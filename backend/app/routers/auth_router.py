from fastapi import APIRouter, Depends, HTTPException, status, Response, Form, Request
from sqlalchemy.orm import Session
from datetime import timedelta, datetime, timezone
import secrets
import string
import os
from .. import database, models, schemas, auth, notifications, rate_limit
from .logs import log_activity

router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"]
)

"""
`reset-all-users` / `clear-all-users` were registered here.

One handler, two paths, three methods each -- including **GET**. It ran
`TRUNCATE TABLE users CASCADE`, falling back to deleting every User row, and
returned "All users purged successfully". Because GET was accepted, any link
follow, browser prefetch or crawler hitting that URL while an administrator
session was live would empty the users table and cascade through everything
referencing it. Destructive operations are never safe on GET; this one should
not exist at all, so it does not.
"""

def generate_otp():
    return ''.join(secrets.choice(string.digits) for _ in range(6))


# A six-digit code has a million values, which is only a meaningful secret while
# the number of guesses is bounded. Nothing bounded them: verify-email and
# reset-password compared the code and returned, so the entire space was
# reachable by anyone willing to keep asking. Passing the limit discards the
# code rather than locking the account -- the legitimate owner asks for another,
# and an attacker is made to start over on a fresh unknown value each time.
MAX_OTP_ATTEMPTS = 5

# Verification codes are read out of an inbox, sometimes hours later, so they
# get a generous life. Reset codes already expire in 15 minutes.
VERIFICATION_OTP_TTL = timedelta(hours=24)

# Sign-in throttling. High enough that a person mistyping their password a few
# times is unaffected, low enough that guessing is not a practical strategy.
MAX_LOGIN_ATTEMPTS = 8
LOGIN_LOCKOUT = timedelta(minutes=15)


def _naive_utc_now():
    """
    The comparison side of the stored timestamps.

    Columns are DateTime without timezone, and rows written before this existed
    hold naive values, so comparing an aware `now` against them raises. The
    existing reset-code check strips tzinfo for the same reason.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _as_naive(value):
    return value.replace(tzinfo=None) if value and value.tzinfo else value


def register_otp_failure(db: Session, user: models.User) -> int:
    """
    Count a wrong code and discard it once the limit is reached.

    Returns the attempts recorded. The counter is nullable because the startup
    schema sync adds columns without backfilling, so an existing row arrives
    NULL and has to read as zero.
    """
    attempts = (user.otp_attempts or 0) + 1
    user.otp_attempts = attempts  # type: ignore

    if attempts >= MAX_OTP_ATTEMPTS:
        user.verification_otp = None  # type: ignore
        user.verification_otp_expiry = None  # type: ignore
        user.reset_otp = None  # type: ignore
        user.reset_otp_expiry = None  # type: ignore
        user.otp_attempts = 0  # type: ignore

    db.commit()
    return attempts


def clear_otp_state(user: models.User):
    """Called when a code is issued or accepted, so tries start from zero."""
    user.otp_attempts = 0  # type: ignore


# Sending a code is not free. Each one spends a message from a shared daily
# email allowance -- a Google Apps Script backed by a Gmail account tops out
# around a hundred a day -- so an unbounded resend lets a single address drain
# the pool for everybody, and lets anyone who knows an email address bury its
# owner in codes. Neither needs an attacker; an impatient user clicking resend
# is enough.
OTP_RESEND_COOLDOWN = timedelta(seconds=60)
MAX_OTP_SENDS_PER_DAY = 5
OTP_SEND_WINDOW = timedelta(hours=24)


def otp_send_blocked(user: models.User):
    """
    Whether a code may be sent to this account now.

    Returns None when sending is allowed, otherwise a message explaining the
    wait. Callers decide what to do with that: an endpoint that already reveals
    whether an account exists can say it, and one that deliberately does not
    must stay silent and simply not send.
    """
    now = _naive_utc_now()

    window_start = _as_naive(user.otp_send_window_start)
    if window_start and now - window_start < OTP_SEND_WINDOW:
        if (user.otp_sends_today or 0) >= MAX_OTP_SENDS_PER_DAY:
            hours = int((OTP_SEND_WINDOW - (now - window_start)).total_seconds() // 3600) + 1
            return (
                f"Too many codes requested for this account. Try again in about "
                f"{hours} hour{'s' if hours != 1 else ''}, or ask an administrator."
            )

    last_sent = _as_naive(user.otp_sent_at)
    if last_sent and now - last_sent < OTP_RESEND_COOLDOWN:
        seconds = int((OTP_RESEND_COOLDOWN - (now - last_sent)).total_seconds()) + 1
        return f"A code was just sent. Wait {seconds} seconds before requesting another."

    return None


def record_otp_send(user: models.User):
    """
    Count a code against this account's cooldown and daily allowance.

    Recorded before the send is attempted rather than after, so a burst of
    concurrent requests cannot all pass the check while none has been counted.
    """
    now = _naive_utc_now()
    window_start = _as_naive(user.otp_send_window_start)

    if not window_start or now - window_start >= OTP_SEND_WINDOW:
        user.otp_send_window_start = now  # type: ignore
        user.otp_sends_today = 1  # type: ignore
    else:
        user.otp_sends_today = (user.otp_sends_today or 0) + 1  # type: ignore

    user.otp_sent_at = now  # type: ignore


def refund_otp_send(user: models.User):
    """
    Give back a daily send that never actually went anywhere.

    The daily ceiling exists to protect a shared email allowance, and a delivery
    that failed consumed none of it. Charging for it would let a broken
    transport lock a user out of the very codes they need -- five failures and
    they are done for the day, having received nothing.

    The cooldown is deliberately not refunded: it is there to stop hammering,
    and a caller retrying a failing send is exactly what it should slow down.
    """
    user.otp_sends_today = max((user.otp_sends_today or 1) - 1, 0)  # type: ignore

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

    # Refuse before checking the password, so a locked account costs an attacker
    # a wait rather than another guess.
    locked_until = _as_naive(user.login_locked_until)
    if locked_until and _naive_utc_now() < locked_until:
        remaining = int((locked_until - _naive_utc_now()).total_seconds() // 60) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Too many failed sign-in attempts. Try again in {remaining} minute"
                f"{'s' if remaining != 1 else ''}, or reset your password."
            ),
        )

    # Auto-heal role string if created under legacy schema or invalid text
    user_role = (str(user.role or "")).strip().lower()
    if user_role not in ['admin', 'program_chair', 'coordinator']:
        dept_str = (user.department or '').lower()
        if any(keyword in dept_str for keyword in ['language', 'math', 'nstp', 'human', 'societal']):
            setattr(user, 'role', 'coordinator')
        else:
            setattr(user, 'role', 'program_chair')
        db.commit()
        db.refresh(user)

    if not auth.verify_password(password, user.password_hash):
        # The lock is on the account, not the connection, so it is not defeated
        # by rotating source addresses. That does mean a third party can lock
        # someone out by guessing at them; the window is deliberately short, and
        # a password reset clears it immediately.
        attempts = (user.failed_login_attempts or 0) + 1
        user.failed_login_attempts = attempts  # type: ignore
        if attempts >= MAX_LOGIN_ATTEMPTS:
            user.login_locked_until = _naive_utc_now() + LOGIN_LOCKOUT  # type: ignore
            user.failed_login_attempts = 0  # type: ignore
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"Too many failed sign-in attempts. Try again in "
                    f"{int(LOGIN_LOCKOUT.total_seconds() // 60)} minutes, or reset your password."
                ),
            )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
        )

    # A correct password clears the record, so occasional mistyping across weeks
    # never accumulates into a lockout.
    if user.failed_login_attempts or user.login_locked_until:
        user.failed_login_attempts = 0  # type: ignore
        user.login_locked_until = None  # type: ignore
        db.commit()


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
    
    # `department` carries the college CODE, not its name. The frontend keys
    # every lookup -- the context-bar chip, the college hue, the display name --
    # off the code, so returning "College of Arts, Sciences & Technology" here
    # resolved to "Unassigned workspace" on screen. The readable name travels
    # alongside it rather than in place of it.
    dept_id = None
    dept_code = user.department
    dept_name = user.department
    if user.department:
        dept = db.query(models.Department).filter(
            (models.Department.code == user.department) |
            (models.Department.name == user.department)
        ).first()
        if dept:
            dept_id = dept.id
            dept_code = dept.code
            dept_name = dept.name
            
    log_activity(db, user.id, "Login", f"User {user.email} logged in", "success", department_id=dept_id) # type: ignore
    
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "role": user.role,
        "name": f"{user.first_name} {user.last_name}",
        "department": dept_code,
        "department_name": dept_name,
        "profile_picture": user.profile_picture
    }

@router.get("/me", response_model=schemas.UserResponse)
def read_users_me(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    dept = db.query(models.Department).filter(models.Department.code == current_user.department).first()
    # Same rule as sign-in: the code identifies, the name is for reading.
    dept_name = dept.name if dept else current_user.department
    
    return {
        "id": current_user.id,
        "email": current_user.email,
        "first_name": current_user.first_name,
        "last_name": current_user.last_name,
        "contact_number": current_user.contact_number,
        "role": current_user.role,
        "department": current_user.department,
        "department_name": dept_name,
        "sex": current_user.sex,
        "date_of_birth": current_user.date_of_birth,
        "profile_picture": current_user.profile_picture,
        "is_verified": current_user.is_verified,
        "created_at": current_user.created_at
    }

@router.post("/register", response_model=schemas.RegistrationResponse)
def register_user(
    request: Request,
    user: schemas.UserCreate,
    db: Session = Depends(database.get_db),
):
    # Registration is the one send path with no account to count against -- the
    # request is what creates the account -- so the caller is what gets counted.
    # Checked before any work, so a script cannot spend database writes or email
    # allowance on rejected attempts.
    retry_after = rate_limit.registration_limiter.check(rate_limit.client_key(request))
    if retry_after is not None:
        minutes = max(retry_after // 60, 1)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Too many accounts created from this connection. "
                f"Try again in about {minutes} minute{'s' if minutes != 1 else ''}."
            ),
            headers={"Retry-After": str(retry_after)},
        )

    # This endpoint is public, so the requested role must never be trusted.
    # Administrator accounts are provisioned server-side only.
    if user.role not in schemas.SELF_REGISTRATION_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Self-registration is limited to "
                f"{' and '.join(sorted(schemas.SELF_REGISTRATION_ROLES))} accounts. "
                "Administrator accounts must be created by an existing administrator."
            )
        )

    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # The college must already exist. Registration used to mint a private
    # `DEPT_{id}` workspace per account, which is how three separate rows all
    # came to mean CAST and how `users.department` came to hold a code that
    # matched no record. Colleges are institutional now: you join one.
    requested = (user.department or "").strip().upper()
    college = db.query(models.Department).filter(models.Department.code == requested).first()
    if college is None:
        known = [c.code for c in db.query(models.Department).order_by(models.Department.code).all()]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Select a college. Choose one of: {', '.join(known)}."
        )

    hashed_password = auth.get_password_hash(user.password)
    otp = generate_otp()

    db_user = models.User(
        email=str(user.email),
        first_name=str(user.first_name),
        last_name=str(user.last_name),
        contact_number=str(user.contact_number) if user.contact_number else None,
        password_hash=str(hashed_password),
        role=str(user.role),
        department=college.code,
        is_verified=False,
        verification_otp=str(otp),
        verification_otp_expiry=_naive_utc_now() + VERIFICATION_OTP_TTL,
        otp_attempts=0,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)


    log_activity(db, db_user.id, "Register", f"New user registered: {db_user.email}", "success") # type: ignore
    
    # Delivery is reported back rather than assumed. An account whose code never
    # arrived cannot be verified and cannot be signed into, so "we could not
    # send it" is the single most useful thing to say at that moment -- the
    # alternative is a user waiting for a message that is not coming.
    sent = notifications.deliver_otp(user.email, user.contact_number, otp, "Verification")
    email_sent, sms_sent = sent["email"], sent["sms"]

    if not sent["delivered"]:
        log_activity(
            db, db_user.id, "Register",
            f"Verification code could not be delivered to {db_user.email}", "warning",
        )  # type: ignore

    # Return user details returning the friendly department name to the frontend
    return {
        "verification_sent": bool(email_sent or sms_sent),
        "verification_channels": {"email": bool(email_sent), "sms": bool(sms_sent)},
        "id": db_user.id,
        "email": db_user.email,
        "first_name": db_user.first_name,
        "last_name": db_user.last_name,
        "contact_number": db_user.contact_number,
        "role": db_user.role,
        "department": college.code,
        "department_name": college.name,
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

    if not user.verification_otp:
        raise HTTPException(
            status_code=400,
            detail="No verification code is outstanding. Request a new one.",
        )

    # A code with no recorded expiry predates the column and is treated as
    # expired rather than valid, the same way an unexpiring reset code is.
    expiry = _as_naive(user.verification_otp_expiry)
    if not expiry or _naive_utc_now() > expiry:
        user.verification_otp = None  # type: ignore
        user.verification_otp_expiry = None  # type: ignore
        clear_otp_state(user)
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="That code has expired. Request a new one.",
        )

    if not secrets.compare_digest(str(user.verification_otp), str(payload.otp)):
        attempts = register_otp_failure(db, user)
        remaining = MAX_OTP_ATTEMPTS - attempts
        if remaining <= 0:
            raise HTTPException(
                status_code=400,
                detail="Too many incorrect codes. That code is no longer valid — request a new one.",
            )
        raise HTTPException(status_code=400, detail="Invalid OTP")

    user.is_verified = True # type: ignore
    user.verification_otp = None # type: ignore
    user.verification_otp_expiry = None # type: ignore
    clear_otp_state(user)
    db.commit()
    return {"msg": "Email verified successfully"}

@router.post("/resend-verification")
def resend_verification(payload: schemas.ResendVerification, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_verified:
        return {"msg": "User already verified"}

    # Asking for SMS when no number is on file is a dead end worth naming, since
    # the alternative is a generic "could not send" that reads as a fault.
    if payload.channel == "sms" and not user.contact_number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No mobile number is on file for this account, so a text cannot be sent.",
        )


    # This endpoint already answers 404 for an unknown address, so it reveals
    # nothing further by explaining the wait.
    blocked = otp_send_blocked(user)
    if blocked:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=blocked)

    otp = generate_otp()
    user.verification_otp = str(otp) # type: ignore
    user.verification_otp_expiry = _naive_utc_now() + VERIFICATION_OTP_TTL # type: ignore
    # A fresh code starts with a fresh allowance, so someone who mistyped the
    # last one is not still paying for it against this one.
    clear_otp_state(user)
    record_otp_send(user)
    db.commit()

    sent = notifications.deliver_otp(
        str(user.email), user.contact_number, otp, "Verification", channel=payload.channel
    )
    email_sent, sms_sent = sent["email"], sent["sms"]

    # The address is one the caller just supplied, so saying whether it reached
    # them reveals nothing they do not know and saves them resending forever.
    if not sent["delivered"]:
        refund_otp_send(user)
        db.commit()
        detail = (
            "The code could not be sent by text. Check the number on file, or ask "
            "an administrator to verify the account."
            if payload.channel == "sms" else
            "The verification code could not be sent. Ask an administrator "
            "to verify the account, or try again once delivery is restored."
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)

    return {
        "msg": "Verification code resent successfully",
        "channels": {"email": bool(email_sent), "sms": bool(sms_sent)},
    }

@router.post("/forgot-password")
def forgot_password(payload: schemas.ForgotPassword, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    # Always return success to prevent user enumeration
    # The throttle applies here too, but silently. Answering "wait 60 seconds"
    # only for real accounts would turn this endpoint into an existence oracle,
    # which is the one thing its uniform reply exists to prevent. A caller who
    # is rate limited gets the same sentence as everyone else; they simply do
    # not get a second message.
    if user and otp_send_blocked(user):
        print(f"[RATE LIMIT] Suppressed password reset send for {user.email}")
        user = None

    if user:
        otp = generate_otp()
        user.reset_otp = otp # type: ignore
        user.reset_otp_expiry = datetime.now(timezone.utc) + timedelta(minutes=15) # type: ignore
        clear_otp_state(user)
        record_otp_send(user)
        db.commit()
        
        sent = notifications.deliver_otp(str(user.email), user.contact_number, otp, "Password Reset")

        # Deliberately not surfaced to the caller. This endpoint answers
        # identically whether or not the address belongs to an account, and a
        # "could not send" that appeared only for real users would undo that.
        # The failure is recorded where an administrator will see it instead.
        if not sent["delivered"]:
            refund_otp_send(user)
            db.commit()
            print(f"[ERROR] Password reset code could not be delivered to {user.email}")


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
    if not user or not user.reset_otp:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    # A reset code with no expiry recorded is treated as expired rather than valid.
    if not user.reset_otp_expiry:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    if datetime.now(timezone.utc).replace(tzinfo=None) > user.reset_otp_expiry.replace(tzinfo=None):
        raise HTTPException(status_code=400, detail="OTP has expired")

    # Counted after the existence and expiry checks so a wrong code against a
    # live reset is what burns an attempt, and before the password is changed so
    # a guessing run exhausts the code rather than eventually landing on it.
    if not secrets.compare_digest(str(user.reset_otp), str(payload.otp)):
        attempts = register_otp_failure(db, user)
        if MAX_OTP_ATTEMPTS - attempts <= 0:
            raise HTTPException(
                status_code=400,
                detail="Too many incorrect codes. That code is no longer valid — request a new one.",
            )
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    user.password_hash = auth.get_password_hash(payload.new_password) # type: ignore
    user.reset_otp = None # type: ignore
    user.reset_otp_expiry = None # type: ignore
    clear_otp_state(user)
    # A password reset is also the way back in after a lockout.
    user.failed_login_attempts = 0 # type: ignore
    user.login_locked_until = None # type: ignore
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

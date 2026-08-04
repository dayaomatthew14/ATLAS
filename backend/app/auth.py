import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from dotenv import load_dotenv
from . import database, models, schemas

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY is not set. Tokens signed with a known default can be forged by "
        "anyone, so the application refuses to start without it. Generate one with:\n"
        '  python -c "import secrets; print(secrets.token_urlsafe(64))"\n'
        "then set it in backend/.env (see backend/.env.example)."
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480 # 8 hours

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(request: Request, db: Session = Depends(database.get_db)):
    token = request.cookies.get("atlas_token")
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    
    if not token:
        print("DEBUG AUTH: No token found in cookies or headers")
        raise credentials_exception

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        session_version: int = payload.get("sv")
        if email is None:
            print(f"DEBUG AUTH: Email missing in payload for token: {token[:10]}...")
            raise credentials_exception
        token_data = schemas.TokenData(email=email)
    except JWTError as e:
        print(f"DEBUG AUTH: JWT Decode Error: {str(e)} for token: {token[:10]}...")
        raise credentials_exception
        
    user = db.query(models.User).filter(models.User.email == token_data.email).first()
    if user is None:
        print(f"DEBUG AUTH: User not found in DB: {token_data.email}")
        raise credentials_exception
        
    if session_version is not None and user.session_version != session_version:
        print(f"DEBUG AUTH: Session version mismatch: DB={user.session_version}, Token={session_version}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalidated. Please log in again."
        )
        
    return user

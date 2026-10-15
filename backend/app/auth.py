import logging
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

logger = logging.getLogger(__name__)

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
    """
    Resolve the caller from an explicit Authorization header, then the cookie.

    The order matters and used to be the other way round. A cookie is ambient:
    the browser attaches it to every request whether or not the caller meant to
    use it. An Authorization header is deliberate -- something put it there for
    this request. Letting the ambient credential win means a request that states
    who it is can be answered as somebody else, which is both wrong and very
    hard to see: the reply is a valid 200 for the wrong user, not an error.

    The cookie remains the fallback, because it is what the browser app relies
    on and clearing it is the only thing that ends a session.
    """
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1].strip() or None

    if not token:
        token = request.cookies.get("atlas_token")


    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    
    # These paths used to print to stdout on every failure, including the first
    # ten characters of the bearer token and the account's email address. Both
    # went straight to the deployment's log stream: a token prefix is part of a
    # live credential, and an email is personal data. What is useful to an
    # operator is that authentication failed and roughly why -- never the value
    # that failed. Logged at debug, so production stays quiet by default.
    if not token:
        logger.debug("Auth rejected: no token in cookies or Authorization header")
        raise credentials_exception

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        session_version: int = payload.get("sv")
        if email is None:
            logger.debug("Auth rejected: token payload carries no subject")
            raise credentials_exception
        token_data = schemas.TokenData(email=email)
    except JWTError:
        logger.debug("Auth rejected: token failed to decode")
        raise credentials_exception

    user = db.query(models.User).filter(models.User.email == token_data.email).first()
    if user is None:
        logger.debug("Auth rejected: token subject matches no account")
        raise credentials_exception

    if session_version is not None and user.session_version != session_version:
        logger.debug("Auth rejected: session version does not match the account")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalidated. Please log in again."
        )
        
    return user

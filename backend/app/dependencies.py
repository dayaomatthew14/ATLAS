from fastapi import Depends, HTTPException, status
from . import models, auth

def require_admin(current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Operation restricted to Administrators."
        )
    return current_user

def require_program_chair(current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Operation restricted to Program Chairs or Administrators."
        )
    return current_user

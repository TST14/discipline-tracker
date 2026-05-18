import os
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import APIRouter, HTTPException, status
from jose import jwt
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["auth"])

SECRET_KEY = os.getenv("JWT_SECRET", "change-me-in-production")
ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 30

# Bcrypt hash of your password — set AUTH_PASSWORD_HASH env var on Render.
# Generate it once with:  python -c "import bcrypt; print(bcrypt.hashpw(b'YOUR_PASSWORD', bcrypt.gensalt()).decode())"
_PASSWORD_HASH = os.getenv("AUTH_PASSWORD_HASH", "")


class LoginRequest(BaseModel):
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    if not _PASSWORD_HASH or not bcrypt.checkpw(body.password.encode(), _PASSWORD_HASH.encode()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
        )
    expire = datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRE_DAYS)
    token = jwt.encode(
        {"sub": "owner", "exp": expire},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )
    return TokenResponse(access_token=token)

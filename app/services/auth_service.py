from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from jose import jwt, JWTError
from passlib.context import CryptContext

from app.config import settings
from app.core.ids import new_id
from app.models.db.user import User
from app.models.schemas.user import UserCreate
from app.repositories.user_repo import UserRepository
from app.repositories.sme_repo import SMERepository

_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return _pwd_ctx.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return _pwd_ctx.verify(password, hashed)


def issue_jwt(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user.id,
        "email": user.email,
        "is_admin": user.is_admin,
        "is_sme": user.is_sme,
        "sme_id": user.sme_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.jwt_expire_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_jwt(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise HTTPException(
            status_code=401,
            detail={"error": f"Invalid token: {exc}", "code": "INVALID_TOKEN"},
        )


class AuthService:
    def __init__(self, user_repo: UserRepository, sme_repo: SMERepository):
        self.user_repo = user_repo
        self.sme_repo = sme_repo

    async def register(self, data: UserCreate) -> User:
        existing = await self.user_repo.get_by_email(data.email)
        if existing:
            raise HTTPException(
                status_code=409,
                detail={"error": f"Email '{data.email}' already registered", "code": "EMAIL_TAKEN"},
            )
        if data.is_sme:
            if not data.sme_id:
                raise HTTPException(
                    status_code=400,
                    detail={"error": "is_sme=true requires sme_id", "code": "SME_ID_REQUIRED"},
                )
            sme = await self.sme_repo.get_by_id(data.sme_id)
            if not sme:
                raise HTTPException(
                    status_code=404,
                    detail={"error": f"SME '{data.sme_id}' not found", "code": "NOT_FOUND"},
                )
        user = User(
            id=new_id("user"),
            email=data.email,
            password_hash=hash_password(data.password),
            is_admin=data.is_admin,
            is_sme=data.is_sme,
            sme_id=data.sme_id if data.is_sme else None,
        )
        return await self.user_repo.create(user)

    async def authenticate(self, email: str, password: str) -> User:
        user = await self.user_repo.get_by_email(email)
        if not user or not verify_password(password, user.password_hash):
            raise HTTPException(
                status_code=401,
                detail={"error": "Invalid email or password", "code": "INVALID_CREDENTIALS"},
            )
        return user

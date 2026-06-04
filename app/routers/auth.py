from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_admin
from app.core.errors import raise_forbidden
from app.db.session import get_db
from app.models.db.user import User
from app.models.schemas.user import (
    CurrentUser, TokenResponse, UserCreate, UserLogin, UserResponse,
)
from app.repositories.sme_repo import SMERepository
from app.repositories.user_repo import UserRepository
from app.services.auth_service import AuthService, issue_jwt

router = APIRouter()


def _to_response(user: User) -> UserResponse:
    return UserResponse(
        user_id=user.id,
        email=user.email,
        is_admin=user.is_admin,
        is_sme=user.is_sme,
        sme_id=user.sme_id,
        created_at=user.created_at.isoformat(),
    )


@router.post("/auth/register", status_code=201, response_model=UserResponse)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    """Open registration for regular users. Creating an admin or SME-linked user
    requires the caller to already be an admin (or use the service token)."""
    if data.is_admin or data.is_sme:
        try:
            from fastapi.security import HTTPBearer
            # We need to enforce admin caller for elevated registrations.
            # Easiest path: pull caller via a separate dependency-injected route.
            pass
        except Exception:
            pass
    # Elevated registration check is delegated to the dedicated endpoint below.
    if data.is_admin or data.is_sme:
        raise_forbidden(
            "Use POST /auth/register/elevated (admin-only) to create admin or SME-linked users"
        )
    service = AuthService(UserRepository(db), SMERepository(db))
    user = await service.register(data)
    return _to_response(user)


@router.post("/auth/register/elevated", status_code=201, response_model=UserResponse)
async def register_elevated(
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
    _admin: CurrentUser = Depends(require_admin),
):
    """Admin-only: create users with is_admin=true or is_sme=true (with sme_id)."""
    service = AuthService(UserRepository(db), SMERepository(db))
    user = await service.register(data)
    return _to_response(user)


@router.post("/auth/login", response_model=TokenResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    service = AuthService(UserRepository(db), SMERepository(db))
    user = await service.authenticate(data.email, data.password)
    token = issue_jwt(user)
    return TokenResponse(access_token=token, user=_to_response(user))


@router.get("/auth/me", response_model=CurrentUser)
async def me(user: CurrentUser = Depends(get_current_user)):
    return user

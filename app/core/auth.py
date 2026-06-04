"""Authentication & authorization dependencies.

Two acceptable bearer tokens:
  1. JWT issued by /auth/login (regular users)
  2. The shared BENCHMARK_API_KEY (treated as a synthetic admin "service token")
     — keeps the existing benchmark evaluator and Postman collection working
     without requiring login.

Usage in routers:
  - Authenticated reads:  user = Depends(get_current_user)
  - Admin-only:           user = Depends(require_admin)
  - SME owner or admin:   user = Depends(require_sme_owner_or_admin)
                          (reads `sme_id` path param)
  - Entry owner or admin: user = Depends(require_entry_owner_or_admin)
                          (reads `entry_id` path param, loads entry to get sme_id)
"""
from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.errors import raise_forbidden, raise_not_found
from app.db.session import get_db
from app.models.schemas.user import CurrentUser
from app.repositories.knowledge_repo import KnowledgeRepository
from app.repositories.user_repo import UserRepository
from app.services.auth_service import decode_jwt

_security = HTTPBearer()

_SERVICE_USER = CurrentUser(
    id="service",
    email=None,
    is_admin=True,
    is_sme=False,
    sme_id=None,
    is_service_token=True,
)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(_security),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    """Resolve the bearer token to a CurrentUser. Accepts JWT or service token."""
    token = credentials.credentials

    # Service token short-circuit (admin-equivalent)
    if token == settings.benchmark_api_key:
        return _SERVICE_USER

    # JWT path
    payload = decode_jwt(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=401,
            detail={"error": "Token missing subject", "code": "INVALID_TOKEN"},
        )
    # Re-load from DB so role changes (admin/sme grants) take effect immediately
    user = await UserRepository(db).get_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=401,
            detail={"error": "User no longer exists", "code": "USER_NOT_FOUND"},
        )
    return CurrentUser(
        id=user.id,
        email=user.email,
        is_admin=user.is_admin,
        is_sme=user.is_sme,
        sme_id=user.sme_id,
        is_service_token=False,
    )


async def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not user.is_admin:
        raise_forbidden("Admin role required")
    return user


async def require_sme_owner_or_admin(
    sme_id: str,
    user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """For routes scoped to a specific SME (path param `sme_id`).

    Admins and the service token always pass. Otherwise the user must be an SME
    linked to the given sme_id.
    """
    if user.is_admin:
        return user
    if user.is_sme and user.sme_id == sme_id:
        return user
    raise_forbidden(f"Not allowed to act on SME '{sme_id}'")


async def require_entry_owner_or_admin(
    entry_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    """For routes that act on a knowledge entry (path param `entry_id`).

    Loads the entry to discover its sme_id and applies the SME-owner-or-admin
    check.
    """
    if user.is_admin:
        return user
    entry = await KnowledgeRepository(db).get_by_id(entry_id)
    if not entry:
        raise_not_found("Knowledge entry", entry_id)
    if user.is_sme and user.sme_id == entry.sme_id:
        return user
    raise_forbidden(f"Not allowed to act on entry '{entry_id}'")


# Backwards-compatible alias. Existing routers that import `verify_api_key`
# now require *any* authenticated user (JWT or service token) instead of just
# the raw API key. Per-route role checks are layered on top via require_admin
# / require_sme_owner_or_admin / require_entry_owner_or_admin.
verify_api_key = get_current_user

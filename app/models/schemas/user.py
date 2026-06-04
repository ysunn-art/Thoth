from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    is_admin: bool = False
    is_sme: bool = False
    sme_id: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    user_id: str
    email: str
    is_admin: bool
    is_sme: bool
    sme_id: Optional[str]
    created_at: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class CurrentUser(BaseModel):
    """In-memory representation of the authenticated principal.

    For real users this is loaded from DB. For the service token (BENCHMARK_API_KEY)
    this is a synthetic admin with id='service' and is_admin=True.
    """
    id: str
    email: Optional[str] = None
    is_admin: bool
    is_sme: bool
    sme_id: Optional[str] = None
    is_service_token: bool = False

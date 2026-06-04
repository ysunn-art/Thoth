from typing import List
from pydantic import BaseModel


class SMECreate(BaseModel):
    name: str
    specialization: str
    sub_areas: List[str]
    contact_email: str


class SMEResponse(BaseModel):
    sme_id: str
    name: str
    specialization: str
    sub_areas: List[str]
    contact_email: str
    created_at: str


class SMEUpdate(BaseModel):
    name: str
    specialization: str
    sub_areas: List[str]
    contact_email: str


class SMEListResponse(BaseModel):
    smes: List[SMEResponse]

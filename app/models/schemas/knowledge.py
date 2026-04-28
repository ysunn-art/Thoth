from typing import List, Optional
from pydantic import BaseModel


class SynthesizeRequest(BaseModel):
    interview_ids: List[str]
    material_ids: List[str]
    topic: str


class KnowledgeUpdate(BaseModel):
    content: str


class RejectRequest(BaseModel):
    reason: Optional[str] = None


class Sources(BaseModel):
    interviews: List[str]
    materials: List[str]


class UsageInfo(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    model: str


class KnowledgeEntryResponse(BaseModel):
    entry_id: str
    sme_id: str
    topic: str
    status: str
    content: str
    sources: Sources
    created_at: str
    updated_at: str
    usage: Optional[UsageInfo] = None


class ApproveResponse(BaseModel):
    entry_id: str
    status: str
    approved_at: str


class AdminApproveResponse(BaseModel):
    entry_id: str
    status: str
    admin_approved_at: str


class RejectResponse(BaseModel):
    entry_id: str
    status: str
    rejected_at: str


class KnowledgeListResponse(BaseModel):
    entries: List[KnowledgeEntryResponse]

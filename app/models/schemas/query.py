from typing import List, Optional
from pydantic import BaseModel


class QueryRequest(BaseModel):
    question: str
    session_id: str


class SourceRef(BaseModel):
    entry_id: str
    sme_name: str
    topic: str


class RoutingTarget(BaseModel):
    type: str
    sme_name: Optional[str]
    specialization: str
    reason: str


class UsageInfo(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    model: str


class QueryResponse(BaseModel):
    answer: str
    grounded: bool
    sources: List[SourceRef]
    disclaimer: Optional[str]
    session_id: str
    response_type: str
    routed_to: Optional[List[RoutingTarget]]
    timestamp: str
    usage: UsageInfo

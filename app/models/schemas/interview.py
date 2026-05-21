from typing import List, Optional
from pydantic import BaseModel


class InterviewCreate(BaseModel):
    topic: str


class TurnCreate(BaseModel):
    sme_response: str


class UsageInfo(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    model: str


class TurnResponse(BaseModel):
    turn_number: int
    sme_response: str
    agent_follow_up: Optional[str]
    timestamp: str
    usage: Optional[UsageInfo] = None


class TurnSummary(BaseModel):
    turn_number: int
    sme_response: str
    agent_follow_up: Optional[str]
    timestamp: str


class InterviewResponse(BaseModel):
    interview_id: str
    sme_id: str
    topic: str
    status: str
    created_at: str


class InterviewSummary(BaseModel):
    interview_id: str
    topic: str
    status: str
    created_at: str


class InterviewTranscript(BaseModel):
    interview_id: str
    sme_id: str
    topic: str
    status: str
    turns: List[TurnSummary]


class InterviewListResponse(BaseModel):
    interviews: List[InterviewSummary]

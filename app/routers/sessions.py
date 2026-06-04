from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.core.auth import get_current_user
from app.repositories.session_repo import SessionRepository

router = APIRouter(dependencies=[Depends(get_current_user)])


class SessionSummary(BaseModel):
    id: str
    title: str
    updated_at: str


class ChatMessageOut(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    turn_number: int
    created_at: str


class SessionDetail(BaseModel):
    id: str
    title: str
    messages: List[ChatMessageOut]


def _message_out(m) -> ChatMessageOut:
    return ChatMessageOut(
        id=m.id,
        session_id=m.session_id,
        role=m.role,
        content=m.content,
        turn_number=m.turn_number,
        created_at=m.created_at.isoformat(),
    )


@router.get("/sessions", response_model=List[SessionSummary])
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    user_id = user.id if hasattr(user, "id") else str(user.get("id", ""))
    if not user_id:
        return []
    repo = SessionRepository(db)
    sessions = await repo.list_user_sessions(user_id)
    return [
        SessionSummary(
            id=s.id,
            title=s.title or "Untitled",
            updated_at=s.updated_at.isoformat() if s.updated_at else datetime.now(timezone.utc).isoformat(),
        )
        for s in sessions
    ]


@router.get("/sessions/{session_id}", response_model=SessionDetail)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    repo = SessionRepository(db)
    session = await repo.get_session(session_id)
    messages = await repo.get_history(session_id)
    return SessionDetail(
        id=session.id if session else session_id,
        title=(session.title if session else "Untitled") or "Untitled",
        messages=[_message_out(m) for m in messages],
    )

from datetime import datetime, timezone
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.db.chat_session import ChatSession, ChatMessage
from app.core.ids import new_id


class SessionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_or_create_session(self, session_id: str, user_id: str | None = None) -> ChatSession:
        result = await self.db.execute(
            select(ChatSession).where(ChatSession.id == session_id)
        )
        session = result.scalar_one_or_none()
        if not session:
            session = ChatSession(
                id=session_id,
                user_id=user_id or "",
                title="",
            )
            self.db.add(session)
            await self.db.commit()
            await self.db.refresh(session)
        return session

    async def get_history(self, session_id: str) -> list[ChatMessage]:
        result = await self.db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.turn_number)
        )
        return list(result.scalars().all())

    async def append_message(self, session_id: str, role: str, content: str, user_id: str | None = None):
        await self.get_or_create_session(session_id, user_id)
        history = await self.get_history(session_id)
        turn = len(history) + 1
        msg = ChatMessage(
            id=new_id("msg"),
            session_id=session_id,
            role=role,
            content=content,
            turn_number=turn,
        )
        self.db.add(msg)
        # Update session title from first user message
        if role == "user" and turn == 1:
            result = await self.db.execute(select(ChatSession).where(ChatSession.id == session_id))
            session = result.scalar_one_or_none()
            if session:
                session.title = content[:100]
                session.updated_at = datetime.now(timezone.utc)
        else:
            result = await self.db.execute(select(ChatSession).where(ChatSession.id == session_id))
            session = result.scalar_one_or_none()
            if session:
                session.updated_at = datetime.now(timezone.utc)
        # Also update user_id if provided
        if user_id:
            result = await self.db.execute(select(ChatSession).where(ChatSession.id == session_id))
            session = result.scalar_one_or_none()
            if session and not session.user_id:
                session.user_id = user_id
        await self.db.commit()

    async def list_user_sessions(self, user_id: str) -> list[ChatSession]:
        result = await self.db.execute(
            select(ChatSession)
            .where(ChatSession.user_id == user_id)
            .order_by(ChatSession.updated_at.desc())
            .limit(50)
        )
        return list(result.scalars().all())

    async def get_session(self, session_id: str) -> ChatSession | None:
        result = await self.db.execute(
            select(ChatSession).where(ChatSession.id == session_id)
        )
        return result.scalar_one_or_none()

    async def delete_all(self):
        await self.db.execute(delete(ChatMessage))
        await self.db.execute(delete(ChatSession))
        await self.db.commit()

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.models.db.interview import Interview
from app.models.db.turn import Turn


class InterviewRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, interview: Interview) -> Interview:
        self.db.add(interview)
        await self.db.commit()
        await self.db.refresh(interview)
        return interview

    async def get_by_id(self, interview_id: str) -> Interview | None:
        result = await self.db.execute(select(Interview).where(Interview.id == interview_id))
        return result.scalar_one_or_none()

    async def list_by_sme(self, sme_id: str) -> list[Interview]:
        result = await self.db.execute(select(Interview).where(Interview.sme_id == sme_id))
        return list(result.scalars().all())

    async def update(self, interview: Interview) -> Interview:
        await self.db.commit()
        await self.db.refresh(interview)
        return interview

    async def add_turn(self, turn: Turn) -> Turn:
        self.db.add(turn)
        await self.db.commit()
        await self.db.refresh(turn)
        return turn

    async def get_turns(self, interview_id: str) -> list[Turn]:
        result = await self.db.execute(
            select(Turn).where(Turn.interview_id == interview_id).order_by(Turn.turn_number)
        )
        return list(result.scalars().all())

    async def count_turns(self, interview_id: str) -> int:
        result = await self.db.execute(select(Turn).where(Turn.interview_id == interview_id))
        return len(result.scalars().all())

    async def delete_all(self):
        await self.db.execute(delete(Turn))
        await self.db.execute(delete(Interview))
        await self.db.commit()

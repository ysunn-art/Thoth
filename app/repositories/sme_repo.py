from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.models.db.sme import SME


class SMERepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, sme: SME) -> SME:
        self.db.add(sme)
        await self.db.commit()
        await self.db.refresh(sme)
        return sme

    async def get_by_id(self, sme_id: str) -> SME | None:
        result = await self.db.execute(select(SME).where(SME.id == sme_id))
        return result.scalar_one_or_none()

    async def list_all(self) -> list[SME]:
        result = await self.db.execute(select(SME))
        return list(result.scalars().all())

    async def delete_all(self):
        await self.db.execute(delete(SME))
        await self.db.commit()

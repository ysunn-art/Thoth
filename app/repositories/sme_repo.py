from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.models.db.sme import SME

# Safe to cache ORM objects: SME has no relationships, so detached objects remain fully readable.
_sme_cache: list | None = None


class SMERepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, sme: SME) -> SME:
        global _sme_cache
        self.db.add(sme)
        await self.db.commit()
        await self.db.refresh(sme)
        _sme_cache = None
        return sme

    async def get_by_id(self, sme_id: str) -> SME | None:
        result = await self.db.execute(select(SME).where(SME.id == sme_id))
        return result.scalar_one_or_none()

    async def get_by_contact_email(self, email: str) -> SME | None:
        result = await self.db.execute(select(SME).where(SME.contact_email == email))
        return result.scalar_one_or_none()

    async def list_all(self) -> list[SME]:
        global _sme_cache
        if _sme_cache is not None:
            return _sme_cache
        result = await self.db.execute(select(SME))
        _sme_cache = list(result.scalars().all())
        return _sme_cache

    async def delete_all(self):
        global _sme_cache
        await self.db.execute(delete(SME))
        await self.db.commit()
        _sme_cache = None

    async def delete(self, sme_id: str) -> int:
        """Delete a single SME by id. Returns row count (0 or 1).
        Caller MUST first delete referencing rows (interviews, materials,
        knowledge_entries) and demote linked users (set is_sme=false, sme_id=NULL)
        to avoid CHECK / FK violations."""
        global _sme_cache
        result = await self.db.execute(delete(SME).where(SME.id == sme_id))
        await self.db.commit()
        _sme_cache = None
        return result.rowcount or 0

    async def update(self, sme: SME) -> SME:
        global _sme_cache
        await self.db.commit()
        await self.db.refresh(sme)
        _sme_cache = None
        return sme

    @classmethod
    def invalidate_cache(cls) -> None:
        global _sme_cache
        _sme_cache = None

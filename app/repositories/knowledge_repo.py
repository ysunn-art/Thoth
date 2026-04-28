from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.models.db.knowledge_entry import KnowledgeEntry


class KnowledgeRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, entry: KnowledgeEntry) -> KnowledgeEntry:
        self.db.add(entry)
        await self.db.commit()
        await self.db.refresh(entry)
        return entry

    async def get_by_id(self, entry_id: str) -> KnowledgeEntry | None:
        result = await self.db.execute(select(KnowledgeEntry).where(KnowledgeEntry.id == entry_id))
        return result.scalar_one_or_none()

    async def list_all(self, status: str | None = None) -> list[KnowledgeEntry]:
        stmt = select(KnowledgeEntry)
        if status:
            stmt = stmt.where(KnowledgeEntry.status == status)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update(self, entry: KnowledgeEntry) -> KnowledgeEntry:
        entry.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(entry)
        return entry

    async def delete_all(self):
        await self.db.execute(delete(KnowledgeEntry))
        await self.db.commit()

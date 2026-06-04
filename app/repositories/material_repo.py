from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.models.db.material import Material


class MaterialRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, material: Material) -> Material:
        self.db.add(material)
        await self.db.commit()
        await self.db.refresh(material)
        return material

    async def get_by_id(self, material_id: str) -> Material | None:
        result = await self.db.execute(select(Material).where(Material.id == material_id))
        return result.scalar_one_or_none()

    async def list_by_sme(self, sme_id: str) -> list[Material]:
        result = await self.db.execute(select(Material).where(Material.sme_id == sme_id))
        return list(result.scalars().all())

    async def update(self, material: Material) -> Material:
        await self.db.commit()
        await self.db.refresh(material)
        return material

    async def delete_all(self):
        await self.db.execute(delete(Material))
        await self.db.commit()

    async def delete_by_sme(self, sme_id: str) -> int:
        """Delete all materials belonging to an SME (DB rows only — caller wipes the disk)."""
        result = await self.db.execute(delete(Material).where(Material.sme_id == sme_id))
        await self.db.commit()
        return result.rowcount or 0

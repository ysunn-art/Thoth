from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, text
from app.models.db.knowledge_chunk import KnowledgeChunk
from app.models.db.knowledge_entry import KnowledgeEntry
from app.core.ids import new_id
from app.services.pq_index_service import pq_index_service


class VectorRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def upsert_chunks(self, entry_id: str, chunks: list[tuple[int, str, list[float]]]):
        await self.db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.entry_id == entry_id))
        pq_index_service.remove_entry(entry_id)  # clear stale codes before re-adding

        for chunk_index, chunk_text, embedding in chunks:
            chunk = KnowledgeChunk(
                id=new_id("chunk"),
                entry_id=entry_id,
                chunk_index=chunk_index,
                chunk_text=chunk_text,
                embedding=embedding,
            )
            self.db.add(chunk)
            pq_index_service.add(chunk.id, entry_id, embedding)

        await self.db.commit()
        pq_index_service.save()

    async def search(
        self, query_embedding: list[float], top_k: int = 5
    ) -> list[tuple[KnowledgeChunk, KnowledgeEntry]]:
        pq_ids = pq_index_service.search(query_embedding, top_k)

        if pq_ids:
            # PQ pre-filter: load the ranked chunks, keep only approved entries
            stmt = (
                select(KnowledgeChunk, KnowledgeEntry)
                .join(KnowledgeEntry, KnowledgeChunk.entry_id == KnowledgeEntry.id)
                .where(KnowledgeChunk.id.in_(pq_ids))
                .where(KnowledgeEntry.status == "approved")
            )
            result = await self.db.execute(stmt)
            rows = result.all()
            # Restore PQ ranking order
            order = {cid: i for i, cid in enumerate(pq_ids)}
            rows.sort(key=lambda r: order.get(r[0].id, len(pq_ids)))
            return rows[:top_k]

        # Fallback: exact pgvector cosine search
        stmt = (
            select(KnowledgeChunk, KnowledgeEntry)
            .join(KnowledgeEntry, KnowledgeChunk.entry_id == KnowledgeEntry.id)
            .where(KnowledgeEntry.status == "approved")
            .order_by(KnowledgeChunk.embedding.cosine_distance(query_embedding))
            .limit(top_k)
        )
        result = await self.db.execute(stmt)
        return result.all()

    async def delete_by_entry(self, entry_id: str):
        await self.db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.entry_id == entry_id))
        await self.db.commit()
        pq_index_service.remove_entry(entry_id)

    async def delete_all(self):
        await self.db.execute(delete(KnowledgeChunk))
        await self.db.commit()
        pq_index_service.reset()

    async def enable_extension(self):
        await self.db.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await self.db.commit()

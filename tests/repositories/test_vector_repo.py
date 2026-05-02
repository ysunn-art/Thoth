import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.repositories.vector_repo import VectorRepository


@pytest.mark.asyncio
async def test_upsert_chunks_uses_bulk_insert_not_individual_adds():
    """upsert_chunks must use a single bulk execute, never db.add per chunk."""
    db = AsyncMock()
    repo = VectorRepository(db)

    chunks = [
        (0, "first chunk text", [0.1] * 384),
        (1, "second chunk text", [0.2] * 384),
        (2, "third chunk text", [0.3] * 384),
    ]

    with patch("app.repositories.vector_repo.pq_index_service"):
        await repo.upsert_chunks("ke_test", chunks)

    db.add.assert_not_called()
    # delete statement + single bulk insert = exactly 2 execute calls
    assert db.execute.call_count == 2


@pytest.mark.asyncio
async def test_upsert_chunks_empty_list_commits_without_insert():
    """Empty chunk list should commit cleanly with no insert call."""
    db = AsyncMock()
    repo = VectorRepository(db)

    with patch("app.repositories.vector_repo.pq_index_service") as mock_pq:
        await repo.upsert_chunks("ke_test", [])

    db.add.assert_not_called()
    # Only the delete execute, no insert
    assert db.execute.call_count == 1
    db.commit.assert_called_once()
    mock_pq.save.assert_called_once()

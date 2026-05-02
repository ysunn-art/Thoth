import pytest
from unittest.mock import AsyncMock, MagicMock
import app.repositories.sme_repo as sme_repo_module
from app.repositories.sme_repo import SMERepository


@pytest.fixture(autouse=True)
def reset_cache():
    sme_repo_module._sme_cache = None
    yield
    sme_repo_module._sme_cache = None


@pytest.mark.asyncio
async def test_list_all_hits_db_once_then_uses_cache():
    db = AsyncMock()
    fake_smes = [MagicMock(id="sme_1"), MagicMock(id="sme_2")]
    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = fake_smes
    db.execute = AsyncMock(return_value=result_mock)

    repo = SMERepository(db)
    first = await repo.list_all()
    second = await repo.list_all()

    assert db.execute.call_count == 1
    assert first is second


@pytest.mark.asyncio
async def test_create_invalidates_cache():
    db = AsyncMock()
    sme_repo_module._sme_cache = [MagicMock()]

    repo = SMERepository(db)
    await repo.create(MagicMock())

    assert sme_repo_module._sme_cache is None


@pytest.mark.asyncio
async def test_delete_all_invalidates_cache():
    db = AsyncMock()
    sme_repo_module._sme_cache = [MagicMock()]

    repo = SMERepository(db)
    await repo.delete_all()

    assert sme_repo_module._sme_cache is None


def test_invalidate_cache_classmethod_clears_cache():
    sme_repo_module._sme_cache = [MagicMock()]
    SMERepository.invalidate_cache()
    assert sme_repo_module._sme_cache is None

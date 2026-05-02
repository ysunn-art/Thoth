import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.knowledge_service import KnowledgeService
from app.models.schemas.knowledge import SynthesizeRequest


@pytest.mark.asyncio
async def test_synthesize_includes_all_material_text():
    """Both materials' titles appear in the LLM prompt after parallel loading."""
    repo = AsyncMock()
    interview_repo = AsyncMock()
    material_repo = AsyncMock()
    sme_repo = AsyncMock()
    vector_repo = AsyncMock()

    sme_repo.get_by_id.return_value = MagicMock(id="sme_1")
    interview_repo.get_by_id.return_value = MagicMock(id="int_1", topic="AI")
    interview_repo.get_turns.return_value = []

    mat1 = MagicMock(id="mat_1", title="DocAlpha", file_path="/tmp/a.txt", file_type="text/plain")
    mat2 = MagicMock(id="mat_2", title="DocBeta", file_path="/tmp/b.txt", file_type="text/plain")

    async def _get_mat(mid):
        return {"mat_1": mat1, "mat_2": mat2}[mid]

    material_repo.get_by_id.side_effect = _get_mat

    fake_entry = MagicMock(id="ke_1")
    repo.create.return_value = fake_entry

    service = KnowledgeService(repo, interview_repo, material_repo, sme_repo, vector_repo)
    req = SynthesizeRequest(
        interview_ids=["int_1"],
        material_ids=["mat_1", "mat_2"],
        topic="AI safety",
    )

    with patch("app.services.knowledge_service.read_file", return_value=b"content") as mock_read, \
         patch("app.services.knowledge_service.llm_client") as mock_llm:
        mock_llm.complete = AsyncMock(return_value=("synthesized result", MagicMock()))
        await service.synthesize("sme_1", req)

    prompt = mock_llm.complete.call_args[1]["messages"][0]["content"]
    assert "DocAlpha" in prompt
    assert "DocBeta" in prompt
    assert mock_read.call_count == 2


@pytest.mark.asyncio
async def test_synthesize_material_failure_does_not_crash():
    """If one material file is unreadable, synthesize still completes."""
    repo = AsyncMock()
    interview_repo = AsyncMock()
    material_repo = AsyncMock()
    sme_repo = AsyncMock()
    vector_repo = AsyncMock()

    sme_repo.get_by_id.return_value = MagicMock(id="sme_1")
    interview_repo.get_by_id.return_value = MagicMock(id="int_1", topic="AI")
    interview_repo.get_turns.return_value = []

    mat = MagicMock(id="mat_1", title="BadDoc", file_path="/nonexistent.pdf", file_type="application/pdf")
    material_repo.get_by_id.return_value = mat

    fake_entry = MagicMock(id="ke_1")
    repo.create.return_value = fake_entry

    service = KnowledgeService(repo, interview_repo, material_repo, sme_repo, vector_repo)
    req = SynthesizeRequest(interview_ids=["int_1"], material_ids=["mat_1"], topic="AI")

    with patch("app.services.knowledge_service.read_file", side_effect=FileNotFoundError), \
         patch("app.services.knowledge_service.llm_client") as mock_llm:
        mock_llm.complete = AsyncMock(return_value=("result", MagicMock()))
        entry, _ = await service.synthesize("sme_1", req)

    prompt = mock_llm.complete.call_args[1]["messages"][0]["content"]
    assert "content unavailable" in prompt

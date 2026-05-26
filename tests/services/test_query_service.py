"""
Benchmark tests for query-service routing vs answering vs clarifying behavior.

Tests the deterministic guardrail, consistency on repeat calls,
classification fallback, and token accumulation.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.query_service import QueryService, _ADMIN_REFUSAL
from app.services.llm_client import UsageInfo, MODEL_SMART


# ---------------------------------------------------------------------------
# Helpers — build lightweight mocks matching the real models
# ---------------------------------------------------------------------------
def _chunk(entry_id, chunk_text="chunk text here"):
    c = MagicMock()
    c.id = f"ch_{entry_id}_0"
    c.entry_id = entry_id
    c.chunk_text = chunk_text
    c.chunk_index = 0
    return c


def _entry(entry_id, topic, sme_id="sme_1"):
    e = MagicMock()
    e.id = entry_id
    e.sme_id = sme_id
    e.topic = topic
    e.status = "approved"
    return e


def _sme(sme_id, name, specialization, sub_areas):
    s = MagicMock()
    s.id = sme_id
    s.name = name
    s.specialization = specialization
    s.sub_areas = sub_areas
    return s


def _usage(prompt=100, completion=50):
    return UsageInfo(
        prompt_tokens=prompt,
        completion_tokens=completion,
        total_tokens=prompt + completion,
        model=MODEL_SMART,
    )


def _make_service(sme_repo=None, knowledge_repo=None, vector_repo=None):
    return QueryService(
        sme_repo=sme_repo or AsyncMock(),
        knowledge_repo=knowledge_repo or AsyncMock(),
        vector_repo=vector_repo or AsyncMock(),
    )


# ---------------------------------------------------------------------------
# 1 — Guardrail: routing overridden when retrieval quality is high
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_guardrail_overrides_routing_when_quality_high():
    """
    LLM returns 'routing' but max_sim >= 0.45 AND >= 2 relevant chunks.
    Guardrail MUST fire → second LLM call → final response_type = 'answer'.
    """
    vector_repo = AsyncMock()
    vector_repo.search.return_value = [
        (_chunk("ke_1", "Integration testing ensures components work together."), _entry("ke_1", "Integration Testing"), 0.62),
        (_chunk("ke_2", "Test doubles like mocks and stubs isolate units."), _entry("ke_2", "Unit Testing"), 0.58),
        (_chunk("ke_3", "End-to-end tests validate full workflows."), _entry("ke_3", "E2E Testing"), 0.48),
    ]

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "Dr. Test", "Software Testing", ["unit testing", "integration testing", "e2e"]),
    ]

    # Call 1: main query LLM → routing (wrong decision, will trigger guardrail)
    # Call 2: guardrail forced answer
    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(side_effect=[
            (
                '{"response_type": "routing", "answer": "no knowledge available", '
                '"grounded": false, "sources": [], '
                '"routed_to": [{"type": "sme", "sme_name": "Dr. Test", '
                '"specialization": "Software Testing", "reason": "topic match"}], '
                '"disclaimer": null}',
                _usage(200, 80),
            ),
            (
                '{"answer": "Integration testing verifies that combined components '
                'work correctly together. Use test doubles for isolation.", '
                '"sources": [{"entry_id": "ke_1", "sme_name": "Dr. Test", '
                '"topic": "Integration Testing"}, {"entry_id": "ke_2", '
                '"sme_name": "Dr. Test", "topic": "Unit Testing"}]}',
                _usage(180, 60),
            ),
        ])

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query("How should I test component integration?", "sess-1")

    assert result.response_type == "answer"
    assert result.grounded is True
    assert len(result.sources) >= 1
    assert result.routed_to is None
    assert "Integration" in result.answer or "integration" in result.answer.lower()

    # Token counts from both LLM calls should be summed
    # prompt: 200 + 180 = 380, completion: 80 + 60 = 140, total: 280 + 240 = 520
    assert result.usage.prompt_tokens == 380
    assert result.usage.completion_tokens == 140
    assert result.usage.total_tokens == 520


# ---------------------------------------------------------------------------
# 2 — Guardrail: clarification overridden when retrieval quality is high
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_guardrail_overrides_clarification_when_quality_high():
    """
    LLM returns 'clarification' but max_sim >= 0.45 AND >= 2 relevant chunks.
    Guardrail MUST fire → forced answer.
    """
    vector_repo = AsyncMock()
    vector_repo.search.return_value = [
        (_chunk("ke_a", "GDPR requires consent for data processing."), _entry("ke_a", "GDPR Compliance"), 0.70),
        (_chunk("ke_b", "CCPA grants California residents data rights."), _entry("ke_b", "CCPA"), 0.55),
    ]

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "Alice", "Data Privacy Law", ["GDPR", "CCPA", "HIPAA"]),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(side_effect=[
            (
                '{"response_type": "clarification", '
                '"answer": "Do you mean GDPR or CCPA?", '
                '"grounded": false, "sources": [], "routed_to": null, '
                '"disclaimer": null}',
                _usage(150, 30),
            ),
            (
                '{"answer": "GDPR requires clear consent before processing personal data. '
                'CCPA provides California residents with rights to access and delete their data.", '
                '"sources": [{"entry_id": "ke_a", "sme_name": "Alice", "topic": "GDPR Compliance"}, '
                '{"entry_id": "ke_b", "sme_name": "Alice", "topic": "CCPA"}]}',
                _usage(120, 50),
            ),
        ])

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query("What are data privacy requirements?", "sess-2")

    assert result.response_type == "answer"
    assert result.grounded is True
    assert len(result.sources) >= 2
    assert result.routed_to is None


# ---------------------------------------------------------------------------
# 3 — Guardrail: does NOT fire when quality is below threshold
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_guardrail_does_not_trigger_on_low_similarity():
    """
    max_sim < 0.45 → guardrail stays silent. LLM's routing decision stands.
    Only one LLM call is made.
    """
    vector_repo = AsyncMock()
    vector_repo.search.return_value = [
        (_chunk("ke_x", "unrelated text about cooking recipes"), _entry("ke_x", "Cooking"), 0.38),
        (_chunk("ke_y", "another unrelated topic about gardening"), _entry("ke_y", "Gardening"), 0.36),
    ]

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "Bob", "Cybersecurity", ["network security", "pen testing"]),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(return_value=(
            '{"response_type": "routing", "answer": "no knowledge to answer this", '
            '"grounded": false, "sources": [], '
            '"routed_to": [{"type": "sme", "sme_name": "Bob", '
            '"specialization": "Cybersecurity", "reason": "domain match"}], '
            '"disclaimer": null}',
            _usage(100, 40),
        ))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query("How do I secure my network?", "sess-3")

    assert result.response_type == "routing"
    assert result.grounded is False
    assert result.routed_to is not None

    # Only one LLM call — guardrail did not fire
    assert mock_llm.complete.call_count == 1


# ---------------------------------------------------------------------------
# 4 — Guardrail: does NOT fire with only 1 relevant chunk
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_guardrail_does_not_trigger_with_one_chunk():
    """
    num_relevant < 2 → guardrail stays silent even if sim is high.
    """
    vector_repo = AsyncMock()
    vector_repo.search.return_value = [
        (_chunk("ke_solo", "Quantum computing uses qubits."), _entry("ke_solo", "Quantum Computing"), 0.80),
    ]

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "Carol", "Quantum Physics", ["quantum computing", "quantum mechanics"]),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(return_value=(
            '{"response_type": "routing", "answer": "need more context", '
            '"grounded": false, "sources": [], '
            '"routed_to": [{"type": "sme", "sme_name": "Carol", '
            '"specialization": "Quantum Physics", "reason": "match"}], '
            '"disclaimer": null}',
            _usage(100, 30),
        ))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query("Explain quantum computing basics", "sess-4")

    assert result.response_type == "routing"
    assert mock_llm.complete.call_count == 1


# ---------------------------------------------------------------------------
# 5 — Deterministic consistency: same input → same output (even if LLM varies)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_deterministic_output_despite_llm_decision_variance():
    """
    Run 3 queries with identical retrieval quality but varying LLM decisions
    (routing → clarification → routing). The guardrail normalizes ALL to 'answer'.
    """
    vector_repo = AsyncMock()
    vector_repo.search.return_value = [
        (_chunk("ke_1", "Kubernetes orchestrates containers across nodes."), _entry("ke_1", "Kubernetes"), 0.72),
        (_chunk("ke_2", "Docker packages applications into portable containers."), _entry("ke_2", "Docker"), 0.65),
        (_chunk("ke_3", "Helm charts manage Kubernetes application deployments."), _entry("ke_3", "Helm"), 0.52),
    ]

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "DevOps Dave", "Container Orchestration",
             ["Kubernetes", "Docker", "Helm", "CI/CD"]),
    ]

    guard_answer = (
        '{"answer": "Kubernetes orchestrates containerized applications across '
        'a cluster of nodes, managing scheduling, scaling, and networking.", '
        '"sources": [{"entry_id": "ke_1", "sme_name": "DevOps Dave", '
        '"topic": "Kubernetes"}, {"entry_id": "ke_2", "sme_name": "DevOps Dave", '
        '"topic": "Docker"}]}'
    )

    pattern = [
        # Query 1: LLM says routing → guardrail fires
        (
            '{"response_type": "routing", "answer": "no knowledge", '
            '"grounded": false, "sources": [], '
            '"routed_to": [{"type": "sme", "sme_name": "DevOps Dave", '
            '"specialization": "Container Orchestration", "reason": "match"}], '
            '"disclaimer": null}',
            _usage(100, 30),
        ),
        (guard_answer, _usage(90, 40)),
        # Query 2: LLM says clarification → guardrail fires
        (
            '{"response_type": "clarification", '
            '"answer": "Do you mean Kubernetes or Docker?", '
            '"grounded": false, "sources": [], "routed_to": null, '
            '"disclaimer": null}',
            _usage(100, 20),
        ),
        (guard_answer, _usage(90, 40)),
        # Query 3: LLM says routing → guardrail fires
        (
            '{"response_type": "routing", "answer": "insufficient info", '
            '"grounded": false, "sources": [], '
            '"routed_to": [{"type": "sme", "sme_name": "DevOps Dave", '
            '"specialization": "Container Orchestration", "reason": "match"}], '
            '"disclaimer": null}',
            _usage(100, 25),
        ),
        (guard_answer, _usage(90, 40)),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(side_effect=pattern)

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)

        result1 = await service.query("What does Kubernetes do?", "sess-a")
        result2 = await service.query("What does Kubernetes do?", "sess-b")
        result3 = await service.query("What does Kubernetes do?", "sess-c")

    # All three must produce 'answer' — guardrail normalized the variance
    assert result1.response_type == "answer"
    assert result2.response_type == "answer"
    assert result3.response_type == "answer"
    assert result1.grounded is True
    assert result2.grounded is True
    assert result3.grounded is True


# ---------------------------------------------------------------------------
# 6 — Classification fallback: no chunks → classify and route
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_classify_and_route_when_no_chunks():
    """When vector search returns nothing, fall back to _classify_and_route."""
    vector_repo = AsyncMock()
    vector_repo.search.return_value = []

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "Security Expert", "Cybersecurity",
             ["penetration testing", "incident response"]),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(return_value=(
            '{"decision": "route", "clarifying_question": null, '
            '"routed_to": [{"sme_name": "Security Expert", '
            '"reason": "cybersecurity question matches specialization"}]}',
            _usage(80, 30),
        ))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query("How do I respond to a security incident?", "sess-5")

    assert result.response_type == "routing"
    assert result.grounded is False
    assert result.routed_to is not None
    assert len(result.routed_to) >= 1
    assert result.routed_to[0].sme_name == "Security Expert"


# ---------------------------------------------------------------------------
# 7 — Classification fallback: no chunks, no SMEs, domain question → admin
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_classify_and_route_no_smes_domain_question_escalates_to_admin():
    """
    Empty DB, no SMEs, classifier says domain-specific (not common sense)
    → escalate to admin. Tokens are consumed by the classification call.
    """
    vector_repo = AsyncMock()
    vector_repo.search.return_value = []

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = []

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(return_value=(
            '{"decision": "route", "answer": null}',
            _usage(40, 10),
        ))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query("What is the deployment plan?", "sess-6")

    assert result.response_type == "routing"
    assert result.routed_to[0].type == "admin"
    assert result.usage.total_tokens == 50  # classification consumed tokens
    mock_llm.complete.assert_called_once()


# ---------------------------------------------------------------------------
# 8 — Classification fallback: all chunks below relevance threshold
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_routes_when_all_chunks_below_threshold():
    """
    Chunks exist but all similarity < 0.35 → treated as no relevant chunks
    → fall back to _classify_and_route.
    """
    vector_repo = AsyncMock()
    vector_repo.search.return_value = [
        (_chunk("ke_low1", "some text"), _entry("ke_low1", "Topic A"), 0.30),
        (_chunk("ke_low2", "more text"), _entry("ke_low2", "Topic B"), 0.25),
    ]

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "Expert E", "Domain X", ["sub-a", "sub-b"]),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(return_value=(
            '{"decision": "route", "clarifying_question": null, '
            '"routed_to": []}',
            _usage(50, 10),
        ))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query("Some specific question?", "sess-7")

    # Empty routed_to from LLM → admin escalation
    assert result.response_type == "routing"
    assert result.routed_to[0].type == "admin"


# ---------------------------------------------------------------------------
# 9 — Normal answer path: no guardrail needed when LLM answers correctly
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_normal_answer_path_no_guardrail_needed():
    """LLM correctly answers → one LLM call, no guardrail trigger."""
    vector_repo = AsyncMock()
    vector_repo.search.return_value = [
        (_chunk("ke_p", "PostgreSQL supports ACID transactions and JSON queries."),
         _entry("ke_p", "PostgreSQL"), 0.75),
        (_chunk("ke_q", "Indexes improve query performance in relational databases."),
         _entry("ke_q", "Database Indexing"), 0.60),
    ]

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "DB Admin", "Database Administration",
             ["PostgreSQL", "indexing", "performance tuning"]),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(return_value=(
            '{"response_type": "answer", '
            '"answer": "PostgreSQL supports ACID-compliant transactions, JSON '
            'queries, and benefits from proper indexing for query performance.", '
            '"grounded": true, '
            '"sources": [{"entry_id": "ke_p", "sme_name": "DB Admin", '
            '"topic": "PostgreSQL"}, {"entry_id": "ke_q", "sme_name": "DB Admin", '
            '"topic": "Database Indexing"}], '
            '"routed_to": null, '
            '"disclaimer": "This information is based on approved SME knowledge '
            'and may not constitute professional advice."}',
            _usage(200, 100),
        ))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query("What features does PostgreSQL have?", "sess-8")

    assert result.response_type == "answer"
    assert result.grounded is True
    assert len(result.sources) == 2
    assert result.routed_to is None
    assert result.disclaimer is not None
    assert mock_llm.complete.call_count == 1  # no guardrail → single call


# ---------------------------------------------------------------------------
# 10 — Clarify: low retrieval quality + ambiguous question
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_classify_clarify_when_ambiguous_no_knowledge():
    """
    No knowledge chunks, classifier decides question is vague → returns
    a clarifying question.
    """
    vector_repo = AsyncMock()
    vector_repo.search.return_value = []

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "Frontend Dev", "Frontend", ["React", "Vue"]),
        _sme("sme_2", "Backend Dev", "Backend", ["Django", "FastAPI"]),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(return_value=(
            '{"decision": "clarify", '
            '"clarifying_question": "Are you asking about frontend or backend testing?", '
            '"routed_to": []}',
            _usage(60, 20),
        ))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query("How should I do testing?", "sess-9")

    assert result.response_type == "clarification"
    assert "frontend" in result.answer.lower() or "backend" in result.answer.lower()
    assert result.grounded is False
    assert result.routed_to is None


# ---------------------------------------------------------------------------
# 11 — Session history is preserved across calls
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_session_history_preserved():
    """Verify user/assistant turns are appended to session store."""
    vector_repo = AsyncMock()
    vector_repo.search.return_value = [
        (_chunk("ke_r", "FastAPI is a modern Python web framework."),
         _entry("ke_r", "FastAPI"), 0.80),
        (_chunk("ke_s", "FastAPI supports async endpoints and automatic OpenAPI docs."),
         _entry("ke_s", "FastAPI Features"), 0.68),
    ]

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "Python Dev", "Python Web", ["FastAPI", "Django"]),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(return_value=(
            '{"response_type": "answer", '
            '"answer": "FastAPI is a modern Python framework with async support.", '
            '"grounded": true, '
            '"sources": [{"entry_id": "ke_r", "sme_name": "Python Dev", '
            '"topic": "FastAPI"}], '
            '"routed_to": null, '
            '"disclaimer": "This information is based on approved SME knowledge '
            'and may not constitute professional advice."}',
            _usage(100, 50),
        ))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)

        from app.services.session_store import session_store
        session_store.clear_all()

        sid = "history-test"
        await service.query("What is FastAPI?", sid)

        history = session_store.get_history(sid)
        assert len(history) == 2  # user + assistant
        assert history[0]["role"] == "user"
        assert "FastAPI" in history[0]["content"]
        assert history[1]["role"] == "assistant"
        assert "FastAPI" in history[1]["content"]


# ---------------------------------------------------------------------------
# 12 — Common-sense question, no chunks, HAS SMEs → answer directly
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_common_sense_with_smes_answers_directly():
    """
    RAG has no chunks. SMEs exist but the question is common sense
    ("What is the capital of France?"). Classifier should say 'answer'
    and the system should generate a direct answer, NOT route to SMEs.
    """
    vector_repo = AsyncMock()
    vector_repo.search.return_value = []

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "Security Expert", "Cybersecurity", ["pen testing"]),
        _sme("sme_2", "DB Admin", "PostgreSQL", ["indexing", "tuning"]),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(return_value=(
            '{"decision": "answer", '
            '"answer": "The capital of France is Paris.", '
            '"clarifying_question": null, "routed_to": []}',
            _usage(50, 15),
        ))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query("What is the capital of France?", "sess-cs-1")

    assert result.response_type == "answer"
    assert result.grounded is False
    assert result.sources == []
    assert result.routed_to is None
    assert "Paris" in result.answer
    assert mock_llm.complete.call_count == 1  # single classification call


# ---------------------------------------------------------------------------
# 13 — Common-sense question, no chunks, NO SMEs → answer directly
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_common_sense_no_smes_answers_directly():
    """
    Empty DB, no SMEs, but question is common sense ("2+2=").
    System should answer directly, NOT escalate to admin.
    """
    vector_repo = AsyncMock()
    vector_repo.search.return_value = []

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = []

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(return_value=(
            '{"decision": "answer", "answer": "2 + 2 = 4."}',
            _usage(30, 8),
        ))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query("What is 2+2?", "sess-cs-2")

    assert result.response_type == "answer"
    assert result.grounded is False
    assert result.sources == []
    assert result.routed_to is None
    assert "4" in result.answer
    assert mock_llm.complete.call_count == 1


# ---------------------------------------------------------------------------
# 14 — Domain question, no chunks, no matching SME → admin escalation
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_domain_question_no_matching_sme_escalates_to_admin():
    """
    RAG has no chunks. Question is domain-specific but no SME matches
    → empty routed_to from classifier → admin escalation.
    This is the correct path for truly unknown domain questions.
    """
    vector_repo = AsyncMock()
    vector_repo.search.return_value = []

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "Chef Cook", "Culinary Arts", ["baking", "sous vide"]),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(return_value=(
            '{"decision": "route", "answer": null, '
            '"clarifying_question": null, "routed_to": []}',
            _usage(45, 12),
        ))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query(
            "How do I configure a Kubernetes ingress controller for TLS termination?",
            "sess-domain-1",
        )

    assert result.response_type == "routing"
    assert result.routed_to is not None
    assert result.routed_to[0].type == "admin"
    assert result.grounded is False
    assert mock_llm.complete.call_count == 1


# ---------------------------------------------------------------------------
# 15 — Domain question, no chunks, matching SME → route to SME
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_domain_question_matching_sme_routes_to_sme():
    """
    RAG has no chunks. Question is domain-specific and matches an SME's
    specialization → route to that SME. Verify no regression.
    """
    vector_repo = AsyncMock()
    vector_repo.search.return_value = []

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "K8s Expert", "Kubernetes Administration",
             ["ingress controllers", "TLS termination", "service mesh"]),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(return_value=(
            '{"decision": "route", "answer": null, '
            '"clarifying_question": null, '
            '"routed_to": [{"sme_name": "K8s Expert", '
            '"reason": "Kubernetes ingress and TLS are within specialization"}]}',
            _usage(55, 20),
        ))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query(
            "How do I configure a Kubernetes ingress controller for TLS termination?",
            "sess-domain-2",
        )

    assert result.response_type == "routing"
    assert result.routed_to is not None
    assert result.routed_to[0].type == "sme"
    assert result.routed_to[0].sme_name == "K8s Expert"
    assert result.grounded is False


# ===================================================================
# RISK FILTER TESTS
# ===================================================================

# ---------------------------------------------------------------------------
# 16 — Tier 1: Critical risk (self-harm) → admin before embedding
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_critical_risk_self_harm_blocks_before_embedding():
    """
    Tier 1: self-harm question → immediate admin escalation.
    embed_one is NEVER called — the check happens before embedding.
    """
    vector_repo = AsyncMock()
    vector_repo.search.return_value = []

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "Dr. Help", "Mental Health", ["counseling"]),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(side_effect=RuntimeError("should not be called"))
        mock_llm.complete = AsyncMock(side_effect=RuntimeError("should not be called"))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query("I want to kill myself", "sess-risk-1")

    assert result.response_type == "routing"
    assert result.routed_to[0].type == "admin"
    assert result.grounded is False
    assert result.usage.total_tokens == 0
    mock_llm.embed_one.assert_not_called()
    mock_llm.complete.assert_not_called()


# ---------------------------------------------------------------------------
# 17 — Tier 2: High-risk billing → admin (no LLM classification)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_high_risk_billing_routes_to_admin_no_llm():
    """
    Tier 2: "how do I get a refund" → admin escalation.
    embed_one IS called (for vector search), but complete is NOT called.
    """
    vector_repo = AsyncMock()
    vector_repo.search.return_value = []

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "Finance Guru", "Accounting", ["billing", "invoicing"]),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(side_effect=RuntimeError("should not be called"))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query("How do I get a refund?", "sess-risk-2")

    assert result.response_type == "routing"
    assert result.routed_to[0].type == "admin"
    assert "billing" in result.routed_to[0].reason
    assert result.grounded is False
    mock_llm.embed_one.assert_called_once()
    mock_llm.complete.assert_not_called()


# ---------------------------------------------------------------------------
# 18 — Safe definition question passes the filter
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_definition_question_passes_risk_filter():
    """
    "What is a refund?" is a definition (not action). Should pass the risk
    filter and go through normal classification.
    """
    vector_repo = AsyncMock()
    vector_repo.search.return_value = []

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "Finance Guru", "Accounting", ["billing"]),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(return_value=(
            '{"decision": "answer", "answer": "A refund is money returned to a customer.", '
            '"clarifying_question": null, "routed_to": []}',
            _usage(40, 12),
        ))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query("What is a refund?", "sess-risk-3")

    assert result.response_type == "answer"
    assert result.grounded is False
    assert mock_llm.complete.call_count == 1


# ---------------------------------------------------------------------------
# 19 — High-risk account → admin
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_high_risk_account_routes_to_admin():
    """'I forgot my password' → admin. embed_one called, complete NOT called."""
    vector_repo = AsyncMock()
    vector_repo.search.return_value = []

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "IT Support", "IT Administration", ["password management"]),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(side_effect=RuntimeError("should not be called"))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query(
            "I forgot my password, how do I reset it?", "sess-risk-4"
        )

    assert result.response_type == "routing"
    assert result.routed_to[0].type == "admin"
    assert "account" in result.routed_to[0].reason
    mock_llm.embed_one.assert_called_once()
    mock_llm.complete.assert_not_called()


# ---------------------------------------------------------------------------
# 20 — High-risk privacy → admin
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_high_risk_privacy_routes_to_admin():
    """'Delete all my personal data' → admin."""
    vector_repo = AsyncMock()
    vector_repo.search.return_value = []

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "Privacy Officer", "Data Privacy", ["GDPR", "CCPA"]),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(side_effect=RuntimeError("should not be called"))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query(
            "Delete all my personal data from your system", "sess-risk-5"
        )

    assert result.response_type == "routing"
    assert result.routed_to[0].type == "admin"
    assert "privacy" in result.routed_to[0].reason
    mock_llm.complete.assert_not_called()


# ---------------------------------------------------------------------------
# 21 — High-risk medical → admin
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_high_risk_medical_routes_to_admin():
    """'What medication should I take for a headache?' → admin."""
    vector_repo = AsyncMock()
    vector_repo.search.return_value = []

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "Doctor", "Medicine", ["pharmacology"]),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(side_effect=RuntimeError("should not be called"))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query(
            "What medication should I take for a headache?", "sess-risk-6"
        )

    assert result.response_type == "routing"
    assert result.routed_to[0].type == "admin"
    assert "medical" in result.routed_to[0].reason
    mock_llm.complete.assert_not_called()


# ---------------------------------------------------------------------------
# 22 — High-risk financial → admin
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_high_risk_financial_routes_to_admin():
    """'Should I invest in Tesla stock?' → admin."""
    vector_repo = AsyncMock()
    vector_repo.search.return_value = []

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "Finance Advisor", "Financial Planning", ["investments"]),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(side_effect=RuntimeError("should not be called"))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query(
            "Should I invest in Tesla stock?", "sess-risk-7"
        )

    assert result.response_type == "routing"
    assert result.routed_to[0].type == "admin"
    assert "financial" in result.routed_to[0].reason
    mock_llm.complete.assert_not_called()


# ---------------------------------------------------------------------------
# 23 — High-risk organizational → admin
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_high_risk_org_routes_to_admin():
    """'How do I submit an expense report?' → admin (company-specific)."""
    vector_repo = AsyncMock()
    vector_repo.search.return_value = []

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "HR Rep", "Human Resources", ["onboarding"]),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(side_effect=RuntimeError("should not be called"))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query(
            "How do I submit an expense report?", "sess-risk-8"
        )

    assert result.response_type == "routing"
    assert result.routed_to[0].type == "admin"
    assert "org" in result.routed_to[0].reason
    mock_llm.complete.assert_not_called()


# ---------------------------------------------------------------------------
# 24 — Low-risk common sense still answers (risk filter pass-through)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_low_risk_common_sense_still_answers():
    """
    "What is 2+2?" passes the risk filter → normal classification → answer.
    """
    vector_repo = AsyncMock()
    vector_repo.search.return_value = []

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "Mathematician", "Mathematics", ["algebra"]),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(return_value=(
            '{"decision": "answer", "answer": "2 + 2 = 4.", '
            '"clarifying_question": null, "routed_to": []}',
            _usage(30, 8),
        ))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query("What is 2+2?", "sess-risk-9")

    assert result.response_type == "answer"
    assert result.grounded is False
    assert "4" in result.answer
    mock_llm.complete.assert_called_once()


# ---------------------------------------------------------------------------
# 25 — High-risk WITH RAG chunks → grounded answer (Option B)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_high_risk_with_rag_gives_grounded_answer():
    """
    Option B: "How do I get a refund?" is high-risk billing, BUT RAG has
    approved refund policy chunks → grounded answer from SME-approved content.
    """
    vector_repo = AsyncMock()
    vector_repo.search.return_value = [
        (_chunk("ke_refund", "Refunds are processed within 14 business days of receiving "
                 "the returned item. Contact billing@example.com for assistance."),
         _entry("ke_refund", "Refund Policy"), 0.82),
        (_chunk("ke_returns", "Items must be returned in original packaging with receipt."),
         _entry("ke_returns", "Return Policy"), 0.70),
    ]

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "Policy Admin", "Company Policies", ["refunds", "returns"]),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(return_value=(
            '{"response_type": "answer", '
            '"answer": "Refunds are processed within 14 business days. '
            'Contact billing@example.com.", '
            '"grounded": true, '
            '"sources": [{"entry_id": "ke_refund", "sme_name": "Policy Admin", '
            '"topic": "Refund Policy"}], '
            '"routed_to": null, '
            '"disclaimer": "This information is based on approved SME knowledge '
            'and may not constitute professional advice."}',
            _usage(150, 70),
        ))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query("How do I get a refund?", "sess-risk-10")

    assert result.response_type == "answer"
    assert result.grounded is True
    assert len(result.sources) >= 1
    assert result.routed_to is None
    assert "14 business days" in result.answer
    mock_llm.complete.assert_called_once()


# ---------------------------------------------------------------------------
# 26 — High-risk legal → admin
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_high_risk_legal_routes_to_admin():
    """'Can I sue the company?' → admin."""
    vector_repo = AsyncMock()
    vector_repo.search.return_value = []

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "Lawyer", "Corporate Law", ["litigation"]),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(side_effect=RuntimeError("should not be called"))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query("Can I sue the company?", "sess-risk-11")

    assert result.response_type == "routing"
    assert result.routed_to[0].type == "admin"
    mock_llm.complete.assert_not_called()


# ---------------------------------------------------------------------------
# 27 — High-risk authorization → admin
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_high_risk_authorization_routes_to_admin():
    """'Can you give me admin access?' → admin."""
    vector_repo = AsyncMock()
    vector_repo.search.return_value = []

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "Sysadmin", "System Administration", ["user management"]),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(side_effect=RuntimeError("should not be called"))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query(
            "Can you give me admin access?", "sess-risk-12"
        )

    assert result.response_type == "routing"
    assert result.routed_to[0].type == "admin"
    mock_llm.complete.assert_not_called()


# ---------------------------------------------------------------------------
# 28 — High-risk below-threshold path (Tier 2 on <0.35 branch)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_high_risk_below_threshold_routes_to_admin():
    """
    Chunks exist but all <0.35. High-risk question should trigger Tier 2
    on the below-threshold branch (separate code path).
    """
    vector_repo = AsyncMock()
    vector_repo.search.return_value = [
        (_chunk("ke_irrelevant", "cooking recipe text"), _entry("ke_irrelevant", "Cooking"), 0.30),
        (_chunk("ke_irrelevant2", "sports news"), _entry("ke_irrelevant2", "Sports"), 0.22),
    ]

    sme_repo = AsyncMock()
    sme_repo.list_all.return_value = [
        _sme("sme_1", "Support", "Customer Support", ["billing"]),
    ]

    with patch("app.services.query_service.llm_client") as mock_llm:
        mock_llm.embed_one = AsyncMock(return_value=[0.1] * 384)
        mock_llm.complete = AsyncMock(side_effect=RuntimeError("should not be called"))

        service = _make_service(sme_repo=sme_repo, vector_repo=vector_repo)
        result = await service.query(
            "How do I get a refund for my order?", "sess-risk-13"
        )

    assert result.response_type == "routing"
    assert result.routed_to[0].type == "admin"
    assert "billing" in result.routed_to[0].reason
    mock_llm.complete.assert_not_called()

"""
Smoke tests for query routing behavior. Requires a live server on localhost:8000
and a reachable database. Run after `uvicorn app.main:app --port 8000`.

Usage:
    pytest tests/smoke/test_query_behavior.py -v -s
"""
import os
import re
import pytest
import requests
from pathlib import Path

BASE = "http://localhost:8000/api/v1"

def _load_key() -> str:
    key = os.getenv("BENCHMARK_API_KEY", "")
    if not key:
        env_file = Path(__file__).parents[2] / ".env"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                m = re.match(r"BENCHMARK_API_KEY\s*=\s*(.+)", line)
                if m:
                    key = m.group(1).strip()
                    break
    return key

KEY = _load_key()


def headers():
    return {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}


def purge():
    r = requests.post(f"{BASE}/system/purge", headers=headers(), timeout=10)
    assert r.status_code == 200, f"Purge failed: {r.text}"


def register_sme(name: str, specialization: str, sub_areas: list[str]) -> str:
    r = requests.post(
        f"{BASE}/smes",
        headers=headers(),
        json={
            "name": name,
            "specialization": specialization,
            "sub_areas": sub_areas,
            "contact_email": f"{name.lower().replace(' ', '.')}@example.com",
        },
        timeout=10,
    )
    assert r.status_code == 201, f"SME creation failed: {r.text}"
    return r.json()["sme_id"]


def query(question: str, session_id: str) -> dict:
    r = requests.post(
        f"{BASE}/query",
        headers=headers(),
        json={"question": question, "session_id": session_id},
        timeout=30,
    )
    assert r.status_code == 200, f"Query failed ({r.status_code}): {r.text}"
    return r.json()


@pytest.fixture(autouse=True)
def fresh_db():
    """Purge before every test for isolation."""
    purge()
    yield


# ---------------------------------------------------------------------------
# Test 1 — health check
# ---------------------------------------------------------------------------
def test_1_health():
    r = requests.get("http://localhost:8000/health", timeout=5)
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"


# ---------------------------------------------------------------------------
# Test 2 — closed-book + no SMEs → admin escalation (0-token, no LLM call)
# ---------------------------------------------------------------------------
def test_2_empty_db_no_smes_escalates_to_admin():
    # DB is purged by fixture, no SMEs registered
    result = query("What is the T-Mobile 5G rollout plan?", "smoke-test-2")

    assert result["response_type"] == "routing", f"Expected routing, got: {result['response_type']}"
    assert result["routed_to"] is not None and len(result["routed_to"]) > 0
    assert result["routed_to"][0]["type"] == "admin", (
        f"Expected admin, got: {result['routed_to'][0]['type']}"
    )
    # No LLM call was made — usage should be zero
    assert result["usage"]["total_tokens"] == 0, (
        f"Expected 0 tokens for closed-book, got: {result['usage']['total_tokens']}"
    )


# ---------------------------------------------------------------------------
# Test 2.5 — empty KB + 1 SME with matching specialty → routes to SME, not admin
# ---------------------------------------------------------------------------
def test_2_5_empty_kb_with_matching_sme_routes_to_sme():
    register_sme(
        name="Dr. Compliance",
        specialization="Test Compliance Domain",
        sub_areas=["regulatory compliance", "audit", "policy enforcement"],
    )

    result = query(
        "What are the regulatory compliance requirements for our new product launch?",
        "smoke-test-2-5",
    )

    assert result["response_type"] == "routing", (
        f"Expected routing, got: {result['response_type']}"
    )
    assert result["routed_to"] is not None and len(result["routed_to"]) > 0

    sme_targets = [t for t in result["routed_to"] if t["type"] == "sme"]
    assert len(sme_targets) > 0, (
        f"Expected at least one SME target, got: {result['routed_to']}"
    )
    assert sme_targets[0]["sme_name"] == "Dr. Compliance", (
        f"Expected 'Dr. Compliance', got: {sme_targets[0]['sme_name']}"
    )
    # A real LLM call was made
    assert result["usage"]["total_tokens"] > 0, (
        "Expected non-zero tokens for SME routing LLM call"
    )


# ---------------------------------------------------------------------------
# Test 3 — empty KB + 1 SME, question with NO matching specialty → admin
# ---------------------------------------------------------------------------
def test_3_empty_kb_no_matching_sme_escalates_to_admin():
    register_sme(
        name="Jazz Expert",
        specialization="Jazz Music Theory",
        sub_areas=["bebop", "improvisation", "chord voicings"],
    )

    result = query(
        "What are the regulatory compliance requirements for our new product launch?",
        "smoke-test-3",
    )

    assert result["response_type"] == "routing"
    assert result["routed_to"] is not None

    admin_targets = [t for t in result["routed_to"] if t["type"] == "admin"]
    assert len(admin_targets) > 0, (
        f"Expected admin escalation when no SME matches, got: {result['routed_to']}"
    )

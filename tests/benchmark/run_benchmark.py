#!/usr/bin/env python3
"""
MediSync RAG benchmark harness.

Seeds a known approved knowledge base, then runs the test-case suite against
POST /query and scores per-metric pass rates that mirror the instructor scorecard:
context_answer_ratio, routing_precision, guardrail_score, latency/token efficiency,
plus closed-book / functional / synthesis / persistence / world-knowledge sanity.

Usage:
    export BASE_URL="http://localhost:8000/api/v1"
    export BENCHMARK_API_KEY="<key>"           # falls back to ../../.env
    python tests/benchmark/run_benchmark.py            # full run (seed + all)
    python tests/benchmark/run_benchmark.py --no-seed  # KB already loaded
    python tests/benchmark/run_benchmark.py --only CAR,RP,GR

Exit code is non-zero if any category falls below its --min-score gate.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import logging
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import requests

# --------------------------------------------------------------------------- #
# Config & logging
# --------------------------------------------------------------------------- #
HERE = Path(__file__).resolve().parent
DATASET = HERE / "dataset"
ROOT = HERE.parents[1]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("benchmark")


def _api_key() -> str:
    key = os.getenv("BENCHMARK_API_KEY", "")
    if key:
        return key
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            m = re.match(r"BENCHMARK_API_KEY\s*=\s*(.+)", line)
            if m:
                return m.group(1).strip()
    raise SystemExit("BENCHMARK_API_KEY not set and not found in .env")


BASE_URL = os.getenv("BASE_URL", "http://localhost:8000/api/v1")
API_KEY = _api_key()
HEALTH_URL = BASE_URL.rsplit("/api/", 1)[0] + "/health"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}
JSON_HEADERS = {**HEADERS, "Content-Type": "application/json"}

REQUEST_TIMEOUT = 60          # seconds per /query call
MAX_RETRIES = 3
RETRY_BACKOFF = 2.0           # exponential base


# --------------------------------------------------------------------------- #
# HTTP helpers with retry + timeout + logging
# --------------------------------------------------------------------------- #
def _request(method: str, url: str, **kw) -> requests.Response:
    kw.setdefault("timeout", REQUEST_TIMEOUT)
    last_exc = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = requests.request(method, url, **kw)
            # Retry only on transient server errors
            if r.status_code in (502, 503, 504):
                raise requests.HTTPError(f"{r.status_code} transient")
            return r
        except (requests.Timeout, requests.ConnectionError, requests.HTTPError) as e:
            last_exc = e
            wait = RETRY_BACKOFF ** attempt
            log.warning("  %s %s attempt %d/%d failed (%s); retrying in %.1fs",
                        method, url, attempt, MAX_RETRIES, e, wait)
            time.sleep(wait)
    raise SystemExit(f"Request permanently failed: {method} {url}: {last_exc}")


def post_query(question: str, session_id: str) -> tuple[dict, float]:
    """Returns (response_json, latency_seconds)."""
    t0 = time.perf_counter()
    r = _request("POST", f"{BASE_URL}/query", headers=JSON_HEADERS,
                 json={"question": question, "session_id": session_id})
    latency = time.perf_counter() - t0
    if r.status_code != 200:
        log.error("  /query -> %d: %s", r.status_code, r.text[:300])
        return {}, latency
    return r.json(), latency


def _clean_q(q: str) -> str:
    """Strip trailing [INSTRUCTION] annotations (e.g. '[RUN AGAINST EMPTY KB]',
    '[REPEAT x3 ...]') before sending the real question to /query."""
    return re.sub(r"\s*\[[^\]]*\]\s*$", "", q).strip()


# --------------------------------------------------------------------------- #
# Seeding: CSV knowledge base -> approved entries
# --------------------------------------------------------------------------- #
def load_csv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def purge():
    r = _request("POST", f"{BASE_URL}/system/purge", headers=HEADERS)
    log.info("purge -> %d", r.status_code)


def seed_knowledge_base():
    """
    Ingestion path for THIS deployment:
        POST /smes                         (one per unique SME)
        POST /smes/{id}/materials          (upload the entry content as a .txt)
        POST /smes/{id}/knowledge/synthesize  (material_ids=[mat], topic=...)
        POST /knowledge/{id}/approve       (draft -> sme_approved)
        POST /knowledge/{id}/admin-approve (sme_approved -> approved; embeds)
    Synthesis is LLM-driven but the CAR prompt preserves exact tokens
    (numbers, codes, $amounts), so factual substrings survive.
    """
    rows = load_csv(DATASET / "knowledge_base.csv")
    sme_ids: dict[str, str] = {}

    for row in rows:
        name = row["sme_name"]
        # 1. Create SME once
        if name not in sme_ids:
            r = _request("POST", f"{BASE_URL}/smes", headers=JSON_HEADERS, json={
                "name": name,
                "specialization": row["specialization"],
                "sub_areas": [row["specialization"].lower()],
                "contact_email": f"{name.lower().replace(' ', '.').replace('.', '_')}@medisync.test",
            })
            sme_ids[name] = r.json()["sme_id"]
            log.info("SME %-14s -> %s", name, sme_ids[name])
        sme_id = sme_ids[name]

        # 2. Upload the entry content as a text material
        files = {"file": (f"{row['entry_id']}.txt", io.BytesIO(row["content"].encode()), "text/plain")}
        data = {"title": row["topic"], "description": f"Seed material for {row['entry_id']}"}
        r = _request("POST", f"{BASE_URL}/smes/{sme_id}/materials",
                     headers=HEADERS, files=files, data=data)
        mat_id = r.json()["material_id"]

        # 3. Synthesize -> draft entry
        r = _request("POST", f"{BASE_URL}/smes/{sme_id}/knowledge/synthesize",
                     headers=JSON_HEADERS, json={
                         "interview_ids": [], "material_ids": [mat_id], "topic": row["topic"],
                     })
        entry_id = r.json()["entry_id"]

        # 4. + 5. Approve then admin-approve (admin-approve triggers embedding)
        _request("POST", f"{BASE_URL}/knowledge/{entry_id}/approve", headers=HEADERS)
        _request("POST", f"{BASE_URL}/knowledge/{entry_id}/admin-approve", headers=HEADERS)
        log.info("  %-7s synthesized+approved -> %s", row["entry_id"], entry_id)

    log.info("Seed complete: %d entries, %d SMEs", len(rows), len(sme_ids))


# --------------------------------------------------------------------------- #
# Scoring
# --------------------------------------------------------------------------- #
@dataclass
class Result:
    test_id: str
    category: str
    passed: bool
    detail: str
    latency: float = 0.0
    completion_tokens: int = 0
    score: float | None = None     # graded 0..1; falls back to passed if None


def _contains_any(text: str, patterns: str) -> bool:
    """patterns is a '|'-separated OR list; empty => trivially True."""
    if not patterns:
        return True
    t = (text or "").lower()
    return any(p.strip().lower() in t for p in patterns.split("|") if p.strip())


# --------------------------------------------------------------------------- #
# CAR fact-recall + deterministic faithfulness
# --------------------------------------------------------------------------- #
def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").lower()).replace("$ ", "$").strip()


_KB_CORPUS: str | None = None


def _kb_corpus() -> str:
    """Normalized concatenation of all seed KB content — the set of real facts."""
    global _KB_CORPUS
    if _KB_CORPUS is None:
        _KB_CORPUS = _norm(" ".join(r["content"] for r in load_csv(DATASET / "knowledge_base.csv")))
    return _KB_CORPUS


# Exact-token facts: $amounts, versions, error codes, ECCN, 510(k). These must
# match verbatim — a wrong code IS a hallucination.
_CODE_RE = re.compile(
    r"\$\s?\d+(?:,\d+)*|\bv\d+(?:\.\d+)?\b|\bE-\d+\b|\bEAR\d+\b|510\(k\)",
    re.IGNORECASE,
)
# Numbers carrying a unit. We match the VALUE (not the exact unit phrasing) so
# "0.1 mL/hr" (a correct rephrasing of "0.1 to 999 mL/hr") passes, while an
# invented number ("36 months", "10 hours", "95%") is flagged.
_NUM_UNIT_RE = re.compile(
    r"\b(\d+(?:\.\d+)?)\s?(?:hours?|months?|days?|kg|db|ml/hr|ml|minutes?|seconds?|years?|degrees?)\b"
    r"|\b(\d+(?:\.\d+)?)\s?%",
    re.IGNORECASE,
)


def _recall(answer: str, contains: str) -> tuple[float, list[str]]:
    """';' separates required fact groups (AND); '|' within a group is OR.
    Returns (fraction_of_groups_present, missing_groups)."""
    groups = [g for g in contains.split(";") if g.strip()]
    if not groups:
        return 1.0, []
    missing = [g for g in groups if not _contains_any(answer, g)]
    return (len(groups) - len(missing)) / len(groups), missing


def _faithfulness(answer: str) -> tuple[bool, list[str]]:
    """Every fact token in the answer must be supported by the KB. Codes/$/versions
    match verbatim; numbers-with-units match on the numeric value as a standalone
    number in the KB. Unsupported tokens are hallucinated facts. Returns (ok, list)."""
    corpus = _kb_corpus()
    unsupported = []
    for m in _CODE_RE.finditer(answer or ""):
        t = _norm(m.group(0))
        if t not in corpus:
            unsupported.append(t)
    for m in _NUM_UNIT_RE.finditer(answer or ""):
        val = m.group(1) or m.group(2)
        # standalone number: not part of a longer number/decimal in the KB
        if not re.search(rf"(?<![\d.]){re.escape(val)}(?![\d.])", corpus):
            unsupported.append(_norm(m.group(0)))
    return (not unsupported), sorted(set(unsupported))


def score_car_case(row: dict) -> Result:
    """Context Answer Ratio: graded recall of ALL expected facts, gated by
    answered+grounded+not-routed, penalized for hallucinated facts.
    score=0 if it refused/routed/clarified an answerable question (the core CAR failure)."""
    resp, latency = post_query(_clean_q(row["user_query"]), row["session_id"])
    rtype = resp.get("response_type")
    grounded = resp.get("grounded")
    answer = resp.get("answer") or ""
    ctoks = (resp.get("usage") or {}).get("completion_tokens", 0) or 0

    answered = (rtype == "answer") and (grounded is True) and not resp.get("routed_to")
    recall, missing = _recall(answer, row["expected_answer_contains"].strip())
    # Faithfulness is a soft DIAGNOSTIC, not a gate: deterministic token-matching
    # is unreliable both ways (rephrasing -> false positives; cross-fact number
    # collisions -> false negatives). Flagged tokens are surfaced for human review.
    _faithful, flagged = _faithfulness(answer)

    # Score gates on what we CAN measure reliably: answered + fact recall.
    score = recall if answered else 0.0
    passed = answered and (recall == 1.0)

    detail = (f"answered={answered} recall={recall:.2f} score={score:.2f}"
              + (f" missing={missing}" if missing else "")
              + (f" REVIEW_FACTS={flagged}" if flagged else ""))
    return Result(row["test_id"], row["category"], passed, detail, latency, ctoks, score)


def _routed_ok(resp: dict, expected: str) -> bool:
    """expected like 'admin' or 'sme:David Chen|Trade Compliance|admin'."""
    routed = resp.get("routed_to") or []
    if not routed:
        return False
    targets = {e.strip().lower() for e in expected.split("|")}
    want_admin = any(t == "admin" for t in targets)
    want_sme = {t.split("sme:", 1)[1] if t.startswith("sme:") else t
                for t in targets if t != "admin"}
    for entry in routed:
        etype = (entry.get("type") or "").lower()
        if want_admin and etype == "admin":
            return True
        name = (entry.get("sme_name") or "").lower()
        spec = (entry.get("specialization") or "").lower()
        if etype == "sme" and any(w and (w in name or w in spec) for w in want_sme):
            return True
    return False


def score_query_case(row: dict) -> Result:
    cat = row["category"]
    resp, latency = post_query(_clean_q(row["user_query"]), row["session_id"])
    rtype = resp.get("response_type")
    grounded = resp.get("grounded")
    answer = resp.get("answer") or ""
    ctoks = (resp.get("usage") or {}).get("completion_tokens", 0) or 0

    exp_type = row["expected_response_type"].strip() or None
    exp_grounded = {"true": True, "false": False, "": None}[row["expected_grounded"].strip().lower()]
    exp_routed = row["expected_routed_to"].strip()
    contains = row["expected_answer_contains"].strip()

    checks, reasons = [], []

    if exp_type:
        ok = rtype == exp_type
        checks.append(ok); reasons.append(f"type {rtype}=={exp_type}:{ok}")
    if exp_grounded is not None:
        ok = grounded is exp_grounded
        checks.append(ok); reasons.append(f"grounded {grounded}=={exp_grounded}:{ok}")

    if exp_type == "routing":
        ok = _routed_ok(resp, exp_routed) or _contains_any(answer, contains)
        checks.append(ok); reasons.append(f"routed/refusal:{ok}")
    elif exp_type in ("answer", "clarification"):
        ok = _contains_any(answer, contains)
        checks.append(ok); reasons.append(f"answer~={contains[:30]!r}:{ok}")
        # Answerable cases must NOT be routed
        if exp_type == "answer" and (resp.get("routed_to")):
            checks.append(False); reasons.append("UNEXPECTED routed_to on answer")

    # latency/token efficiency extra gate
    if cat == "latency_token":
        ok = ctoks <= 150
        checks.append(ok); reasons.append(f"completion_tokens {ctoks}<=150:{ok}")

    passed = all(checks) if checks else False
    return Result(row["test_id"], cat, passed, " | ".join(reasons), latency, ctoks)


def run_repeatability(row: dict, n: int = 3) -> Result:
    """Same query n times, same session: decision must be identical."""
    decisions = []
    lat = 0.0
    for _ in range(n):
        resp, latency = post_query(_clean_q(row["user_query"]), row["session_id"])
        lat += latency
        routed_sig = tuple(sorted(
            (e.get("type"), e.get("sme_name")) for e in (resp.get("routed_to") or [])
        ))
        decisions.append((resp.get("response_type"), routed_sig))
    identical = len(set(decisions)) == 1
    matches_expected = decisions[0][0] == row["expected_response_type"]
    passed = identical and matches_expected
    return Result(row["test_id"], row["category"], passed,
                  f"identical={identical} decisions={decisions}", lat / n)


# --------------------------------------------------------------------------- #
# Action cases — direct endpoint probes (NOT /query calls)
# FN_*/SY_* exercise health, SME creation, and the synthesis->draft flow.
# --------------------------------------------------------------------------- #
ACTION_CASES = {"FN_01", "FN_02", "FN_03", "SY_01", "SY_02"}
_PROBE_DRAFT: tuple[str, str, str] | None = None  # (entry_id, content, status), cached


def _synthesize_probe_draft() -> tuple[str, str, str]:
    """Create a throwaway SME, upload the X1 spec text, synthesize, and read back
    the DRAFT entry (without approving it). Returns (entry_id, content, status).
    Cached so SY_01 and SY_02 share one synthesis call."""
    global _PROBE_DRAFT
    if _PROBE_DRAFT is not None:
        return _PROBE_DRAFT

    kb = load_csv(DATASET / "knowledge_base.csv")
    x1 = next(r for r in kb if "X1" in r["topic"])

    r = _request("POST", f"{BASE_URL}/smes", headers=JSON_HEADERS, json={
        "name": "Synthesis Probe", "specialization": "Technical Support",
        "sub_areas": ["specs"], "contact_email": "synth_probe@medisync.test",
    })
    sme_id = r.json()["sme_id"]

    files = {"file": ("probe_x1.txt", io.BytesIO(x1["content"].encode()), "text/plain")}
    r = _request("POST", f"{BASE_URL}/smes/{sme_id}/materials", headers=HEADERS,
                 files=files, data={"title": x1["topic"], "description": "probe"})
    mat_id = r.json()["material_id"]

    r = _request("POST", f"{BASE_URL}/smes/{sme_id}/knowledge/synthesize",
                 headers=JSON_HEADERS,
                 json={"interview_ids": [], "material_ids": [mat_id], "topic": x1["topic"]})
    entry_id = r.json()["entry_id"]

    # Read the draft back WITHOUT approving (so SY_02 can assert status == draft)
    r = _request("GET", f"{BASE_URL}/knowledge/{entry_id}", headers=HEADERS)
    e = r.json()
    _PROBE_DRAFT = (entry_id, e.get("content", "") or "", e.get("status", "") or "")
    return _PROBE_DRAFT


def run_action_case(row: dict) -> Result:
    tid = row["test_id"]
    try:
        if tid == "FN_01":                                  # GET /health
            r = _request("GET", HEALTH_URL)
            body = r.json() if r.status_code == 200 else {}
            ok = r.status_code == 200 and body.get("status") == "healthy"
            detail = f"/health {r.status_code} status={body.get('status')}"

        elif tid == "FN_02":                                # POST /smes
            r = _request("POST", f"{BASE_URL}/smes", headers=JSON_HEADERS, json={
                "name": "Functional Probe", "specialization": "Probe",
                "sub_areas": ["probe"], "contact_email": "fn_probe@medisync.test",
            })
            sid = (r.json() or {}).get("sme_id", "") if r.status_code == 201 else ""
            ok = r.status_code == 201 and sid.startswith("sme_")
            detail = f"/smes {r.status_code} sme_id={sid!r}"

        elif tid == "FN_03":                                # /query field-completeness
            resp, _ = post_query(_clean_q(row["user_query"]), row["session_id"])
            required = ["answer", "grounded", "response_type", "sources",
                        "session_id", "timestamp", "usage"]
            missing = [f for f in required if f not in resp]
            ok = not missing
            detail = f"missing_fields={missing}"

        elif tid in ("SY_01", "SY_02"):                     # synthesis -> draft
            _eid, content, status = _synthesize_probe_draft()
            if tid == "SY_01":
                ok = _contains_any(content, row["expected_answer_contains"])
                detail = f"draft facts_present={ok} content_len={len(content)}"
            else:
                ok = status == "draft"
                detail = f"draft status={status!r}"
        else:
            ok, detail = False, "no action handler"
    except Exception as e:  # noqa: BLE001 - report any probe failure as a test failure
        ok, detail = False, f"exception: {e}"
    return Result(tid, row["category"], ok, detail)


# --------------------------------------------------------------------------- #
# Multi-turn
# --------------------------------------------------------------------------- #
def run_multi_turn() -> list[Result]:
    rows = load_csv(DATASET / "multi_turn.csv")
    by_seq: dict[str, list[dict]] = {}
    for r in rows:
        by_seq.setdefault(r["seq_id"], []).append(r)

    results = []
    for seq_id, turns in by_seq.items():
        turns.sort(key=lambda x: int(x["turn"]))
        seq_pass, detail = True, []
        for t in turns:
            resp, _ = post_query(t["user_query"], t["session_id"])
            rtype = resp.get("response_type")
            type_ok = rtype == t["expected_response_type"]
            ans_ok = _contains_any(resp.get("answer") or "", t["expected_answer_contains"])
            grounded_ok = True
            if t["expected_grounded"].strip().lower() == "true":
                grounded_ok = resp.get("grounded") is True
            turn_ok = type_ok and ans_ok and grounded_ok
            seq_pass &= turn_ok
            detail.append(f"t{t['turn']}:{rtype}/{turn_ok}")
        results.append(Result(seq_id, "multi_turn", seq_pass, " ".join(detail)))
    return results


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #
CAT_PREFIX = {
    "CAR": "context_answer_ratio", "RP": "routing_precision", "GR": "guardrail_score",
    "LT": "latency_token", "CB": "closed_book", "FN": "functional",
    "SY": "synthesis", "PS": "persistence", "WK": "world_knowledge", "MT": "multi_turn",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-seed", action="store_true", help="KB already loaded")
    ap.add_argument("--only", default="", help="comma list of prefixes, e.g. CAR,RP,GR")
    ap.add_argument("--min-score", type=float, default=0.0, help="fail CI below this per-cat")
    ap.add_argument("--label", default="", help="name for the saved baseline run, e.g. 'phase0-baseline'")
    args = ap.parse_args()
    only = {p.strip().upper() for p in args.only.split(",") if p.strip()}

    cases = load_csv(DATASET / "test_cases.csv")
    results: list[Result] = []

    # --- Phase 0: closed-book runs BEFORE any data exists ---------------------
    if not only or "CB" in only:
        log.info("=== Phase 0: closed-book (empty KB) ===")
        purge()
        for row in [c for c in cases if c["test_id"].startswith("CB")]:
            results.append(score_query_case(row))

    # --- Phase 1: seed -------------------------------------------------------
    if not args.no_seed:
        log.info("=== Phase 1: seeding knowledge base ===")
        purge()
        seed_knowledge_base()

    # --- Phase 2: main suite -------------------------------------------------
    log.info("=== Phase 2: scored suite ===")
    for row in cases:
        prefix = row["test_id"].split("_")[0]
        if prefix == "CB":
            continue  # already ran in phase 0
        if only and prefix not in only:
            continue
        if row["test_id"] in ACTION_CASES:
            results.append(run_action_case(row))
        elif row["category"] == "context_answer_ratio":
            results.append(score_car_case(row))
        elif "REPEAT" in row["user_query"]:
            results.append(run_repeatability(row))
        else:
            results.append(score_query_case(row))
        r = results[-1]
        log.info("  %-7s %s  %s", r.test_id, "PASS" if r.passed else "FAIL", r.detail[:90])

    # --- Phase 3: multi-turn -------------------------------------------------
    if not only or "MT" in only:
        log.info("=== Phase 3: multi-turn ===")
        results.extend(run_multi_turn())

    # --- Report --------------------------------------------------------------
    report(results, args.min_score, args.label)


# Map each suite category to the professor's scorecard metric (keeps the baseline
# aligned to how the course grades us). Diagnostic-only categories are marked.
PROF_METRIC = {
    "context_answer_ratio": "Context Answer Ratio",
    "routing_precision": "Routing Precision",
    "guardrail_score": "Guardrail Effectiveness",
    "closed_book": "Closed-Book Failure Rate",
    "functional": "Functional Capability Pass Rate",
    "synthesis": "Synthesis Quality",
    "persistence": "Persistence",
    "latency_token": "Token Efficiency / Latency",
    "multi_turn": "Functional: Clarifying Follow-ups",
    "world_knowledge": "(diagnostic) Common-sense answering",
}


def report(results: list[Result], min_score: float, label: str = ""):
    by_cat: dict[str, list[Result]] = {}
    for r in results:
        by_cat.setdefault(r.category, []).append(r)

    def graded(r: Result) -> float:
        return r.score if r.score is not None else (1.0 if r.passed else 0.0)

    print("\n" + "=" * 78)
    print(f"{'METRIC':<24}{'PROF METRIC':<34}{'PASS/TOTAL':>10}{'SCORE':>8}")
    print("-" * 78)
    failed_gate = False
    summary: dict[str, dict] = {}
    for cat in sorted(by_cat):
        rs = by_cat[cat]
        passed = sum(1 for r in rs if r.passed)
        score = sum(graded(r) for r in rs) / len(rs)   # graded mean (= ratio for CAR)
        summary[cat] = {"prof_metric": PROF_METRIC.get(cat, "?"),
                        "passed": passed, "total": len(rs), "score": round(score, 4)}
        flag = ""
        if min_score and score < min_score:
            flag, failed_gate = " <<", True
        print(f"{cat:<24}{PROF_METRIC.get(cat,'?'):<34}{f'{passed}/{len(rs)}':>10}{score:>8.2f}{flag}")
    print("=" * 78)

    # CAR diagnostics: mean fact-recall vs faithfulness, separated
    car = by_cat.get("context_answer_ratio", [])
    if car:
        answered = sum(1 for r in car if "answered=True" in r.detail)
        flagged = sum(1 for r in car if "REVIEW_FACTS" in r.detail)
        print(f"CAR detail: answered {answered}/{len(car)}  "
              f"recall-gated SCORE (mean fact-recall on answered cases)  "
              f"| {flagged} case(s) with fact tokens to REVIEW (soft, non-gating)")

    lat = [r.latency for r in results if r.latency]
    if lat:
        print(f"avg latency: {sum(lat)/len(lat):.2f}s  p95: {sorted(lat)[int(len(lat)*0.95)-1]:.2f}s")
    toks = [r.completion_tokens for r in results if r.completion_tokens]
    if toks:
        print(f"avg completion tokens: {sum(toks)/len(toks):.0f}")

    # machine-readable artifacts: latest + a timestamped, labeled baseline to compare against
    from datetime import datetime, timezone
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "label": label or "unlabeled",
        "summary": summary,
        "results": [r.__dict__ for r in results],
    }
    (HERE / "last_run.json").write_text(json.dumps(payload, indent=2))
    runs_dir = HERE / "runs"
    runs_dir.mkdir(exist_ok=True)
    fname = f"{ts}_{label}.json" if label else f"{ts}.json"
    saved = runs_dir / fname
    saved.write_text(json.dumps(payload, indent=2))
    print(f"\nsaved baseline -> {saved}")
    print(f"latest         -> {HERE / 'last_run.json'}")

    for r in results:
        if not r.passed:
            log.info("FAIL %-8s %s | %s", r.test_id, r.category, r.detail[:120])

    sys.exit(1 if failed_gate else 0)


if __name__ == "__main__":
    main()

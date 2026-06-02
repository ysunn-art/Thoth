# MediSync RAG Benchmark Suite

Maps directly to the instructor scorecard. Tracks `context_answer_ratio`,
`routing_precision`, `guardrail_score`, latency/token efficiency, and sanity
checks for closed-book / functional / synthesis / persistence / world-knowledge.

## Layout
```
dataset/
  knowledge_base.csv   # 7 approved entries (ground truth), 4 SMEs
  test_cases.csv       # 70 single-turn cases (CAR/RP/GR/LT/CB/FN/SY/PS/WK)
  multi_turn.csv       # 5 clarify->answer sequences (10 turns)
run_benchmark.py       # seeds KB, runs suite, prints per-metric scores
last_run.json          # written each run, for CI trend tracking
```

## Run
```bash
export BASE_URL="http://localhost:8000/api/v1"
export BENCHMARK_API_KEY="<key>"        # or auto-read from ../../.env

python tests/benchmark/run_benchmark.py                 # full: closed-book -> seed -> score
python tests/benchmark/run_benchmark.py --no-seed       # KB already loaded
python tests/benchmark/run_benchmark.py --only CAR,RP   # subset
python tests/benchmark/run_benchmark.py --min-score 0.7 # CI gate: exit 1 if any cat < 0.7
```

## Phases
0. **closed-book** — purge, ask seeded questions against the EMPTY KB; must route, not fabricate.
1. **seed** — purge, then per `knowledge_base.csv` row: create SME -> upload content as material -> synthesize -> approve -> admin-approve.
2. **scored suite** — every `test_cases.csv` row -> `POST /query`; repeatability rows fire 3x and require identical decisions.
3. **multi-turn** — each `multi_turn.csv` sequence on one `session_id`: clarification then grounded answer.

## Scoring
- Substring/`|`-OR match on exact fact tokens (deterministic, zero extra LLM tokens).
- `routed_to` matched by `type==admin` or SME name/specialization.
- Answer cases fail if `routed_to` is populated (over-routing guard).
- `latency_token` cases additionally require `completion_tokens <= 150`.

### context_answer_ratio (graded)
CAR is scored as a **graded ratio**, not pass/fail, mirroring the instructor metric:
- `expected_answer_contains` uses `;` = required facts (AND), `|` = alternatives (OR).
- **score = fact-recall** (fraction of required fact groups present), **gated by
  `answered`** = `response_type==answer AND grounded==true AND not routed`.
  A routed/clarified answerable question scores **0** (the core CAR failure).
- **Faithfulness is a soft DIAGNOSTIC, not a gate.** Deterministic token-matching is
  unreliable both ways (legitimate rephrasing -> false positives; cross-fact number
  collisions -> false negatives), so flagged tokens are printed as `REVIEW_FACTS=[...]`
  for human review and do **not** change the score. Catches over-elaboration like a
  derived "36 months" total when only "24 months" was asked.

Per-metric SCORE = mean graded score in that category (= pass-rate for binary metrics).

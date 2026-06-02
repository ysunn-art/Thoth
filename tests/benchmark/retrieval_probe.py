#!/usr/bin/env python3
"""
Retrieval-only probe — predicts CAR pass/fail per question WITHOUT calling the
answer LLM (cheap: local embed + one pgvector search each).

For each CAR question it reports the best-matching chunk's cosine similarity, the
entry it hit, and whether that clears RELEVANCE_THRESHOLD. Because the current
architecture discards every chunk below the threshold and then routes, a question
whose best correct chunk lands below the cutoff will fail CAR. This lets us:
  (a) calibrate the question set to the professor's failure rate by similarity, and
  (b) quantify how much a threshold change would recover (the Step 2 lever).

Usage:
    python tests/benchmark/retrieval_probe.py
    python tests/benchmark/retrieval_probe.py --threshold 0.25   # what-if
"""
import argparse
import asyncio
import csv
from pathlib import Path

from app.services.llm_client import llm_client
from app.repositories.vector_repo import VectorRepository
from app.db.session import AsyncSessionLocal

DATASET = Path(__file__).resolve().parent / "dataset"
CURRENT_THRESHOLD = 0.35   # matches query_service.RELEVANCE_THRESHOLD


async def probe(threshold: float):
    rows = [r for r in csv.DictReader(open(DATASET / "test_cases.csv"))
            if r["category"] == "context_answer_ratio"]

    print(f"{'ID':<8}{'best_sim':>9}{'>=thr':>7}{'#>=thr':>7}  best_entry_topic")
    print("-" * 78)
    n_pass = 0
    band = 0  # correct-but-discarded band: 0.25..threshold
    async with AsyncSessionLocal() as session:
        vr = VectorRepository(session)
        for r in rows:
            emb = await llm_client.embed_one(r["user_query"])
            results = await vr.search(emb, top_k=8)
            if not results:
                print(f"{r['test_id']:<8}{'--':>9}{'no':>7}{0:>7}  (no chunks)")
                continue
            sims = [s for _, _, s in results]
            best = max(sims)
            n_above = sum(1 for s in sims if s >= threshold)
            top_topic = max(results, key=lambda x: x[2])[1].topic
            passes = n_above >= 1
            n_pass += passes
            if 0.25 <= best < threshold:
                band += 1
            print(f"{r['test_id']:<8}{best:>9.3f}{('yes' if passes else 'NO'):>7}"
                  f"{n_above:>7}  {top_topic[:46]}")

    print("-" * 78)
    print(f"threshold={threshold:.2f}  ->  {n_pass}/{len(rows)} have >=1 chunk above "
          f"({n_pass/len(rows):.2f})   | {band} questions sit in 0.25..thr (recoverable)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--threshold", type=float, default=CURRENT_THRESHOLD)
    args = ap.parse_args()
    asyncio.run(probe(args.threshold))

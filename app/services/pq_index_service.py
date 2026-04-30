"""
In-memory PQ index sidecar for fast approximate vector search.

Architecture:
  - PQ index lives in memory alongside pgvector (not a replacement).
  - When >= MIN_TRAIN_SIZE chunks are indexed, k-means trains the codebooks
    and all buffered vectors are added.
  - search() returns a ranked list of chunk_ids; caller falls back to
    pgvector if None is returned (index not ready).
  - Persisted to PQ_INDEX_PATH on every upsert so it survives restarts.

Parameters (chosen for benchmark scale):
  DIM = 384   (all-MiniLM-L6-v2 via sentence-transformers)
  M   = 8     sub-spaces, sub_dim = 48
  K   = 16    centroids per sub-space (needs >= 16 vectors to train)
"""

import os
import numpy as np
from pq import PQIndex

EMBEDDING_DIM = 384
PQ_M = 8
PQ_K = 16
MIN_TRAIN_SIZE = PQ_K  # minimum chunks before training
PQ_INDEX_PATH = "pq_index.pkl"


class PQIndexService:
    def __init__(self):
        # chunk_id -> (entry_id, embedding_vector)
        self._buffer: dict[str, tuple[str, np.ndarray]] = {}
        self._deleted_entries: set[str] = set()
        self._index: PQIndex | None = None
        self._load()

    # ------------------------------------------------------------------
    # Public interface (called by VectorRepository)
    # ------------------------------------------------------------------

    def add(self, chunk_id: str, entry_id: str, embedding: list[float]) -> None:
        """Encode and store a chunk. Triggers training once enough data exists."""
        vec = np.array(embedding, dtype=np.float32)
        self._buffer[chunk_id] = (entry_id, vec)

        if self._index is None:
            if len(self._buffer) >= MIN_TRAIN_SIZE:
                self._train_and_fill()
        else:
            if entry_id not in self._deleted_entries:
                self._index.add(chunk_id, vec)

    def search(self, query_embedding: list[float], top_k: int) -> list[str] | None:
        """
        Return up to top_k chunk_ids ranked by approximate distance.
        Returns None when the index is not yet trained (caller should use pgvector).
        """
        if self._index is None:
            return None

        query = np.array(query_embedding, dtype=np.float32)
        # Over-fetch so deleted-entry filtering still yields top_k results
        raw = self._index.search(query, k=top_k * 3)

        valid: list[str] = []
        for chunk_id, _ in raw:
            entry_id = self._buffer.get(chunk_id, (None,))[0]
            if entry_id and entry_id not in self._deleted_entries:
                valid.append(chunk_id)
            if len(valid) >= top_k:
                break

        return valid or None  # return None so caller falls back if nothing survives filter

    def remove_entry(self, entry_id: str) -> None:
        """Mark all chunks of entry_id as deleted (soft delete — PQ codes stay in index)."""
        self._deleted_entries.add(entry_id)
        # Also evict from buffer so memory doesn't grow unboundedly
        to_remove = [cid for cid, (eid, _) in self._buffer.items() if eid == entry_id]
        for cid in to_remove:
            del self._buffer[cid]

    def reset(self) -> None:
        """Wipe everything — called by POST /system/purge."""
        self._index = None
        self._buffer.clear()
        self._deleted_entries.clear()
        if os.path.exists(PQ_INDEX_PATH):
            os.remove(PQ_INDEX_PATH)

    def save(self) -> None:
        """Persist the trained index to disk. No-op if not yet trained."""
        if self._index is not None:
            self._index.save(PQ_INDEX_PATH)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _train_and_fill(self) -> None:
        vectors = np.stack([v for _, v in self._buffer.values()])
        self._index = PQIndex(dim=EMBEDDING_DIM, M=PQ_M, K=PQ_K)
        self._index.train(vectors)
        for cid, (eid, emb) in self._buffer.items():
            if eid not in self._deleted_entries:
                self._index.add(cid, emb)

    def _load(self) -> None:
        if os.path.exists(PQ_INDEX_PATH):
            try:
                self._index = PQIndex.load(PQ_INDEX_PATH)
            except Exception:
                self._index = None


pq_index_service = PQIndexService()

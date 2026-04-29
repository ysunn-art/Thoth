"""
PQIndex: public API for the Product Quantization vector database.

ADC search vectorized:
    dist_table = encoder.build_distance_table(query)  # (M, K)
    approx_dists = dist_table[np.arange(M), self._codes].sum(axis=1)  # (N,)

Broadcasting: np.arange(M) is (M,), _codes is (N, M).
    Result[n, m] = dist_table[m, _codes[n, m]]  shape (N, M)  sum axis=1  (N,)
"""
from __future__ import annotations
import os
import pickle
from typing import Optional
import numpy as np
from .encoder import PQEncoder


class PQIndex:
    """Approximate nearest-neighbour index backed by Product Quantization."""

    def __init__(self, dim: int, M: int, K: int) -> None:
        self._encoder = PQEncoder(dim=dim, M=M, K=K)
        self._ids: list[str] = []
        self._codes: Optional[np.ndarray] = None  # (N, M) uint8

    def train(self, vectors: np.ndarray, seed: int = 42, max_iter: int = 100) -> None:
        """Learn M codebooks from a (N, dim) training matrix."""
        self._encoder.train(vectors, seed=seed, max_iter=max_iter)

    def add(self, id: str, vector: np.ndarray) -> None:
        """Encode vector and store it under id. Raises RuntimeError if not trained."""
        code = self._encoder.encode(vector)  # (M,) uint8; raises if not trained
        self._ids.append(id)
        if self._codes is None:
            self._codes = code[np.newaxis, :]
        else:
            self._codes = np.vstack([self._codes, code[np.newaxis, :]])

    def search(self, query: np.ndarray, k: int) -> list[tuple[str, float]]:
        """
        Return k approximate nearest neighbours using ADC.

        Returns list of (id, approx_distance) sorted ascending by distance.
        """
        if k <= 0:
            return []

        self._encoder._assert_trained()

        if self._codes is None or len(self._ids) == 0:
            return []

        M = self._encoder.M
        dist_table = self._encoder.build_distance_table(query)  # (M, K)

        # Vectorized ADC: result[n, m] = dist_table[m, codes[n, m]], sum over m
        approx_dists = dist_table[np.arange(M), self._codes].sum(axis=1)  # (N,)

        N = len(self._ids)
        k_actual = min(k, N)

        if k_actual < N:
            top_indices = np.argpartition(approx_dists, k_actual - 1)[:k_actual]
        else:
            top_indices = np.arange(N)

        sorted_order = np.argsort(approx_dists[top_indices])
        final_indices = top_indices[sorted_order]

        return [(self._ids[int(i)], float(approx_dists[i])) for i in final_indices]

    def save(self, path: str) -> None:
        """Persist the full index to disk via pickle."""
        state = {
            "dim": self._encoder.dim,
            "M": self._encoder.M,
            "K": self._encoder.K,
            "is_trained": self._encoder.is_trained,
            "centroids": [cb.centroids for cb in self._encoder.codebooks],
            "ids": list(self._ids),
            "codes": self._codes,
        }
        with open(path, "wb") as f:
            pickle.dump(state, f, protocol=pickle.HIGHEST_PROTOCOL)

    @classmethod
    def load(cls, path: str) -> "PQIndex":
        """Load a saved PQIndex from disk. Raises FileNotFoundError if not found."""
        if not os.path.exists(path):
            raise FileNotFoundError(f"Index file not found: {path!r}")
        with open(path, "rb") as f:
            state = pickle.load(f)
        idx = cls(dim=state["dim"], M=state["M"], K=state["K"])
        for m, cb in enumerate(idx._encoder.codebooks):
            cb.centroids = state["centroids"][m]
        idx._encoder.is_trained = state["is_trained"]
        idx._ids = state["ids"]
        idx._codes = state["codes"]
        return idx

"""
PQEncoder: applies M Codebooks to D-dim vectors.

D-dim space is split into M sub-spaces of sub_dim = D/M dimensions each.
Each sub-space has its own Codebook with K centroids.
"""
from __future__ import annotations
import numpy as np
from .codebook import Codebook


class PQEncoder:
    """Product Quantization encoder using M independent sub-space codebooks."""

    def __init__(self, dim: int, M: int, K: int) -> None:
        if M < 1:
            raise ValueError(f"M must be >= 1; got {M}.")
        if dim < 1:
            raise ValueError(f"dim must be >= 1; got {dim}.")
        if dim % M != 0:
            raise ValueError(f"dim ({dim}) must be divisible by M ({M}).")
        if K > 256:
            raise ValueError(f"K must be <= 256 to fit in uint8; got {K}.")
        if K < 1:
            raise ValueError(f"K must be >= 1; got {K}.")
        self.dim = dim
        self.M = M
        self.K = K
        self.sub_dim: int = dim // M
        self.codebooks: list[Codebook] = [Codebook(K=K) for _ in range(M)]
        self.is_trained: bool = False

    def train(self, vectors: np.ndarray, seed: int = 42, max_iter: int = 100) -> None:
        """Train each sub-space codebook on its slice of vectors."""
        vectors = np.asarray(vectors, dtype=np.float32)
        if vectors.ndim != 2 or vectors.shape[1] != self.dim:
            raise ValueError(
                f"vectors must have dim={self.dim} (columns); got shape {vectors.shape}."
            )
        for m, cb in enumerate(self.codebooks):
            sub_vecs = vectors[:, m * self.sub_dim: (m + 1) * self.sub_dim]
            cb.train(sub_vecs, seed=seed + m, max_iter=max_iter)
        self.is_trained = True

    def encode(self, vector: np.ndarray) -> np.ndarray:
        """Encode a single D-dim vector into (M,) uint8 centroid indices."""
        self._assert_trained()
        vector = np.asarray(vector, dtype=np.float32).ravel()
        if vector.shape[0] != self.dim:
            raise ValueError(f"vector must have dim={self.dim}; got {vector.shape[0]}.")
        codes = np.empty(self.M, dtype=np.uint8)
        for m, cb in enumerate(self.codebooks):
            sub_v = vector[m * self.sub_dim: (m + 1) * self.sub_dim]
            codes[m] = cb.encode(sub_v)
        return codes

    def build_distance_table(self, query: np.ndarray) -> np.ndarray:
        """
        Build (M, K) ADC distance lookup table for a query vector.

        Entry [m, k] = sq distance from query sub-vector m to centroid k of codebook m.
        To get approx distance to a stored code c: sum_m table[m, c[m]].
        """
        self._assert_trained()
        query = np.asarray(query, dtype=np.float32).ravel()
        if query.shape[0] != self.dim:
            raise ValueError(f"query must have dim={self.dim}; got {query.shape[0]}.")
        table = np.empty((self.M, self.K), dtype=np.float32)
        for m, cb in enumerate(self.codebooks):
            q_sub = query[m * self.sub_dim: (m + 1) * self.sub_dim]
            table[m] = cb.build_distance_table_row(q_sub)
        return table

    def _assert_trained(self) -> None:
        if not self.is_trained:
            raise RuntimeError("PQEncoder is not trained. Call train() first.")

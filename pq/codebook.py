"""
Codebook: k-means quantizer for a single PQ sub-space.

Distance identity used in build_distance_table_row:
    ||c - q||^2 = ||c||^2 - 2*(c·q) + ||q||^2
"""
from __future__ import annotations
import numpy as np
from .kmeans import kmeans


class Codebook:
    """K-means quantizer for one sub-space."""

    def __init__(self, K: int) -> None:
        if not (1 <= K <= 256):
            raise ValueError(f"K must be in [1, 256]; got {K}.")
        self.K = K
        self.centroids: np.ndarray | None = None

    def train(self, sub_vectors: np.ndarray, seed: int = 42, max_iter: int = 100) -> None:
        """Learn K centroids from (N, D_sub) sub-vectors."""
        sub_vectors = np.asarray(sub_vectors, dtype=np.float32)
        self.centroids = kmeans(sub_vectors, K=self.K, max_iter=max_iter, seed=seed)

    def encode(self, sub_vector: np.ndarray) -> int:
        """Return index of nearest centroid to sub_vector. Raises RuntimeError if untrained."""
        return int(np.argmin(self.build_distance_table_row(sub_vector)))

    def build_distance_table_row(self, query_sub: np.ndarray) -> np.ndarray:
        """
        Compute squared distances from query_sub to every centroid.

        Uses: ||c - q||^2 = ||c||^2 - 2*(c·q) + ||q||^2

        Returns (K,) float32 array.
        """
        self._assert_trained()
        query_sub = np.asarray(query_sub, dtype=np.float32).ravel()
        c_sq = np.sum(self.centroids ** 2, axis=1)   # (K,)
        cross = self.centroids @ query_sub            # (K,)
        q_sq = float(np.dot(query_sub, query_sub))
        return (c_sq - 2.0 * cross + q_sq).astype(np.float32)

    def _assert_trained(self) -> None:
        if self.centroids is None:
            raise RuntimeError(
                "Codebook is not trained. Call train() before encode() or "
                "build_distance_table_row()."
            )

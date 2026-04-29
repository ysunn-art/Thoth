"""
Lloyd's k-means algorithm implemented with numpy only.

Initialisation: k-means++ (D^2 weighted sampling) for robust convergence.
Distance formula: ||x - c||^2 = ||x||^2 - 2*(x·c^T) + ||c||^2
Avoids (N, K, D) broadcast tensors; memory is O(N*K).
"""
import numpy as np


def _kmeans_plus_plus_init(X: np.ndarray, K: int, rng: np.random.Generator) -> np.ndarray:
    """K-means++ initialisation: spread initial centroids via D^2 weighting."""
    N, D = X.shape
    # Pick first centroid uniformly at random
    first = rng.integers(N)
    centroids = [X[first]]

    for _ in range(1, K):
        # Compute squared distance from each point to its nearest centroid so far
        c = np.array(centroids, dtype=np.float32)  # (j, D)
        x_sq = np.sum(X ** 2, axis=1)              # (N,)
        c_sq = np.sum(c ** 2, axis=1)              # (j,)
        cross = X @ c.T                             # (N, j)
        dists_sq = x_sq[:, None] - 2.0 * cross + c_sq[None, :]  # (N, j)
        min_dist_sq = np.maximum(dists_sq.min(axis=1), 0.0)      # (N,)

        # Sample next centroid with probability proportional to min_dist_sq
        total = min_dist_sq.sum()
        if total == 0:
            # All points are on existing centroids — pick any remaining index
            probs = np.ones(N) / N
        else:
            probs = min_dist_sq / total
        next_idx = rng.choice(N, p=probs)
        centroids.append(X[next_idx])

    return np.array(centroids, dtype=np.float32)


def kmeans(X: np.ndarray, K: int, max_iter: int = 100, seed: int = 42) -> np.ndarray:
    """
    Run Lloyd's k-means on X and return K centroids.

    Parameters
    ----------
    X        : (N, D) float32 array of training vectors.
    K        : Number of centroids (must be <= N).
    max_iter : Maximum Lloyd iterations.
    seed     : RNG seed for centroid initialisation.

    Returns
    -------
    centroids : (K, D) float32 array.
    """
    X = np.asarray(X, dtype=np.float32)
    N, D = X.shape
    if K > N:
        raise ValueError(f"K ({K}) cannot exceed the number of data points ({N}).")

    rng = np.random.default_rng(seed)
    centroids = _kmeans_plus_plus_init(X, K, rng)  # (K, D) float32
    labels = np.full(N, -1, dtype=np.int64)

    for _ in range(max_iter):
        # Assignment: dists[n, k] = ||X[n] - centroids[k]||^2
        x_sq = np.sum(X ** 2, axis=1, keepdims=True)           # (N, 1)
        c_sq = np.sum(centroids ** 2, axis=1, keepdims=True).T  # (1, K)
        cross = X @ centroids.T                                  # (N, K)
        dists = x_sq - 2.0 * cross + c_sq                       # (N, K)

        new_labels = np.argmin(dists, axis=1).astype(np.int64)  # (N,)

        # Update: recompute centroids; reinitialise any empty cluster
        counts = np.bincount(new_labels, minlength=K)  # (K,)
        new_centroids = np.zeros_like(centroids)
        np.add.at(new_centroids, new_labels, X)
        mask_nonempty = counts > 0
        new_centroids[mask_nonempty] /= counts[mask_nonempty, np.newaxis]
        # Reinitialize empty clusters
        empty_mask = ~mask_nonempty
        if empty_mask.any():
            new_centroids[empty_mask] = X[rng.integers(N, size=int(empty_mask.sum()))]

        # Convergence: stop when assignments stop changing
        if np.array_equal(new_labels, labels):
            centroids = new_centroids
            break

        labels = new_labels
        centroids = new_centroids

    return centroids.astype(np.float32)

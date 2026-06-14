"""
In-memory rate limiter + TTL cache — no external dependencies.

Rate limiter:
  Sliding window counter per (session_id, endpoint).
  Resets automatically after the window expires.

TTL cache:
  Wraps _registry_cache in main.py logic.
  Evicts sessions not accessed for TTL_SECONDS.
  Called periodically from the lifespan background task.
"""

import time
import threading
from collections import defaultdict

# ── Rate limiter config ───────────────────────────────────────────────────────

LIMITS: dict[str, tuple[int, int]] = {
    # endpoint_key: (max_requests, window_seconds)
    "upload":  (10, 60),   # 10 uploads per minute per session
    "chat":    (30, 60),   # 30 chat messages per minute per session
    "delete":  (20, 60),   # 20 deletes per minute per session
    "default": (60, 60),   # fallback for other endpoints
}

# ── TTL cache config ──────────────────────────────────────────────────────────

# Sessions not accessed for this long are evicted from the in-memory cache.
# Their registry files remain on Supabase Storage — eviction only frees RAM.
REGISTRY_TTL_SECONDS = 30 * 60   # 30 minutes

# How often the cleanup task runs (seconds)
CLEANUP_INTERVAL_SECONDS = 5 * 60  # every 5 minutes


# ── Rate limiter implementation ───────────────────────────────────────────────

class RateLimiter:
    """
    Sliding-window rate limiter keyed by (session_id, endpoint).

    Thread-safe via a threading.Lock (FastAPI runs in asyncio but the
    dict mutations are fast enough that a sync lock is fine here).
    """

    def __init__(self):
        # { (session_id, endpoint): [timestamp, ...] }
        self._windows: dict[tuple, list[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def is_allowed(self, session_id: str, endpoint: str) -> tuple[bool, int]:
        """
        Check whether the request is within the rate limit.

        Returns:
            (allowed: bool, retry_after_seconds: int)
        """
        max_req, window = LIMITS.get(endpoint, LIMITS["default"])
        now = time.time()
        key = (session_id, endpoint)

        with self._lock:
            # Evict timestamps outside the current window
            self._windows[key] = [
                t for t in self._windows[key] if now - t < window
            ]

            if len(self._windows[key]) >= max_req:
                # Time until the oldest request falls out of the window
                oldest = self._windows[key][0]
                retry_after = int(window - (now - oldest)) + 1
                return False, retry_after

            self._windows[key].append(now)
            return True, 0

    def cleanup(self):
        """Remove fully-expired windows to prevent unbounded growth."""
        now = time.time()
        with self._lock:
            expired = [
                key for key, timestamps in self._windows.items()
                if not timestamps or now - timestamps[-1] > max(w for _, w in LIMITS.values())
            ]
            for key in expired:
                del self._windows[key]


# ── TTL cache implementation ──────────────────────────────────────────────────

class TTLRegistryCache:
    """
    LRU-style TTL cache for session registries.

    Each access (read or write) refreshes the session's last-seen timestamp.
    A background task calls evict_expired() periodically to free RAM.
    """

    def __init__(self, ttl_seconds: int = REGISTRY_TTL_SECONDS):
        self._cache: dict[str, dict] = {}
        self._last_seen: dict[str, float] = {}
        self._ttl = ttl_seconds
        self._lock = threading.Lock()

    def get(self, session_id: str) -> dict | None:
        with self._lock:
            if session_id in self._cache:
                self._last_seen[session_id] = time.time()
                return self._cache[session_id]
            return None

    def set(self, session_id: str, registry: dict):
        with self._lock:
            self._cache[session_id] = registry
            self._last_seen[session_id] = time.time()

    def delete(self, session_id: str):
        with self._lock:
            self._cache.pop(session_id, None)
            self._last_seen.pop(session_id, None)

    def evict_expired(self) -> int:
        """Remove sessions not accessed within TTL. Returns eviction count."""
        now = time.time()
        with self._lock:
            expired = [
                sid for sid, last in self._last_seen.items()
                if now - last > self._ttl
            ]
            for sid in expired:
                del self._cache[sid]
                del self._last_seen[sid]
        if expired:
            print(f"[cache] Evicted {len(expired)} session(s): {[s[:8] for s in expired]}")
        return len(expired)

    @property
    def size(self) -> int:
        return len(self._cache)


# ── Singletons ────────────────────────────────────────────────────────────────

rate_limiter = RateLimiter()
registry_cache = TTLRegistryCache()

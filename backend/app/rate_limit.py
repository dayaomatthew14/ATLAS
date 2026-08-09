"""
A per-client request limiter for endpoints with no account to throttle against.

Most abuse in ATLAS is bounded per account: sign-in locks the account, a wrong
code burns one of that account's attempts, a resend spends one of that account's
daily sends. Registration has no account yet -- the request is what creates one
-- so the only thing left to count against is the caller.

Deliberately in-process, with no Redis:

  * It holds for one instance. Two backend replicas would each allow the full
    quota, so the effective limit doubles. That is a real weakening rather than
    a subtle one, and it is the reason to reach for shared storage before
    scaling out, not after.
  * It resets when the process restarts. A deploy clears every counter.

Both are acceptable for a limit whose job is to stop bulk automated signups
rather than to be an exact quota, and neither is acceptable silently, which is
why they are written down here.
"""

import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional

from fastapi import Request


class SlidingWindowLimiter:
    """
    Allow at most `limit` events per `window_seconds` for a given key.

    A sliding window rather than a fixed one: fixed windows let a caller spend
    the whole allowance at the end of one window and again at the start of the
    next, which is twice the intended rate at exactly the moment a burst hurts.
    """

    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window_seconds = window_seconds
        self._events: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float):
        cutoff = now - self.window_seconds
        events = self._events[key]
        while events and events[0] <= cutoff:
            events.popleft()
        if not events:
            # Keys are unbounded otherwise -- one entry per address ever seen,
            # held for the life of the process.
            self._events.pop(key, None)

    def check(self, key: str) -> Optional[int]:
        """
        Record an event. Returns None when allowed, else seconds until it is.

        The event is recorded only when allowed, so a caller hammering a limit
        they have already hit does not push their own reset further away.
        """
        now = time.monotonic()
        with self._lock:
            self._prune(key, now)
            events = self._events[key]
            if len(events) >= self.limit:
                retry_after = int(self.window_seconds - (now - events[0])) + 1
                return max(retry_after, 1)
            events.append(now)
            return None

    def reset(self, key: str):
        with self._lock:
            self._events.pop(key, None)


def client_key(request: Request) -> str:
    """
    Identify the caller.

    Railway terminates TLS in front of the app, so `request.client.host` is the
    proxy. ProxyHeadersMiddleware is installed and rewrites it from
    X-Forwarded-For, but that header is caller-supplied and only trustworthy
    because a trusted proxy overwrites it -- so this reads what the middleware
    resolved rather than the raw header.
    """
    client = request.client
    return client.host if client and client.host else "unknown"


# Registration is a human action taken once. A handful per hour from one address
# covers a shared campus connection without leaving room for bulk automation.
registration_limiter = SlidingWindowLimiter(limit=5, window_seconds=3600)

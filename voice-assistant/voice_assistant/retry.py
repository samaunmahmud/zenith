"""A small exponential-backoff helper shared by the Gemini and OpenAI clients."""

from __future__ import annotations

import logging
import random
import time
from collections.abc import Callable
from typing import TypeVar

T = TypeVar("T")

log = logging.getLogger(__name__)


def call_with_retries(
    fn: Callable[[], T],
    *,
    retries: int,
    is_retryable: Callable[[BaseException], bool],
    what: str,
    base_delay: float = 1.0,
    max_delay: float = 12.0,
    sleep: Callable[[float], None] = time.sleep,
) -> T:
    """Call ``fn`` and retry transient failures with exponential backoff and jitter.

    Args:
        fn: Zero-argument callable doing the actual request.
        retries: How many extra attempts after the first one fails.
        is_retryable: Decides whether an exception is transient (rate limit, 5xx, network).
            Anything else is re-raised immediately.
        what: Human-readable name of the operation, used in log lines.
        base_delay: Delay before the first retry; doubles each time.
        max_delay: Upper bound on any single delay.
        sleep: Injected for tests.

    Returns:
        Whatever ``fn`` returns.

    Raises:
        The last exception raised by ``fn`` once retries are exhausted or it isn't retryable.
    """
    attempt = 0
    while True:
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001 - we re-raise anything we don't handle
            if attempt >= retries or not is_retryable(exc):
                raise
            delay = min(max_delay, base_delay * (2**attempt)) + random.uniform(0, 0.4)
            attempt += 1
            log.warning("%s failed (%s). Retry %d/%d in %.1fs...", what, _describe(exc), attempt, retries, delay)
            sleep(delay)


def _describe(exc: BaseException) -> str:
    code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    name = type(exc).__name__
    return f"{name} {code}" if code else name

"""Per-process runtime state and the shared request pipeline."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, TypeVar

from fastapi import Request
from pydantic import BaseModel, ValidationError

from .auth import ReplayCache, TokenVerifier, VerifiedToken
from .errors import RuntimeFailure
from .log import JsonLogger
from .policy import Policy
from .providers.mock import MockEchoProvider
from .settings import Settings

T = TypeVar("T")
M = TypeVar("M", bound=BaseModel)


@dataclass
class InFlight:
    """A non-blocking global cap. No wait queue: full means 429 BUSY now."""

    limit: int
    active: int = field(default=0)

    def try_acquire(self) -> bool:
        if self.active >= self.limit:
            return False
        self.active += 1
        return True

    def release(self) -> None:
        self.active -= 1


@dataclass
class Runtime:
    settings: Settings
    policy: Policy
    verifier: TokenVerifier
    replay: ReplayCache
    in_flight: InFlight
    logger: JsonLogger
    provider: MockEchoProvider


def get_runtime(request: Request) -> Runtime:
    return request.app.state.runtime


def get_provider(request: Request) -> MockEchoProvider:
    """Overridden in tests (app.dependency_overrides) to inject delay or
    blocking. No request field can do that."""
    return get_runtime(request).provider


def log_fields(request: Request) -> dict[str, Any]:
    return request.scope.setdefault("state", {}).setdefault("log", {})


def authenticate(request: Request, scope: str) -> VerifiedToken:
    """Check-order steps 2-6 (auth.py)."""
    runtime = get_runtime(request)
    try:
        return runtime.verifier.verify(
            authorization=request.headers.get("authorization"),
            request_id=request.headers.get("x-request-id"),
            body=request.scope.get("state", {}).get("raw_body", b""),
            scope=scope,
        )
    except RuntimeFailure as failure:
        log_fields(request)["authFailure"] = failure.auth_failure
        raise


def parse_body(request: Request, model: type[M]) -> M:
    """Step 7: JSON parse + strict validation. Errors carry no input."""
    raw = request.scope.get("state", {}).get("raw_body", b"")
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise RuntimeFailure("INVALID_REQUEST", message="The request body is not valid JSON.") from None
    try:
        return model.model_validate(data)
    except ValidationError as error:
        paths = sorted({".".join(str(part) for part in item["loc"]) or "(root)" for item in error.errors()})
        message = "Invalid fields: " + ", ".join(paths)
        raise RuntimeFailure("INVALID_REQUEST", message=message[:500]) from None


async def run_bounded(request: Request, work: Callable[[], Awaitable[T]]) -> T:
    """Step 10: an in-flight slot, then the server deadline."""
    runtime = get_runtime(request)
    if not runtime.in_flight.try_acquire():
        raise RuntimeFailure("BUSY", retry_after_ms=1000)
    try:
        return await asyncio.wait_for(work(), timeout=runtime.settings.request_timeout_ms / 1000)
    except asyncio.TimeoutError:
        raise RuntimeFailure("TIMEOUT") from None
    finally:
        runtime.in_flight.release()

"""Pure ASGI middleware: request log line, contract header, body limits.

Order (outermost first): RequestLog -> BodyLimit -> app. The log wraps
everything so a 413/415 is logged too; the body limit runs before any route,
so nothing unauthenticated or oversized reaches JSON parsing."""

from __future__ import annotations

import re
import time
from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .contract import AI_CONTRACT_VERSION
from .errors import RuntimeFailure, envelope_response
from .log import JsonLogger

_REQUEST_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")
_BODY_METHODS = {"POST", "PUT", "PATCH"}


def _header(scope: Scope, name: bytes) -> str | None:
    for key, value in scope.get("headers", []):
        if key.lower() == name:
            return value.decode("latin-1")
    return None


class RequestLogMiddleware:
    def __init__(self, app: ASGIApp, logger: JsonLogger) -> None:
        self.app = app
        self.logger = logger

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = time.perf_counter()
        incoming = _header(scope, b"x-request-id")
        fields: dict[str, Any] = {
            "event": "request",
            "method": scope["method"],
            "path": scope["path"],
            "rid": incoming if incoming and _REQUEST_ID.match(incoming) else None,
        }
        scope.setdefault("state", {})["log"] = fields

        async def send_with_header(message: Message) -> None:
            if message["type"] == "http.response.start":
                fields["status"] = message["status"]
                headers = list(message.get("headers", []))
                headers.append((b"x-contract-version", AI_CONTRACT_VERSION.encode()))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_header)
        except Exception as exc:  # noqa: BLE001 - the last line of defence
            # Swallowed here, not re-raised: Starlette's ServerErrorMiddleware
            # and Uvicorn would print a traceback, and tracebacks carry values.
            fields["errorCode"] = "INTERNAL"
            fields["exception"] = type(exc).__name__
            if "status" not in fields:
                await envelope_response(RuntimeFailure("INTERNAL"))(scope, receive, send_with_header)
        finally:
            fields["latencyMs"] = int((time.perf_counter() - started) * 1000)
            status = fields.get("status", 500)
            self.logger.log("error" if status >= 500 else "warning" if status >= 400 else "info", fields)


class BodyLimitMiddleware:
    """413 over the cap (declared or streamed), 415 for a non-JSON body, both
    before the app runs. The body is buffered here and replayed, so routes
    read it from memory and the cap can't be bypassed by chunked encoding."""

    def __init__(self, app: ASGIApp, max_body_bytes: int) -> None:
        self.app = app
        self.max = max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        if scope["method"] not in _BODY_METHODS:
            scope.setdefault("state", {})["raw_body"] = b""
            await self.app(scope, receive, send)
            return

        declared = _header(scope, b"content-length")
        if declared is not None:
            try:
                too_big = int(declared) > self.max
            except ValueError:
                too_big = True
            if too_big:
                await self._reject(scope, receive, send, RuntimeFailure("PAYLOAD_TOO_LARGE"))
                return

        content_type = (_header(scope, b"content-type") or "").split(";")[0].strip().lower()
        if content_type != "application/json":
            await self._reject(scope, receive, send, RuntimeFailure("UNSUPPORTED_MEDIA"))
            return

        chunks: list[bytes] = []
        total = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            total += len(chunk)
            if total > self.max:
                await self._reject(scope, receive, send, RuntimeFailure("PAYLOAD_TOO_LARGE"))
                return
            chunks.append(chunk)
            if not message.get("more_body", False):
                break

        body = b"".join(chunks)
        # Routes hash and parse exactly these bytes (request.state.raw_body).
        scope.setdefault("state", {})["raw_body"] = body
        replayed = False

        async def replay() -> Message:
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        await self.app(scope, replay, send)

    @staticmethod
    async def _reject(scope: Scope, receive: Receive, send: Send, failure: RuntimeFailure) -> None:
        scope["state"].get("log", {})["errorCode"] = failure.code
        await envelope_response(failure)(scope, receive, send)

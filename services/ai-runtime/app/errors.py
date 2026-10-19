"""The error envelope. Messages are fixed strings: none ever echoes input."""

from __future__ import annotations

from starlette.responses import JSONResponse

from .contract import ErrorCode

_STATUS: dict[str, int] = {
    "INVALID_REQUEST": 400,
    "UNAUTHORIZED": 401,
    "POLICY_DENIED": 403,
    "PAYLOAD_TOO_LARGE": 413,
    "UNSUPPORTED_MEDIA": 415,
    "BUSY": 429,
    "INTERNAL": 500,
    "TIMEOUT": 504,
}

_MESSAGES: dict[str, str] = {
    "INVALID_REQUEST": "The request is invalid.",
    "UNAUTHORIZED": "Invalid service credentials.",
    "POLICY_DENIED": "This caller may not run this task.",
    "PAYLOAD_TOO_LARGE": "The request body is too large.",
    "UNSUPPORTED_MEDIA": "Only application/json is accepted.",
    "BUSY": "The runtime is busy.",
    "INTERNAL": "Internal error.",
    "TIMEOUT": "The task did not finish in time.",
}

_RETRYABLE = frozenset({"BUSY", "TIMEOUT"})


class RuntimeFailure(Exception):
    """Raised anywhere in request handling; rendered as the envelope.

    `auth_failure` is the specific 401 reason, logged as an enum and never
    returned, so every 401 body is identical."""

    def __init__(
        self,
        code: ErrorCode,
        *,
        message: str | None = None,
        status: int | None = None,
        auth_failure: str | None = None,
        retry_after_ms: int | None = None,
    ) -> None:
        super().__init__(code)
        self.code = code
        self.message = message or _MESSAGES[code]
        self.status = status or _STATUS[code]
        self.auth_failure = auth_failure
        self.retry_after_ms = retry_after_ms


def envelope_response(failure: RuntimeFailure) -> JSONResponse:
    error: dict[str, object] = {
        "code": failure.code,
        "message": failure.message,
        "retryable": failure.code in _RETRYABLE,
    }
    if failure.retry_after_ms is not None:
        error["retryAfterMs"] = failure.retry_after_ms
    return JSONResponse({"error": error}, status_code=failure.status)

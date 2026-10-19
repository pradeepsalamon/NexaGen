"""One JSON line per request, metadata only (PHASE1_SPEC.md §5.4).

Never headers, bodies, tokens, secrets or echo text. Exceptions are logged by
type name only: a pydantic ValidationError's text contains the input value."""

from __future__ import annotations

import json
import sys
import time
from typing import Any, TextIO

_LEVELS = {"debug": 10, "info": 20, "warning": 30, "error": 40}

# The only keys a request line may carry. Anything else is dropped, so a
# careless caller can't route request content into the log.
ALLOWED_FIELDS = frozenset(
    {
        "authFailure",
        "dataClass",
        "errorCode",
        "event",
        "exception",
        "latencyMs",
        "method",
        "model",
        "path",
        "provider",
        "rid",
        "status",
        "task",
    }
)


class JsonLogger:
    def __init__(self, level: str = "info", stream: TextIO | None = None) -> None:
        self._threshold = _LEVELS.get(level, 20)
        self._stream = stream

    def log(self, level: str, fields: dict[str, Any]) -> None:
        if _LEVELS.get(level, 20) < self._threshold:
            return
        line = {key: value for key, value in fields.items() if key in ALLOWED_FIELDS and value is not None}
        line["level"] = level
        line["ts"] = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z"
        stream = self._stream or sys.stdout
        stream.write(json.dumps(line, sort_keys=True) + "\n")
        stream.flush()

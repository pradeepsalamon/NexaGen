from __future__ import annotations

import io
import json
import secrets
import time
import uuid
from pathlib import Path
from typing import Any

import jwt
import pytest
from starlette.testclient import TestClient

from app.auth import body_hash
from app.log import JsonLogger
from app.main import create_app
from app.settings import load_settings

ROOT = Path(__file__).resolve().parent.parent
CONTRACT_DIR = ROOT / "contract" / "v1"
RID = "req-12345678"
SENTINEL = "SENTINEL-do-not-log-7f3a"


def new_secret() -> str:
    return secrets.token_urlsafe(48)


def echo_body(text: str = "hello", **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "dataClass": "PUBLIC",
        "input": {"text": text},
        "route": "mock:echo",
        "task": "diagnostic.echo.v1",
    }
    body.update(overrides)
    return body


def encode(data: Any) -> bytes:
    return json.dumps(data, separators=(",", ":")).encode()


def claims_for(scope: str, body: bytes | None = None, **overrides: Any) -> dict[str, Any]:
    now = int(time.time())
    claims: dict[str, Any] = {
        "aud": "ai-runtime",
        "exp": now + 30,
        "iat": now,
        "iss": "nexa-api",
        "jti": str(uuid.uuid4()),
        "rid": RID,
        "scope": scope,
        "ver": 1,
    }
    if scope == "runtime:diagnostic.echo":
        claims.update(task="diagnostic.echo.v1", dataClass="PUBLIC")
    if body is not None:
        claims["bh"] = body_hash(body)
    for key, value in overrides.items():
        if value is ...:
            claims.pop(key, None)
        else:
            claims[key] = value
    return claims


def sign(claims: dict[str, Any], secret: str, algorithm: str = "HS256") -> str:
    return jwt.encode(claims, secret, algorithm=algorithm)


class Runtime:
    """A TestClient plus the secret, a captured log and signing helpers."""

    def __init__(self, env: dict[str, str] | None = None) -> None:
        self.secret = new_secret()
        self.log_stream = io.StringIO()
        settings = load_settings({"AI_RUNTIME_SHARED_SECRET": self.secret, **(env or {})})
        self.app = create_app(settings, JsonLogger("debug", self.log_stream))
        self.client = TestClient(self.app, raise_server_exceptions=False)

    def logs(self) -> list[dict[str, Any]]:
        return [json.loads(line) for line in self.log_stream.getvalue().splitlines() if line]

    def headers(self, token: str | None, rid: str = RID, content_type: str | None = "application/json") -> dict[str, str]:
        headers = {"X-Request-Id": rid, "X-Contract-Version": "1.0"}
        if token is not None:
            headers["Authorization"] = f"Bearer {token}"
        if content_type:
            headers["Content-Type"] = content_type
        return headers

    def echo(self, body: Any = None, *, claims: dict[str, Any] | None = None, secret: str | None = None,
             raw: bytes | None = None, rid: str = RID, token: str | None | object = ...):
        data = raw if raw is not None else encode(body if body is not None else echo_body())
        if token is ...:
            token = sign(claims or claims_for("runtime:diagnostic.echo", data), secret or self.secret)
        return self.client.post("/v1/diagnostic/echo", content=data, headers=self.headers(token, rid))  # type: ignore[arg-type]

    def info_token(self, **overrides: Any) -> str:
        return sign(claims_for("runtime:info", **overrides), self.secret)


@pytest.fixture
def runtime() -> Runtime:
    return Runtime()

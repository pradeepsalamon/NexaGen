"""Test 15: input text, the secret and the token never reach a log or an
error body, on success or on any error path."""

from __future__ import annotations

import time

from app.log import ALLOWED_FIELDS
from app.runtime import get_provider
from tests.conftest import SENTINEL, Runtime, claims_for, echo_body, encode, sign


class _Exploding:
    name = "mock"
    model = "echo"

    async def echo(self, text: str) -> dict[str, object]:
        raise ValueError(f"provider blew up on {text}")

    def ready(self) -> bool:
        return True


def _assert_clean(rt: Runtime, *responses, token: str | None = None) -> None:
    captured = rt.log_stream.getvalue()
    forbidden = [SENTINEL, rt.secret] + ([token] if token else [])
    for value in forbidden:
        assert value not in captured
        for response in responses:
            assert value not in response.text
    for line in rt.logs():
        assert set(line) - {"level", "ts"} <= ALLOWED_FIELDS


def test_success_logs_metadata_only() -> None:
    rt = Runtime()
    body = encode(echo_body(SENTINEL))
    token = sign(claims_for("runtime:diagnostic.echo", body), rt.secret)
    response = rt.echo(raw=body, token=token)
    assert response.status_code == 200
    line = rt.logs()[-1]
    assert line["rid"] == "req-12345678"
    assert line["task"] == "diagnostic.echo.v1"
    assert line["provider"] == "mock"
    assert line["status"] == 200
    # The sentinel comes back to the caller (it is an echo), but is never logged.
    assert SENTINEL not in rt.log_stream.getvalue()
    assert token not in rt.log_stream.getvalue()


def test_error_paths_never_echo_input() -> None:
    rt = Runtime({"AI_RUNTIME_REQUEST_TIMEOUT_MS": "200"})
    responses = [
        rt.echo(echo_body(SENTINEL, permissions=[SENTINEL])),  # 400 extra field
        rt.echo(echo_body(SENTINEL * 20)),  # 400 too long
        rt.echo(raw=f'{{"task": "{SENTINEL}"'.encode()),  # 400 malformed
        rt.echo(echo_body(SENTINEL, task=SENTINEL)),  # 400 wrong literal
        rt.echo(echo_body(SENTINEL), secret="x" * 48),  # 401
        rt.client.post("/v1/diagnostic/echo", content=SENTINEL.encode(), headers=rt.headers(None, content_type="text/plain")),
        rt.client.post("/v1/diagnostic/echo", content=(SENTINEL * 1000).encode(), headers=rt.headers(None)),
    ]
    assert [r.status_code for r in responses] == [400, 400, 400, 400, 401, 415, 413]
    _assert_clean(rt, *responses)


def test_expired_token_is_not_logged() -> None:
    rt = Runtime()
    body = encode(echo_body(SENTINEL))
    now = int(time.time())
    token = sign(claims_for("runtime:diagnostic.echo", body, iat=now - 100, exp=now - 70), rt.secret)
    response = rt.echo(raw=body, token=token)
    assert response.status_code == 401
    assert rt.logs()[-1]["authFailure"] == "expired"
    _assert_clean(rt, response, token=token)


def test_unhandled_exception_logs_type_only() -> None:
    rt = Runtime()
    rt.app.dependency_overrides[get_provider] = lambda: _Exploding()
    response = rt.echo(echo_body(SENTINEL))
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INTERNAL"
    line = rt.logs()[-1]
    assert line["exception"] == "ValueError"
    assert line["status"] == 500
    _assert_clean(rt, response)

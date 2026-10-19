"""Test 13: body size, media type, validation, in-flight cap, deadline."""

from __future__ import annotations

import asyncio
import threading

from app.runtime import get_provider
from tests.conftest import Runtime, echo_body


def test_body_over_cap_with_content_length(runtime: Runtime) -> None:
    raw = b"x" * (16384 + 1)
    response = runtime.client.post(
        "/v1/diagnostic/echo", content=raw, headers=runtime.headers(runtime.info_token())
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"


def test_body_over_cap_when_chunked(runtime: Runtime) -> None:
    def chunks():
        for _ in range(17):
            yield b"x" * 1024

    response = runtime.client.post(
        "/v1/diagnostic/echo", content=chunks(), headers=runtime.headers(runtime.info_token())
    )
    assert "content-length" not in {k.lower() for k in response.request.headers}
    assert response.status_code == 413


def test_oversize_is_rejected_before_auth(runtime: Runtime) -> None:
    response = runtime.client.post("/v1/diagnostic/echo", content=b"x" * 20000, headers=runtime.headers(None))
    assert response.status_code == 413


def test_non_json_content_type(runtime: Runtime) -> None:
    response = runtime.client.post(
        "/v1/diagnostic/echo", content=b"hello", headers=runtime.headers(runtime.info_token(), content_type="text/plain")
    )
    assert response.status_code == 415
    assert response.json()["error"]["code"] == "UNSUPPORTED_MEDIA"


def test_malformed_json(runtime: Runtime) -> None:
    response = runtime.echo(raw=b"{not json")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


def test_extra_field_is_rejected(runtime: Runtime) -> None:
    response = runtime.echo(echo_body(permissions=["admin"]))
    assert response.status_code == 400
    assert "permissions" in response.json()["error"]["message"]


def test_text_over_200_characters(runtime: Runtime) -> None:
    response = runtime.echo(echo_body("a" * 201))
    assert response.status_code == 400
    assert "a" * 50 not in response.text


class _BlockingProvider:
    name = "mock"
    model = "echo"

    def __init__(self) -> None:
        self.started = threading.Event()
        self.release = asyncio.Event()

    async def echo(self, text: str) -> dict[str, object]:
        self.started.set()
        await self.release.wait()
        return {"echo": text, "length": len(text)}

    def ready(self) -> bool:
        return True


class _SlowProvider(_BlockingProvider):
    async def echo(self, text: str) -> dict[str, object]:
        await asyncio.sleep(5)
        return {"echo": text, "length": len(text)}


def test_in_flight_full_is_busy() -> None:
    rt = Runtime({"AI_RUNTIME_MAX_IN_FLIGHT": "1", "AI_RUNTIME_REQUEST_TIMEOUT_MS": "3000"})
    blocker = _BlockingProvider()
    rt.app.dependency_overrides[get_provider] = lambda: blocker
    results: dict[str, int] = {}

    with rt.client:
        first = threading.Thread(target=lambda: results.setdefault("first", rt.echo().status_code))
        first.start()
        assert blocker.started.wait(5)
        busy = rt.echo()
        results["second"] = busy.status_code
        assert busy.json()["error"] == {
            "code": "BUSY",
            "message": "The runtime is busy.",
            "retryAfterMs": 1000,
            "retryable": True,
        }
        first.join(10)

    assert results["second"] == 429
    assert results["first"] == 504  # never released, so it hit the deadline


def test_slow_provider_times_out() -> None:
    rt = Runtime({"AI_RUNTIME_REQUEST_TIMEOUT_MS": "200"})
    rt.app.dependency_overrides[get_provider] = lambda: _SlowProvider()
    response = rt.echo()
    assert response.status_code == 504
    assert response.json()["error"]["code"] == "TIMEOUT"


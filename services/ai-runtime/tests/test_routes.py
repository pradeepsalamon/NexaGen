"""Test 14 + 19: generated docs are gone; health and readiness behave."""

from __future__ import annotations

import pytest

from tests.conftest import Runtime


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"])
def test_docs_are_disabled(runtime: Runtime, path: str) -> None:
    response = runtime.client.get(path)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


def test_unknown_path_is_an_envelope_404(runtime: Runtime) -> None:
    response = runtime.client.get("/v1/generate")
    assert response.status_code == 404
    assert set(response.json()) == {"error"}


def test_wrong_method_is_an_envelope(runtime: Runtime) -> None:
    response = runtime.client.get("/v1/diagnostic/echo")
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


def test_healthz_needs_no_token_and_reveals_nothing(runtime: Runtime) -> None:
    response = runtime.client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["x-contract-version"] == "1.0"


@pytest.mark.parametrize("path", ["/readyz", "/v1/info"])
def test_info_routes_need_a_token(runtime: Runtime, path: str) -> None:
    assert runtime.client.get(path).status_code == 401


def test_readyz_with_info_scope(runtime: Runtime) -> None:
    response = runtime.client.get("/readyz", headers=runtime.headers(runtime.info_token(), content_type=None))
    assert response.status_code == 200
    assert response.json() == {"providers": {"mock": "ready"}, "status": "ready"}


def test_info_with_info_scope(runtime: Runtime) -> None:
    response = runtime.client.get("/v1/info", headers=runtime.headers(runtime.info_token(), content_type=None))
    assert response.status_code == 200
    assert response.json() == {
        "contractVersions": ["1.0"],
        "providers": ["mock"],
        "service": "ai-runtime",
        "tasks": ["diagnostic.echo.v1"],
        "version": "0.1.0",
    }

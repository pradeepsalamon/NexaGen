"""Test 11: service-token verification (PHASE1_SPEC.md §3.2)."""

from __future__ import annotations

import base64
import json
import time

import pytest

from tests.conftest import RID, Runtime, claims_for, echo_body, encode, new_secret, sign

UNAUTHORIZED_BODY = {"error": {"code": "UNAUTHORIZED", "message": "Invalid service credentials.", "retryable": False}}


def _b64(data: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()


def test_authorized_echo(runtime: Runtime) -> None:
    response = runtime.echo(echo_body("hello"))
    assert response.status_code == 200
    assert response.json()["output"] == {"echo": "hello", "length": 5}
    assert response.headers["x-contract-version"] == "1.0"


def _unauthorized_cases(runtime: Runtime) -> dict[str, tuple[dict | None, dict]]:
    body = encode(echo_body())
    now = int(time.time())
    return {
        "missing": (None, {"token": None}),
        "non-bearer": (None, {"token": "unused"}),
        "bad signature": (None, {"secret": new_secret()}),
        "expired beyond leeway": (claims_for("runtime:diagnostic.echo", body, iat=now - 40, exp=now - 10), {}),
        "iat in the future": (claims_for("runtime:diagnostic.echo", body, iat=now + 30, exp=now + 60), {}),
        "lifetime 61s": (claims_for("runtime:diagnostic.echo", body, iat=now, exp=now + 61), {}),
        "wrong aud": (claims_for("runtime:diagnostic.echo", body, aud="nexa-api"), {}),
        "aud array": (claims_for("runtime:diagnostic.echo", body, aud=["ai-runtime"]), {}),
        "wrong iss": (claims_for("runtime:diagnostic.echo", body, iss="other"), {}),
        "rid mismatch": (claims_for("runtime:diagnostic.echo", body, rid="req-87654321"), {}),
        "bh mismatch": (claims_for("runtime:diagnostic.echo", encode(echo_body("other"))), {}),
        "bh missing": (claims_for("runtime:diagnostic.echo", None), {}),
        "missing jti": (claims_for("runtime:diagnostic.echo", body, jti=...), {}),
        "extra claim": (claims_for("runtime:diagnostic.echo", body, role="SUPER_ADMIN"), {}),
        "ver 2": (claims_for("runtime:diagnostic.echo", body, ver=2), {}),
        "task missing on a task scope": (claims_for("runtime:diagnostic.echo", body, task=...), {}),
    }


@pytest.mark.parametrize(
    "case",
    [
        "missing",
        "non-bearer",
        "bad signature",
        "expired beyond leeway",
        "iat in the future",
        "lifetime 61s",
        "wrong aud",
        "aud array",
        "wrong iss",
        "rid mismatch",
        "bh mismatch",
        "bh missing",
        "missing jti",
        "extra claim",
        "ver 2",
        "task missing on a task scope",
    ],
)
def test_unauthorized_cases_share_one_body(runtime: Runtime, case: str) -> None:
    claims, kwargs = _unauthorized_cases(runtime)[case]
    if case == "non-bearer":
        response = runtime.client.post(
            "/v1/diagnostic/echo",
            content=encode(echo_body()),
            headers={**runtime.headers(None), "Authorization": "Basic abc"},
        )
    else:
        response = runtime.echo(echo_body(), claims=claims, **kwargs)
    assert response.status_code == 401, case
    assert response.json() == UNAUTHORIZED_BODY
    assert runtime.logs()[-1]["authFailure"]


def test_within_leeway_is_accepted(runtime: Runtime) -> None:
    body = encode(echo_body())
    now = int(time.time())
    claims = claims_for("runtime:diagnostic.echo", body, iat=now - 33, exp=now - 3)
    assert runtime.echo(raw=body, claims=claims).status_code == 200


@pytest.mark.parametrize("alg_header", ["none", "HS512"])
def test_other_algorithms_are_rejected(runtime: Runtime, alg_header: str) -> None:
    body = encode(echo_body())
    claims = claims_for("runtime:diagnostic.echo", body)
    if alg_header == "none":
        token = f"{_b64({'alg': 'none', 'typ': 'JWT'})}.{_b64(claims)}."
    else:
        token = sign(claims, runtime.secret, algorithm="HS512")
    response = runtime.echo(raw=body, token=token)
    assert response.status_code == 401
    assert response.json() == UNAUTHORIZED_BODY
    assert runtime.logs()[-1]["authFailure"] == "bad_alg"


def test_wrong_scope_is_policy_denied(runtime: Runtime) -> None:
    body = encode(echo_body())
    claims = claims_for("runtime:info", body)
    response = runtime.echo(raw=body, claims=claims)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "POLICY_DENIED"


def test_wrong_task_is_policy_denied(runtime: Runtime) -> None:
    body = encode(echo_body())
    response = runtime.echo(raw=body, claims=claims_for("runtime:diagnostic.echo", body, task="class.summary.v1"))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "POLICY_DENIED"


def test_data_class_mismatch_is_policy_denied(runtime: Runtime) -> None:
    body = encode(echo_body())
    response = runtime.echo(raw=body, claims=claims_for("runtime:diagnostic.echo", body, dataClass="PERSONAL_STUDENT"))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "POLICY_DENIED"


def test_replayed_jti_is_rejected(runtime: Runtime) -> None:
    body = encode(echo_body())
    claims = claims_for("runtime:diagnostic.echo", body)
    assert runtime.echo(raw=body, claims=claims).status_code == 200
    replay = runtime.echo(raw=body, claims=claims)
    assert replay.status_code == 401
    assert replay.json() == UNAUTHORIZED_BODY
    assert runtime.logs()[-1]["authFailure"] == "replay"


def test_previous_secret_is_accepted_during_rotation() -> None:
    old = new_secret()
    rt = Runtime({"AI_RUNTIME_SHARED_SECRET_PREVIOUS": old})
    body = encode(echo_body())
    assert rt.echo(raw=body, secret=old).status_code == 200
    assert rt.echo(raw=body, secret=rt.secret).status_code == 200
    assert rt.echo(raw=body, secret=new_secret()).status_code == 401


def test_info_scope_rejects_task_claims(runtime: Runtime) -> None:
    token = runtime.info_token(task="diagnostic.echo.v1", dataClass="PUBLIC")
    response = runtime.client.get("/readyz", headers=runtime.headers(token, content_type=None))
    assert response.status_code == 401


def test_echo_scope_cannot_read_info(runtime: Runtime) -> None:
    token = sign(claims_for("runtime:diagnostic.echo"), runtime.secret)
    response = runtime.client.get("/v1/info", headers=runtime.headers(token, content_type=None))
    assert response.status_code == 403


def test_request_id_header_required(runtime: Runtime) -> None:
    body = encode(echo_body())
    token = sign(claims_for("runtime:diagnostic.echo", body), runtime.secret)
    headers = runtime.headers(token)
    del headers["X-Request-Id"]
    response = runtime.client.post("/v1/diagnostic/echo", content=body, headers=headers)
    assert response.status_code == 401
    assert RID not in response.text

"""Service-token verification (PHASE1_SPEC.md §3.2, check-order steps 2-6).

The runtime never sees a user: NestJS authorizes users. This only proves the
caller is the API holding the shared secret, for this endpoint, this request
id and these exact body bytes. Every 401 gets the same body; the reason is
logged as an enum and the token is never logged."""

from __future__ import annotations

import base64
import hashlib
import hmac
import re
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable

import jwt

from .contract import AI_CONTRACT_MAJOR
from .errors import RuntimeFailure

ISSUER = "nexa-api"
AUDIENCE = "ai-runtime"
LEEWAY_SECONDS = 5
MAX_LIFETIME_SECONDS = 60
REPLAY_WINDOW_SECONDS = 90
REPLAY_CAPACITY = 10_000

_REQUEST_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")
_UUID4 = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
_REQUIRED = ("iss", "aud", "iat", "exp", "jti", "scope", "rid", "ver")
_OPTIONAL = ("task", "dataClass", "bh")
_TASK_SCOPED = {"runtime:diagnostic.echo"}


def _unauthorized(reason: str) -> RuntimeFailure:
    return RuntimeFailure("UNAUTHORIZED", auth_failure=reason)


def body_hash(body: bytes) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(body).digest()).rstrip(b"=").decode("ascii")


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


@dataclass(frozen=True)
class VerifiedToken:
    jti: str
    exp: int
    scope: str
    task: str | None
    data_class: str | None


class TokenVerifier:
    def __init__(self, secret: str, previous_secret: str | None, clock: Callable[[], float] = time.time) -> None:
        self._secrets = [secret] + ([previous_secret] if previous_secret else [])
        self._clock = clock

    def verify(self, *, authorization: str | None, request_id: str | None, body: bytes, scope: str) -> VerifiedToken:
        # 2. Bearer present
        if not authorization:
            raise _unauthorized("missing")
        kind, _, token = authorization.partition(" ")
        if kind != "Bearer" or not token or " " in token:
            raise _unauthorized("missing")

        # 3. Signature (current secret, then previous), alg, claim set
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError:
            raise _unauthorized("bad_signature") from None
        if header.get("alg") != "HS256":
            raise _unauthorized("bad_alg")
        claims = self._decode(token)
        self._check_claims(claims)

        # 4. Scope for this endpoint
        if claims["scope"] != scope:
            raise RuntimeFailure("POLICY_DENIED")

        # 5. Request id binding
        if not request_id or request_id != claims["rid"]:
            raise _unauthorized("rid_mismatch")

        # 6. Body binding, over the raw bytes, before any JSON parsing
        expected = claims.get("bh")
        if expected is None:
            if body:
                raise _unauthorized("body_mismatch")
        elif not hmac.compare_digest(str(expected), body_hash(body)):
            raise _unauthorized("body_mismatch")

        return VerifiedToken(
            jti=claims["jti"],
            exp=claims["exp"],
            scope=claims["scope"],
            task=claims.get("task"),
            data_class=claims.get("dataClass"),
        )

    def _decode(self, token: str) -> dict[str, Any]:
        for secret in self._secrets:
            try:
                # Signature only; every claim is checked explicitly below so
                # the rules (and their failure reasons) are exactly §3.2.
                return jwt.decode(
                    token,
                    secret,
                    algorithms=["HS256"],
                    options={
                        "verify_aud": False,
                        "verify_exp": False,
                        "verify_iat": False,
                        "verify_iss": False,
                        "verify_nbf": False,
                        "verify_signature": True,
                    },
                )
            except jwt.InvalidSignatureError:
                continue
            except jwt.PyJWTError:
                raise _unauthorized("bad_signature") from None
        raise _unauthorized("bad_signature")

    def _check_claims(self, claims: dict[str, Any]) -> None:
        if any(key not in claims for key in _REQUIRED):
            raise _unauthorized("bad_claims")
        if any(key not in _REQUIRED and key not in _OPTIONAL for key in claims):
            raise _unauthorized("bad_claims")
        if claims["iss"] != ISSUER:
            raise _unauthorized("wrong_iss")
        if not isinstance(claims["aud"], str) or claims["aud"] != AUDIENCE:
            raise _unauthorized("wrong_aud")

        iat, exp = claims["iat"], claims["exp"]
        if not _is_int(iat) or not _is_int(exp) or exp - iat > MAX_LIFETIME_SECONDS or exp < iat:
            raise _unauthorized("bad_claims")
        now = self._clock()
        if iat > now + LEEWAY_SECONDS:
            raise _unauthorized("bad_claims")
        if now > exp + LEEWAY_SECONDS:
            raise _unauthorized("expired")

        if not isinstance(claims["jti"], str) or not _UUID4.match(claims["jti"]):
            raise _unauthorized("bad_claims")
        if not isinstance(claims["rid"], str) or not _REQUEST_ID.match(claims["rid"]):
            raise _unauthorized("bad_claims")
        if not _is_int(claims["ver"]) or claims["ver"] != AI_CONTRACT_MAJOR:
            raise _unauthorized("bad_claims")
        if not isinstance(claims["scope"], str):
            raise _unauthorized("bad_claims")
        for key in _OPTIONAL:
            if key in claims and not isinstance(claims[key], str):
                raise _unauthorized("bad_claims")

        # task/dataClass belong to task scopes only. Their *values* are the
        # policy's job (403), not a credential failure.
        task_scoped = claims["scope"] in _TASK_SCOPED
        if task_scoped != ("task" in claims) or task_scoped != ("dataClass" in claims):
            raise _unauthorized("bad_claims")


class ReplayCache:
    """jti values seen within the replay window. Per process: the runtime runs
    exactly one Uvicorn worker, and a restart within a token's lifetime
    forgets it (OD-21). When full it refuses rather than evicts."""

    def __init__(
        self,
        window_seconds: int = REPLAY_WINDOW_SECONDS,
        capacity: int = REPLAY_CAPACITY,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._window = window_seconds
        self._capacity = capacity
        self._clock = clock
        self._seen: dict[str, float] = {}
        self._lock = threading.Lock()

    def record(self, jti: str) -> None:
        now = self._clock()
        with self._lock:
            if len(self._seen) >= self._capacity:
                self._seen = {key: until for key, until in self._seen.items() if until > now}
            if jti in self._seen and self._seen[jti] > now:
                raise _unauthorized("replay")
            if len(self._seen) >= self._capacity:
                raise RuntimeFailure("BUSY", retry_after_ms=1000)
            self._seen[jti] = now + self._window

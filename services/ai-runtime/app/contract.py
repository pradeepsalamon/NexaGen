"""Pydantic v2 models for contract v1.0.

Hand-written to match the JSON Schema generated from the Zod source of truth
(packages/types/src/ai-runtime-contract.ts). tests/test_contract.py keeps them
honest: every fixture must get the same verdict here, from Zod and from
jsonschema, and required fields / enums / error codes must match the schema.

Requests are strict (extra="forbid"); responses allow unknown fields so a
minor version can add optional ones. strict=True everywhere: no "5" -> 5.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

AI_CONTRACT_VERSION = "1.0"
AI_CONTRACT_MAJOR = 1

RequestId = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9-]{8,64}$")]
DataClass = Literal["PUBLIC", "INTERNAL", "PSEUDONYMOUS_STUDENT", "PERSONAL_STUDENT", "SENSITIVE_MINOR_COMMS"]
TaskId = Literal["diagnostic.echo.v1"]
ServiceScope = Literal["runtime:info", "runtime:diagnostic.echo"]
ErrorCode = Literal[
    "INVALID_REQUEST",
    "UNAUTHORIZED",
    "POLICY_DENIED",
    "PAYLOAD_TOO_LARGE",
    "UNSUPPORTED_MEDIA",
    "OUTPUT_SCHEMA_VIOLATION",
    "BUSY",
    "PROVIDER_QUOTA_EXHAUSTED",
    "PROVIDER_UNAVAILABLE",
    "TIMEOUT",
    "CANCELLED",
    "INTERNAL",
]
NonNegativeInt = Annotated[int, Field(ge=0, le=9007199254740991)]


class _Request(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class _Response(BaseModel):
    model_config = ConfigDict(extra="allow", strict=True)


class DiagnosticEchoInput(_Request):
    text: Annotated[str, StringConstraints(min_length=1, max_length=200)]


class DiagnosticEchoRequest(_Request):
    task: Literal["diagnostic.echo.v1"]
    dataClass: Literal["PUBLIC"]
    route: Literal["mock:echo"]
    input: DiagnosticEchoInput


class DiagnosticEchoOutput(_Response):
    echo: str
    length: NonNegativeInt


class DiagnosticEchoResponse(_Response):
    output: DiagnosticEchoOutput
    provider: Literal["mock"]
    model: Literal["echo"]
    modelRevision: None
    latencyMs: NonNegativeInt
    contractVersion: Literal["1.0"]


class AiError(_Response):
    code: ErrorCode
    message: Annotated[str, StringConstraints(max_length=500)]
    retryable: bool
    # Optional but never null, like Zod's .optional() and the JSON Schema:
    # the default is not validated, an explicit null is.
    retryAfterMs: NonNegativeInt = None  # type: ignore[assignment]


class AiErrorEnvelope(_Response):
    error: AiError


class AiRuntimeInfo(_Response):
    service: Literal["ai-runtime"]
    version: str
    contractVersions: Annotated[list[str], Field(min_length=1)]
    tasks: list[TaskId]
    providers: list[Literal["mock"]]


class AiRuntimeReadiness(_Response):
    status: Literal["ready", "not_ready"]
    providers: dict[str, Literal["ready", "unavailable"]]


class AiServiceTokenClaims(_Request):
    iss: Literal["nexa-api"]
    aud: Literal["ai-runtime"]
    iat: NonNegativeInt
    exp: NonNegativeInt
    jti: Annotated[
        str, StringConstraints(pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
    ]
    scope: ServiceScope
    rid: RequestId
    ver: Literal[1]
    task: TaskId = None  # type: ignore[assignment]
    dataClass: DataClass = None  # type: ignore[assignment]
    bh: Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{43}$")] = None  # type: ignore[assignment]


# Fixture directory name -> model. Must list every generated *.schema.json.
CONTRACT_MODELS: dict[str, type[BaseModel]] = {
    "aiErrorEnvelope": AiErrorEnvelope,
    "aiRuntimeInfo": AiRuntimeInfo,
    "aiRuntimeReadiness": AiRuntimeReadiness,
    "aiServiceTokenClaims": AiServiceTokenClaims,
    "diagnosticEchoRequest": DiagnosticEchoRequest,
    "diagnosticEchoResponse": DiagnosticEchoResponse,
}

"""The AI runtime: a stateless model plane behind the NestJS API.

Run with the factory, one worker (the replay cache is per process):

    uv run uvicorn --factory app.main:create_app --host 127.0.0.1 --port 8000 \\
        --workers 1 --limit-concurrency 32 --timeout-keep-alive 5 --no-access-log

create_app() raises on any bad configuration, so the process exits non-zero
instead of starting open (PHASE1_SPEC.md §3.4)."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import JSONResponse

from .auth import ReplayCache, TokenVerifier
from .errors import RuntimeFailure, envelope_response
from .log import JsonLogger
from .middleware import BodyLimitMiddleware, RequestLogMiddleware
from .policy import load_policy
from .providers.mock import MockEchoProvider
from .routes import diagnostic, health, info
from .runtime import InFlight, Runtime, log_fields
from .settings import Settings, load_settings


def create_app(settings: Settings | None = None, logger: JsonLogger | None = None) -> FastAPI:
    settings = settings or load_settings()
    logger = logger or JsonLogger(settings.log_level)
    runtime = Runtime(
        settings=settings,
        policy=load_policy(settings.contract_dir),
        verifier=TokenVerifier(settings.secret, settings.previous_secret),
        replay=ReplayCache(),
        in_flight=InFlight(limit=settings.max_in_flight),
        logger=logger,
        provider=MockEchoProvider(),
    )

    # The generated docs would be unauthenticated, so they don't exist.
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, title="nexa-ai-runtime")
    app.state.runtime = runtime

    for router in (health.router, info.router, diagnostic.router):
        app.include_router(router)

    @app.exception_handler(RuntimeFailure)
    async def on_failure(request: Request, failure: RuntimeFailure) -> JSONResponse:
        log_fields(request)["errorCode"] = failure.code
        return envelope_response(failure)

    @app.exception_handler(StarletteHTTPException)
    async def on_http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        # Unknown path (404), wrong method (405): the envelope, never the
        # framework's default body.
        failure = RuntimeFailure("INVALID_REQUEST", status=exc.status_code if exc.status_code < 500 else 400)
        log_fields(request)["errorCode"] = failure.code
        return envelope_response(failure)

    @app.exception_handler(RequestValidationError)
    async def on_validation(request: Request, _exc: RequestValidationError) -> JSONResponse:
        # FastAPI's default is a 422 that echoes the input. Never that.
        failure = RuntimeFailure("INVALID_REQUEST")
        log_fields(request)["errorCode"] = failure.code
        return envelope_response(failure)

    # Anything else unhandled becomes a 500 envelope in RequestLogMiddleware.

    # add_middleware wraps outward: the last added runs first.
    app.add_middleware(BodyLimitMiddleware, max_body_bytes=settings.max_body_bytes)
    app.add_middleware(RequestLogMiddleware, logger=logger)
    return app

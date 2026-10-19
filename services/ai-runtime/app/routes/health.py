from __future__ import annotations

from fastapi import APIRouter, Request

from ..runtime import authenticate, get_runtime

router = APIRouter()


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    """Liveness for the Docker healthcheck. Unauthenticated; reveals nothing."""
    return {"status": "ok"}


@router.get("/readyz")
async def readyz(request: Request) -> dict[str, object]:
    authenticate(request, "runtime:info")
    provider = get_runtime(request).provider
    ready = provider.ready()
    return {
        "providers": {provider.name: "ready" if ready else "unavailable"},
        "status": "ready" if ready else "not_ready",
    }

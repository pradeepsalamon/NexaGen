from __future__ import annotations

from fastapi import APIRouter, Request

from .. import __version__
from ..contract import AI_CONTRACT_VERSION
from ..runtime import authenticate, get_runtime

router = APIRouter()


@router.get("/v1/info")
async def info(request: Request) -> dict[str, object]:
    authenticate(request, "runtime:info")
    runtime = get_runtime(request)
    return {
        "contractVersions": [AI_CONTRACT_VERSION],
        "providers": [runtime.provider.name],
        "service": "ai-runtime",
        "tasks": sorted(runtime.policy.tasks),
        "version": __version__,
    }

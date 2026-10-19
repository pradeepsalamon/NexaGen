from __future__ import annotations

import time

from fastapi import APIRouter, Depends, Request

from ..contract import AI_CONTRACT_VERSION, DiagnosticEchoRequest
from ..errors import RuntimeFailure
from ..providers.mock import MockEchoProvider
from ..runtime import authenticate, get_provider, get_runtime, log_fields, parse_body, run_bounded

router = APIRouter()

SCOPE = "runtime:diagnostic.echo"


@router.post("/v1/diagnostic/echo")
async def echo(request: Request, provider: MockEchoProvider = Depends(get_provider)) -> dict[str, object]:
    token = authenticate(request, SCOPE)  # steps 2-6
    body = parse_body(request, DiagnosticEchoRequest)  # step 7

    fields = log_fields(request)
    fields.update(task=body.task, dataClass=body.dataClass)

    # Step 8: the body must match the token, and the policy must allow it.
    runtime = get_runtime(request)
    if (
        token.task != body.task
        or token.data_class != body.dataClass
        or not runtime.policy.allows(task=body.task, scope=SCOPE, data_class=body.dataClass, route=body.route)
    ):
        raise RuntimeFailure("POLICY_DENIED")

    # Step 9: single use.
    try:
        runtime.replay.record(token.jti)
    except RuntimeFailure as failure:
        fields["authFailure"] = failure.auth_failure
        raise

    started = time.perf_counter()
    output = await run_bounded(request, lambda: provider.echo(body.input.text))  # step 10
    fields.update(provider=provider.name, model=provider.model)
    return {
        "contractVersion": AI_CONTRACT_VERSION,
        "latencyMs": int((time.perf_counter() - started) * 1000),
        "model": provider.model,
        "modelRevision": None,
        "output": output,
        "provider": provider.name,
    }

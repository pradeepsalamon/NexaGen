# ai-runtime

The stateless model plane behind the NestJS API. Phase 1 serves exactly one
task, `diagnostic.echo.v1`, with a mock provider: no model, no network, no
database. Design and rules: [PHASE1_SPEC.md](../../docs/ai/architecture/PHASE1_SPEC.md).

| Path | Auth | |
|---|---|---|
| `GET /healthz` | none | `{"status":"ok"}` |
| `GET /readyz`, `GET /v1/info` | service token, scope `runtime:info` | |
| `POST /v1/diagnostic/echo` | service token, scope `runtime:diagnostic.echo` | |

## Develop

Needs Python 3.12 and [uv](https://docs.astral.sh/uv/) 0.13.1.

```bash
cd services/ai-runtime
uv sync --frozen
uv run pytest

# Run locally, loopback only, one worker (the jti replay cache is per process):
export AI_RUNTIME_SHARED_SECRET="$(openssl rand -base64 48)"
uv run uvicorn --factory app.main:create_app --host 127.0.0.1 --port 8000 \
  --workers 1 --limit-concurrency 32 --timeout-keep-alive 5 --no-access-log

# …and the API against it, with the same secret:
AI_ENABLED=true AI_RUNTIME_URL=http://127.0.0.1:8000 npm run dev:api
```

The process refuses to start without a secret of at least 32 characters. There
is no way to switch authentication off.

## Change the contract

1. Edit `packages/types/src/ai-runtime-contract.ts` (Zod is the source of truth)
   and, if the task table changes, `packages/types/src/ai.ts`.
2. `npm run build -w packages/types && node scripts/ai/export-contract.mjs`
3. Update `app/contract.py` by hand, and add fixtures under
   `contract/v1/fixtures/<schema>/`. `tests/test_contract.py` and
   `apps/api/src/ai/contract-conformance.spec.ts` must agree on every fixture.
4. Commit the regenerated files. CI runs `export-contract.mjs --check`.

Dependencies: `uv lock` respects `exclude-newer` in `pyproject.toml`. Runtime
packages must stay on the allowlist in `tests/test_dependencies.py`, which
admits no provider SDK and no HTTP client.

## Containers

Only through the opt-in overlay, never by the production deploy:

```bash
docker compose -f docker-compose.yml -f compose.ai.yml --profile ai up -d ai-runtime
```

`scripts/ai/compose-topology-test.sh --static` checks the overlay's isolation
without starting anything. The full run starts containers and runs in CI only.

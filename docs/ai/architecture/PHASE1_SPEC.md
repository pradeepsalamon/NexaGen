# Phase 1 specification: AI foundation (mock only)

Status: **approved for implementation 2026-10-19** (revision 3; OD-1, OD-2, OD-20–OD-24, DECISIONS.md §4). Revision 3 is a
pre-implementation correction against the actual repository; §0 lists what
changed and why. Starting P1 needs OD-1, OD-2 and OD-20 to OD-24
(DECISIONS.md §3). OD-11 (staging) does **not** block P1.

Goal: the smallest foundation every later AI feature plugs into, proven end to
end with one deterministic task, `diagnostic.echo.v1`. **No LLM, no external or
paid provider, no RAG, no embeddings, no database table, no production
deployment, no change to `docker-compose.yml` or `scripts/deploy-production.sh`.**

Labels: **[V]** verified in the repo or on the box (read-only, 2026-10-19) ·
**[A]** documented Docker/Python behaviour that a P1 test must confirm ·
**[R]** recommendation.

---

## 0. Corrections in revision 3 (evidence)

| # | Revision 2 said | Repository fact | Correction |
|---|---|---|---|
| 1 | Add `ai-runtime` + `ai_internal` to `docker-compose.yml`; "merging changes nothing in production" | `api`'s `networks:` list is in `docker-compose.yml` [V]; adding `ai_internal` there makes the next `docker compose up -d api` recreate `nexa_api` on a new network. `deploy-production.yml` deploys **both** api and web on any change to `docker-compose*.yml` or `packages/**` [V] (lines 48–65) | Production compose is untouched. The AI service lives in a separate overlay, `compose.ai.yml`, whose name deliberately does **not** match the deploy filter `docker-compose*.yml` (§4). Merging P1 to `main` still triggers a routine api + web rebuild because of `packages/**` and `apps/api/**`; that is OD-22 |
| 2 | `api` reads `AI_*` from `.env` | `api`'s `environment:` block is an explicit list [V]; a variable not listed there never reaches the container | Production cannot enable AI in P1 even by editing `.env`; only the overlay passes `AI_*` (§4.2). This is a guarantee, not a gap |
| 3 | Separate secret from `JWT_SECRET` | The variables are `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (`packages/config/src/api.ts:202`) [V] | Names fixed; config asserts the AI secret differs from both (§3.4) |
| 4 | `jti` claim listed as part of service auth | No replay store was specified | Either implement a replay cache plus body binding (OD-21, recommended) or call `jti` a correlation id. §3.2 specifies the recommended form |
| 5 | Echo returns **404** when disabled | Disabled features return **503** `ServiceUnavailableException` after auth (`game-sources.service.ts:255`, `game-analysis.service.ts:72`) [V] | 503, after authentication **and** the role check (§6) |
| 6 | Routes "covered automatically" by `admin-routes.int-spec.ts` | `/admin` is in `ADMIN_PREFIXES` (students and coaches checked) but `/admin/ai` is not in `SUPER_ADMIN_PREFIXES` (`admin-routes.int-spec.ts:19`) [V], so a plain ADMIN reaching a SUPER_ADMIN route is not tested | P1 adds `"/admin/ai"` to `SUPER_ADMIN_PREFIXES` (§8) |
| 7 | `ai-runtime.client.int-spec.ts` | `jest.integration.config.ts` runs every `*.int-spec.ts` in the `migrations` job against Postgres only [V]; a runtime-dependent spec would fail there | New suffix `*.runtime-spec.ts` with its own Jest config, run only in the AI CI job (§8) |
| 8 | NestJS readiness includes the runtime's `/readyz` | `nexa_api`'s healthcheck hits `/health/ready` and gates deploys (`docker-compose.yml`, CLAUDE.md §6) [V] | The runtime is **never** part of `/health/*`; its state appears only on `GET /admin/ai/status` |
| 9 | P1 serves `/v1/generate` and `/v1/embed` (mock), full generate/embed/rerank/prepare schemas, tools, multipart 20 MB | The brief limits P1 to one executable task | P1 serves `/healthz`, `/readyz`, `/v1/info` and `POST /v1/diagnostic/echo` only. Later endpoints are sketches in Appendix A, not contract v1.0, not generated |
| 10 | Per-capability semaphores, wait queue of 4, retries 1/4/16 s, quota fallback, `AI_MODEL_ROUTES`, `AI_EXTERNAL_PROVIDERS` | Only a mock provider exists in P1 | One global in-flight cap, no queue, no retries, no route config, no external-provider variables (§5, §7) |
| 11 | "Pydantic models validate against the schema files" | Zod is `4.4.3` (`packages/types/package.json`) [V], which has native `z.toJSONSchema`; no generator dependency is needed | One generation direction (Zod → JSON Schema) plus shared fixtures checked by Zod, Pydantic **and** a JSON Schema validator (§3.5) |
| 12 | CI job "path-filtered" | `ci.yml`'s filters have no `services/**` entry and `ci.yml` is also the deploy gate (`workflow_call`) [V] | A separate path-filtered job that does **not** run under `workflow_call` (OD-23) |
| 13 | Image "builds natively on the ARM box" | CI runs on x86 [V]; the box is production | ARM64 is checked with `buildx --platform linux/arm64` off the box (OD-24) |
| 14 | Rotation "restart both services" | — | Ordered procedure in §3.4 |

---

## 0b. Implementation notes (2026-10-19)

Implemented on `feat/ai-foundation` (off `dev`). Where the code differs from
the text below, the code is right and this table says why:

| Spec | Implemented | Why |
|---|---|---|
| CI: "a new job `ai` in `ci.yml`" (§9) | A separate workflow, `.github/workflows/ai.yml` (PR + manual dispatch, path-filtered) | A workflow run through `workflow_call` inherits the caller's `github.event_name`, so a job in `ci.yml` gated on `workflow_dispatch` would also run inside a manually dispatched deploy. A separate file can never gate one (OD-23) |
| `io: "output"` for response schemas (§3.5) | Every schema exported with `io: "input"` | Zod 4's output mode closes every `z.object` (`additionalProperties: false`), which contradicts "responses are non-strict on read". The contract schemas have no transforms, so this is the only difference |
| `EchoRequest` as a class-validator DTO (§2, §6) | `adminAiEchoRequestSchema` (Zod, strict) via `ZodBodyPipe` | The admin module validates with Zod, not class-validator ("match whatever the module uses") |
| `task-policy.json` as a bare array (§3.3) | `{ contractVersion, tasks: [...] }`; the manifest carries `errorCodes` too | The runtime checks the policy's version against the manifest's and the policy's sha256 against the manifest's hash, so a hand edit stops start-up |
| Wrong `task` claim → 403 (§8 test 11) | The verifier checks claim *types*; task/dataClass *values* are checked by the policy (step 8) | Otherwise an unknown task would be a 401 at claim validation, not the 403 the spec asks for |
| — | `uv` `exclude-newer = 2026-10-01` | FastAPI 0.148 was uploaded the day of implementation; nothing resolves that new without a deliberate bump |
| — | `opentelemetry-api` on the dependency allowlist | FastAPI ≥ 0.14x depends on it; it is the API package only (no SDK, no exporter) |
| — | An unhandled exception is turned into the 500 envelope in `RequestLogMiddleware` | Starlette's `Exception` handler re-raises after responding, so Uvicorn would print a traceback, which can carry input values |
| — | `parseApiEnv(source)` exported from `packages/config` | `getApiEnv` caches its first parse; config tests need several environments |

Verified locally: `apps/api` AI specs, 164 pytest cases, the static half of the
topology test, the drift check, and test 1 against a loopback Uvicorn (killed
afterwards). **Not run on this box (by design):** the dynamic topology test and
the arm64 image build. They run only in CI (OD-24), and the base compose file
pins container names that would collide with production.

## 1. Scope

| In P1 | Not in P1 |
|---|---|
| `packages/types`: `ai.ts` (task table, data classes), `ai-runtime-contract.ts` (Zod v1.0) | Any AI feature (summaries, RAG, assistant, coaching) |
| `packages/config`: four `AI_*` variables (§7) | Ollama, any LLM, embeddings, reranking, document ingestion, vector stores |
| NestJS `ai/` module: runtime client, service-token signer, task table, status + echo routes, metadata-only log line | External or paid providers, provider credentials, egress for the runtime |
| `services/ai-runtime`: FastAPI, one `mock` echo provider, service-token verification, task policy check, limits | Database tables or migrations (ADR-009) |
| `compose.ai.yml` overlay (opt-in, never used by deploy) | Any edit to `docker-compose.yml`, `deploy-production.sh`, `deploy-production.yml`, nginx |
| Contract export + drift check + shared fixtures | Web UI (status is JSON only); `routeAccess.ts` untouched |
| Tests in §8 and one new CI job | Production rollout, staging, enabling the flag anywhere but a dev machine or CI |

## 2. Files

```
packages/types/src/ai.ts                     AiDataClass, AI_TASKS table (diagnostic.echo.v1 only)
packages/types/src/ai-runtime-contract.ts    Zod v1.0 schemas (§3.3); exported from index.ts
packages/types/src/api-endpoints.ts          + API_ROUTES.adminAi.status / .echo
packages/config/src/api.ts                   + AI_* (§7) and their superRefine checks
scripts/ai/export-contract.mjs               dist Zod → services/ai-runtime/contract/v1/*.json; --check mode
scripts/ai/compose-topology-test.sh          §4.4 (Docker; CI only)
compose.ai.yml                               overlay (§4.2)

apps/api/src/ai/
  ai.module.ts
  ai-runtime.client.ts         fetch + AbortSignal.timeout, envelope → HttpException mapping, no retries
  ai-runtime.token.ts          signs the service token with @nestjs/jwt (already a dependency) and its own secret
  ai-log.ts                    one pino line per call, metadata only
  admin-ai.controller.ts       GET status, POST echo; getAccessToken pattern
  admin-ai.service.ts          authenticateUser → assert SUPER_ADMIN → assert enabled → client
  dto/admin-ai.dto.ts          EchoRequest (class-validator, matching the admin module)
  *.spec.ts, ai-runtime.client.runtime-spec.ts
apps/api/jest.runtime.config.ts  testRegex *.runtime-spec.ts (§8)

services/ai-runtime/
  pyproject.toml, uv.lock      OD-2; runtime deps: fastapi, uvicorn (no [standard] extras), pydantic, pyjwt
  Dockerfile                   python:3.12-slim-bookworm, uv sync --frozen --no-dev, UID 10001
  app/main.py                  FastAPI(docs_url=None, redoc_url=None, openapi_url=None); middleware order §5
  app/auth.py                  service-token verification (§3.2)
  app/policy.py                reads contract/v1/task-policy.json (generated)
  app/contract.py              Pydantic v2 models for v1.0
  app/providers/mock.py        echo only
  app/routes/health.py, info.py, diagnostic.py
  app/log.py                   JSON lines, metadata only; uvicorn access log off
  contract/v1/*.schema.json, task-policy.json, manifest.json   generated, committed
  contract/v1/fixtures/        hand-written valid/invalid cases (§3.5)
  tests/                       pytest

.github/workflows/ci.yml       + ai job (§9)
```

Docs in the same change: this file, a CLAUDE.md §3.6x stub of 2–5 lines,
`.env.example` + `apps/api/.env.example` (`AI_ENABLED=false`, others commented),
a `docs/TROUBLESHOOTING.md` row "AI status shows runtime unreachable".

## 3. Internal service contract v1.0

### 3.1 Endpoints

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /healthz` | none | Liveness for the Docker healthcheck. Body `{"status":"ok"}`. Reveals nothing else |
| `GET /readyz` | token, scope `runtime:info` | `{"status":"ready","providers":{"mock":"ready"}}` |
| `GET /v1/info` | token, scope `runtime:info` | `aiRuntimeInfo` (§3.3) |
| `POST /v1/diagnostic/echo` | token, scope `runtime:diagnostic.echo` | Runs `diagnostic.echo.v1` with `mock:echo` |

Everything else is 404 (envelope `INVALID_REQUEST`). FastAPI's `/docs`, `/redoc`
and `/openapi.json` are disabled because they would be unauthenticated.

Headers on every authenticated call: `Authorization: Bearer <token>`,
`X-Request-Id: <rid>`, `X-Contract-Version: 1.0`. The runtime returns
`X-Contract-Version: 1.0` on every response.

### 3.2 Service token (HS256)

**Who decides what.** NestJS is the only authorization and policy enforcement
point for users: it authenticates the caller, checks the role, chooses the task
and builds the payload. The runtime independently checks that the **service**
calling it holds a valid token for this exact task, data class, route and body.
It never receives a user id, role, permission list or user token, and no request
field can grant it anything: request objects are strict, so an extra field such
as `permissions` is a 400.

Header: `{"alg":"HS256","typ":"JWT"}`. The runtime passes `algorithms=["HS256"]`
explicitly; `none`, RS/ES/PS and any other value are rejected.

| Claim | Value minted by NestJS | Runtime rule (all required unless noted) |
|---|---|---|
| `iss` | `"nexa-api"` | exact match |
| `aud` | `"ai-runtime"` | exact match (string, not array) |
| `iat` | now (s) | not more than 5 s in the future |
| `exp` | `iat + 30` | `now ≤ exp + 5 s` leeway; `exp - iat ≤ 60` else rejected (no long-lived tokens) |
| `jti` | UUID v4 | UUID format; replay rule below |
| `scope` | `runtime:info` or `runtime:diagnostic.echo` | must equal the scope of the requested endpoint |
| `rid` | the request id | matches `^[A-Za-z0-9-]{8,64}$` (the API logger's `REQUEST_ID_PATTERN`, `logger.config.ts:7`) and equals `X-Request-Id` |
| `task` | `"diagnostic.echo.v1"` | required for `runtime:diagnostic.echo`, absent for `runtime:info`; equals body `task` |
| `dataClass` | `"PUBLIC"` | same presence rule; equals body `dataClass` |
| `bh` | base64url SHA-256 of the exact request-body bytes | required when a body is sent; compared in constant time against the raw bytes before JSON parsing |
| `ver` | `1` | equals the contract major |

Leeway is 5 s because both containers read the same host clock.

**Replay (OD-21, recommended form).** The runtime keeps an in-memory set of
`jti` values seen in the last 90 s (bounded at 10,000 entries; when full, the
request gets 429 `BUSY` rather than evicting). A second use of a `jti` is 401.
Together with `bh`, a captured token can only ever re-run the identical,
side-effect-free request, once. Limits stated plainly: the set is per process,
so P1 runs exactly one Uvicorn worker, and a runtime restart within the token
lifetime forgets it. If OD-21 chooses the alternative, the spec must call `jti`
a **correlation id** and claim no replay protection.

**Check order** (each failure stops; nothing is dispatched to a provider before
the last step):

1. Body size (413) and `Content-Type: application/json` (415) — before reading the body
2. `Authorization` present and `Bearer` (401)
3. Signature with the current secret, then the previous one if set; `alg`, `iss`, `aud`, `iat`, `exp`, required claims (401)
4. `scope` equals the endpoint's scope (403 `POLICY_DENIED`)
5. `rid` equals `X-Request-Id` (401)
6. `bh` equals SHA-256 of the raw body (401)
7. JSON parse and strict Pydantic validation (400)
8. Body `task`/`dataClass`/`route` equal the claims **and** the generated `task-policy.json` allows that triple (403)
9. `jti` not seen (401); record it
10. Acquire an in-flight slot (429 `BUSY`), run with the deadline (504 `TIMEOUT`)

**Failure responses.** 401 bodies are always
`{"error":{"code":"UNAUTHORIZED","message":"Invalid service credentials.","retryable":false}}`;
the specific reason (`missing`, `bad_alg`, `bad_signature`, `expired`,
`wrong_aud`, `wrong_iss`, `bad_claims`, `rid_mismatch`, `body_mismatch`,
`replay`) is logged as an enum, never returned, and the token is never logged.

**NestJS never surfaces runtime auth as 401.** The web client treats any 401 as
an expired session and spends a refresh rotation (`src/lib/api.ts`). Runtime
401/403/400 map to **502** (§6).

### 3.3 Schemas (canonical: Zod in `packages/types/src/ai-runtime-contract.ts`)

```ts
export const AI_CONTRACT_VERSION = "1.0";
export const aiRequestId = z.string().regex(/^[A-Za-z0-9-]{8,64}$/);
export const aiDataClass = z.enum(["PUBLIC","INTERNAL","PSEUDONYMOUS_STUDENT","PERSONAL_STUDENT","SENSITIVE_MINOR_COMMS"]);
export const aiTaskId = z.enum(["diagnostic.echo.v1"]);
export const aiErrorCode = z.enum(["INVALID_REQUEST","UNAUTHORIZED","POLICY_DENIED","PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA","OUTPUT_SCHEMA_VIOLATION","BUSY","PROVIDER_QUOTA_EXHAUSTED","PROVIDER_UNAVAILABLE",
  "TIMEOUT","CANCELLED","INTERNAL"]);   // full list reserved in v1.0 so later phases add no enum value;
                                         // P1 emits only the ones in §5

export const diagnosticEchoRequest = z.strictObject({
  task: z.literal("diagnostic.echo.v1"),
  dataClass: z.literal("PUBLIC"),
  route: z.literal("mock:echo"),
  input: z.strictObject({ text: z.string().min(1).max(200) }),
});

export const diagnosticEchoResponse = z.object({
  output: z.object({ echo: z.string(), length: z.number().int().min(0) }),
  provider: z.literal("mock"), model: z.literal("echo"), modelRevision: z.null(),
  latencyMs: z.number().int().min(0), contractVersion: z.literal("1.0"),
});

export const aiErrorEnvelope = z.object({ error: z.object({
  code: aiErrorCode, message: z.string().max(500),          // never echoes input
  retryable: z.boolean(), retryAfterMs: z.number().int().min(0).optional() }) });

export const aiRuntimeInfo = z.object({
  service: z.literal("ai-runtime"), version: z.string(),
  contractVersions: z.array(z.string()).min(1), tasks: z.array(aiTaskId), providers: z.array(z.literal("mock")) });

export const aiServiceTokenClaims = z.strictObject({ /* §3.2 table */ });
```

Rules for contract schemas, so the export is lossless: no `.default()`,
`.transform()`, `.refine()`, `.preprocess()` or `z.custom()`; regexes use ASCII
classes (`[A-Za-z0-9]`, never `\w`, which differs between JavaScript and Python
`re`). Requests are strict (`additionalProperties: false`; Pydantic
`extra="forbid"`). Responses are non-strict on read (Zod strips unknown keys;
the NestJS client ignores them), so a minor version may add optional response
fields. Breaking changes need `/v2` and contract `2.0`.

`task-policy.json` is generated from `AI_TASKS` in `ai.ts`:
`[{"task":"diagnostic.echo.v1","scope":"runtime:diagnostic.echo","dataClasses":["PUBLIC"],"routes":["mock:echo"]}]`.
The runtime loads it at start and refuses to start if it is missing or its
version differs from `manifest.json`. The `dataClass` × locality matrix
(AI_FOUNDATION.md §4.2) is deferred until a non-mock provider exists.

### 3.4 Secret handling

- **Creation:** `openssl rand -base64 48` (64 characters). Stored only in the
  untracked root `.env` / `apps/api/.env` of a dev machine or as a CI-generated
  ephemeral value; never committed, never in `.env.e2e`.
- **NestJS (`packages/config`):** when `AI_ENABLED=true`, the secret is required,
  ≥ 32 characters, not starting with `change-this`, and different from
  `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`. This check runs in **every**
  `NODE_ENV` (stricter than the production-only JWT checks at
  `api.ts:199-217`), so a misconfigured enable fails boot instead of running
  open. With `AI_ENABLED=false` the secret is ignored and may be unset.
- **Runtime:** a missing or short `AI_RUNTIME_SHARED_SECRET`, or a `_PREVIOUS`
  equal to it, makes the process exit non-zero at start. There is no
  "auth disabled" mode, including in tests (tests generate a random secret).
- **Rotation:** (1) set the runtime's `_PREVIOUS` to the old value and
  `AI_RUNTIME_SHARED_SECRET` to the new one, restart the runtime; (2) set the new
  value on the API and restart it; (3) after one token lifetime, unset
  `_PREVIOUS` and restart the runtime. The API holds only one secret.
- **Logs:** neither service ever logs the secret, the token, or any header
  (§5.4).

### 3.5 Contract generation and drift

Direction: **Zod → JSON Schema (Draft 2020-12) → Pydantic is checked against
it.** Pydantic is never generated from or exported to TypeScript.

- `npm run build -w packages/types && node scripts/ai/export-contract.mjs`
  imports `packages/types/dist` and writes, with `z.toJSONSchema(schema,
  { target: "draft-2020-12", io })` (`io: "input"` for requests and claims,
  `"output"` for responses), one `*.schema.json` per exported schema plus
  `task-policy.json` and `manifest.json`
  (`{ contractVersion, zodVersion, files: { name: sha256 } }`). Keys are sorted
  and files end in a newline, so output is byte-stable.
- `--check` regenerates into a temp dir and fails with a diff if any committed
  file is stale, missing or extra.
- **Fixtures** (hand-written, committed): `contract/v1/fixtures/<schema>/<case>.json`
  = `{ "valid": bool, "reason": "...", "data": ... }`. Minimum set per request
  schema: one valid; each required field missing; an unknown extra field; wrong
  enum/literal value; `text` of 0 and 201 characters; wrong type. Per response
  schema: one valid; each required field missing; an unknown extra field
  (valid). Error envelope: every code valid; an unknown code invalid;
  `message` of 501 characters invalid. Claims: valid; each required claim
  missing; `exp - iat = 61` is accepted by the schema but rejected by the
  verifier test (§8).
- **TypeScript conformance** (`apps/api/src/ai/contract-conformance.spec.ts`,
  ordinary Jest): every fixture's `safeParse` result equals `valid`.
- **Python conformance** (`tests/test_contract.py`): every fixture's verdict is
  the same under the Pydantic model and under `jsonschema.Draft202012Validator`
  with the generated schema; for each model, the set of required fields, every
  enum's values, the error-code set and `AI_CONTRACT_VERSION` equal the
  generated schema / `manifest.json`.
- CI fails when `--check` reports drift or any conformance case disagrees.

## 4. Networking and Compose

### 4.1 Current production network [V]

One bridge network, `nexa_network`, joined by every service. Postgres, Redis,
the API (3001), web (3000) and LiveKit signalling (7880) publish only on
`127.0.0.1`; LiveKit media ports are public. The deploy script builds and
starts **named** services only (`docker compose build "${SERVICES[@]}"`,
`up -d "${SERVICES[@]}" egress`, `deploy-production.sh:396,450`) and never
passes `-f`, so it reads `docker-compose.yml` alone. **P1 changes none of this.**

### 4.2 The overlay `compose.ai.yml` [R, OD-20]

Used only as `docker compose -f docker-compose.yml -f compose.ai.yml --profile ai …`
on a dev machine or in CI. Shape:

```yaml
services:
  ai-runtime:
    profiles: ["ai"]
    build: { context: services/ai-runtime }
    networks: [ai_internal]            # only this network; no `ports:`
    read_only: true
    tmpfs: ["/tmp:size=16m"]
    user: "10001:10001"
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    deploy: { resources: { limits: { cpus: "0.5", memory: 256M } } }
    environment:
      AI_RUNTIME_SHARED_SECRET: ${AI_RUNTIME_SHARED_SECRET:-}   # empty ⇒ runtime refuses to start
      AI_RUNTIME_SHARED_SECRET_PREVIOUS: ${AI_RUNTIME_SHARED_SECRET_PREVIOUS:-}
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz',timeout=2).status==200 else 1)"]
  api:
    networks: [nexa_network, ai_internal]   # merged with the base list
    environment:
      AI_ENABLED: ${AI_ENABLED:-false}
      AI_RUNTIME_URL: http://ai-runtime:8000
      AI_RUNTIME_SHARED_SECRET: ${AI_RUNTIME_SHARED_SECRET:-}
networks:
  ai_internal:
    internal: true
```

- `${VAR:?}` is not used: Compose interpolates the whole file even for an
  inactive profile, so a required-variable error would break unrelated commands.
  The runtime itself fails closed on an empty secret.
- No service `depends_on: ai-runtime`; the API must boot and pass
  `/health/ready` without it.
- The name `compose.ai.yml` is outside the deploy and CI filter
  `docker-compose*.yml`, so editing it never triggers a production deploy.

### 4.3 Intended connectivity

| From → to | Allowed | Why |
|---|---|---|
| `api` → `ai-runtime:8000` | **yes** | both on `ai_internal` |
| `api` → postgres, redis, livekit, internet | yes, unchanged | `api` keeps `nexa_network` as before; adding a second network does not remove its egress [A] |
| `ai-runtime` → internet, postgres, redis | **no** | only on `ai_internal`, which has no gateway or NAT [A] |
| postgres/redis/web/livekit/egress → `ai-runtime` | **no** | not on `ai_internal` |
| host or internet → `ai-runtime` | **no** | no `ports:`; and Docker does not route published ports on an internal-only container [A] |

**Local development** without containers: run the runtime directly bound to
loopback (`uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1`)
and the API with `AI_RUNTIME_URL=http://127.0.0.1:8000`. `--host 0.0.0.0` is
never documented. The production box is not a development machine (it runs the
production containers); nothing in P1 runs there.

### 4.4 Topology test (`scripts/ai/compose-topology-test.sh`, Docker, CI only)

Runs under a throwaway project name (`-p nexa_ai_topology`), starts only
`redis` and `ai-runtime` (the `api` image is not built; a probe container
stands in for it), and always ends with `down -v`.

Static (`docker compose … config --format json` + `jq`):
1. `docker compose -f docker-compose.yml config --services` does not contain `ai-runtime`, and neither does the overlay without `--profile ai`.
2. `ai-runtime` has no `ports`, its only network is `ai_internal`, which has `internal: true`; it has `read_only`, `cap_drop: [ALL]`, a non-root `user` and CPU/memory limits.
3. Every service other than `api` and `ai-runtime` renders identically with and without the overlay; `api` differs only by the added network and the three `AI_*` variables.
4. No service has `depends_on: ai-runtime`.

Dynamic (with a random test secret):
5. A `curlimages/curl` probe on `nexa_ai_topology_ai_internal` **and** `nexa_ai_topology_nexa_network` (like `api`) gets 200 from `http://ai-runtime:8000/healthz` and a PONG from `redis:6379`.
6. A probe on `nexa_network` only cannot resolve or connect to `ai-runtime`.
7. `docker port` for the runtime is empty and `curl http://127.0.0.1:8000/healthz` from the host fails.
8. From inside the runtime, a TCP connect to `1.1.1.1:443` and to `redis:6379` fails within 3 s.
9. A probe-signed authorized echo returns 200; the same call without a token returns 401.

## 5. Runtime limits, errors and logging

### 5.1 Limits (smallest safe set) [R]

| Control | Value (env, default) | Behaviour |
|---|---|---|
| Body size | `AI_RUNTIME_MAX_BODY_BYTES`, 16384 (max 1048576) | `Content-Length` over the cap → 413 before reading; a chunked body is counted while streaming and cut at the cap → 413 |
| Content type | — | anything but `application/json` on a POST → 415 |
| In-flight cap | `AI_RUNTIME_MAX_IN_FLIGHT`, 4 | a non-blocking global semaphore; when full → 429 `BUSY`, `retryAfterMs: 1000`. **No wait queue** |
| Server deadline | `AI_RUNTIME_REQUEST_TIMEOUT_MS`, 5000 | `asyncio.wait_for` around the provider call → 504 `TIMEOUT` |
| Process | `--workers 1 --limit-concurrency 32 --timeout-keep-alive 5 --no-access-log` | Uvicorn's own over-limit answer is a plain 503; the NestJS client maps a non-envelope 5xx to `PROVIDER_UNAVAILABLE` |
| Client deadline (NestJS) | `AI_RUNTIME_TIMEOUT_MS`, 5000 | `AbortSignal.timeout`; the abort closes the socket |
| Client response cap | 64 KiB | a larger response is discarded → 502 |
| Cancellation | — | Not implemented beyond the socket close: the mock echo has nothing to cancel. Disconnect checks arrive with the first provider that streams |
| Retries | — | **None** in P1. A diagnostic shows the raw outcome |

Per-model or per-capability semaphores, queues, backoff and quota handling are
deferred to the first real inference provider (AI_FOUNDATION.md §3).

### 5.2 Errors the runtime emits in P1

`INVALID_REQUEST` 400 (malformed JSON, schema failure, unknown path → 404 with
this code), `UNAUTHORIZED` 401, `POLICY_DENIED` 403, `PAYLOAD_TOO_LARGE` 413,
`UNSUPPORTED_MEDIA` 415, `BUSY` 429, `INTERNAL` 500, `TIMEOUT` 504. Every error
uses the envelope.

FastAPI's default validation response is a 422 that **echoes the offending
input** (`"input": …`); P1 replaces the `RequestValidationError` handler (and the
handler for JSON decode errors) with the 400 envelope and a fixed message
listing only field paths. A test asserts a sentinel string in the body never
appears in the response or the logs.

### 5.3 Middleware order

body-size → request-id/log context → auth (§3.2 steps 2–6) → route
(steps 7–10). Unauthenticated callers never reach JSON parsing.

### 5.4 Logging

- **Runtime:** one JSON line per request `{ts, level, rid, method, path, status,
  latencyMs, task?, dataClass?, provider?, model?, errorCode?, authFailure?}`.
  Uvicorn's access log is off. Exceptions are logged as `type(exc).__name__`
  only, because a Pydantic `ValidationError`'s text contains the input value.
  Headers, bodies, tokens, secrets and echo text are never logged.
- **NestJS:** pino's `req` serializer already logs only `id`, `method`, query-less
  `url` and `ip` (`logger.config.ts:33-41`) [V], so inbound headers and cookies
  are never logged. `ai-log.ts` writes one line per runtime call
  `{rid, task, dataClass, provider, model, latencyMs, outcome, errorCode}`. The
  client uses `fetch` (not axios, whose errors carry request headers) and never
  logs the request init or the response body.
- Sentry: unchanged. Runtime failures surface as `HttpException`s, which the API
  never reports (CLAUDE.md §3.6d2). The runtime has no Sentry in P1.

## 6. NestJS routes

Both routes follow the token-string pattern (CLAUDE.md §3.2): the controller's
`getAccessToken(request)`, the service's `authenticateUser`, then an inline role
check. Order is fixed: **authenticate (401) → SUPER_ADMIN (403) → enabled
(503) → work**, so the access suites see 401/403 regardless of the flag.

| Route | Throttle | Disabled (`AI_ENABLED=false`) | Enabled |
|---|---|---|---|
| `GET /admin/ai/status` (`API_ROUTES.adminAi.status`) | `@Throttle` 30/min | **200** `{ enabled: false, contractVersion: "1.0", tasks: ["diagnostic.echo.v1"] }`; the runtime is not contacted | 200 `{ enabled: true, contractVersion, tasks, runtime: { reachable, ready, contractVersions, providers } }` from `/readyz` + `/v1/info` with a 3 s timeout; unreachable is `reachable: false`, still 200. No URL, secret or token in the body |
| `POST /admin/ai/echo` (`API_ROUTES.adminAi.echo`) | `@Throttle` 10/min (per user, `UserThrottlerGuard`) | **503** "AI is not enabled on this server." — before any token is signed or socket opened | body `{ text: string 1..200 }` (class-validator, `whitelist`); 200 `{ echo, length, rid, latencyMs, provider: "mock", model: "echo" }` |

Runtime outcome → API response for echo:

| Runtime | API |
|---|---|
| 200 conforming to `diagnosticEchoResponse` | 200 |
| 200 not conforming, or > 64 KiB | 502 |
| `INVALID_REQUEST` / `UNAUTHORIZED` / `POLICY_DENIED` / 413 / 415 | 502 "AI runtime rejected the request." (a configuration or contract bug; never 401/403) |
| `BUSY` | 429 |
| `TIMEOUT` or client abort | 504 |
| connection refused / DNS failure / non-envelope 5xx / `PROVIDER_UNAVAILABLE` / `INTERNAL` | 503 |

The echo text is returned to the super admin only; it is never logged or stored.

## 7. Configuration

| Variable | Service | Default | Validation |
|---|---|---|---|
| `AI_ENABLED` | api | `false` | boolean, same parser as `EXTERNAL_GAME_IMPORT_ENABLED` |
| `AI_RUNTIME_URL` | api | `http://ai-runtime:8000` | `http:` only; host ∈ {`ai-runtime`, `localhost`, `127.0.0.1`}; no userinfo, path or query |
| `AI_RUNTIME_SHARED_SECRET` | api, runtime | unset | §3.4 |
| `AI_RUNTIME_TIMEOUT_MS` | api | `5000` | int 500–30000 |
| `AI_RUNTIME_SHARED_SECRET_PREVIOUS` | runtime | unset | ≥ 32, ≠ current |
| `AI_RUNTIME_MAX_BODY_BYTES` | runtime | `16384` | int 1024–1048576 |
| `AI_RUNTIME_MAX_IN_FLIGHT` | runtime | `4` | int 1–16 |
| `AI_RUNTIME_REQUEST_TIMEOUT_MS` | runtime | `5000` | int 100–30000 |
| `LOG_LEVEL` | runtime | `info` | |

Removed from revision 2: `AI_MODEL_ROUTES`, `AI_EXTERNAL_PROVIDERS`,
`AI_RUNTIME_PROVIDERS` — P1 has one hard-coded route and nothing to configure.

**Why P1 cannot reach a paid or external provider:** (1) the runtime contains
only the mock provider and its locked production dependencies contain no
provider SDK or HTTP client (a test asserts an allowlist of package names in
`uv.lock`); (2) `ai_internal` has no egress (topology test 8); (3) the task table
has one route, `mock:echo`; (4) no provider credential variable exists; (5)
production compose does not pass `AI_*` to the API at all.

## 8. Tests and where they run

Implemented 2026-10-19 (§0b). No result below may be reported as passing
without the job's log.

| # | Test | File | Runs in | Expected |
|---|---|---|---|---|
| 1 | Authorized round trip | `ai-runtime.client.runtime-spec.ts` | AI job: runtime as a local Uvicorn process, Jest with `jest.runtime.config.ts` | 200, echo equals input, one log line on each side with the same `rid` |
| 2 | Anonymous → `/admin/ai/*` | existing `auth-boundary.int-spec.ts` (auto-discovered) | `migrations` job (Postgres) | 401 |
| 3 | Student, coach → `/admin/ai/*` | existing `admin-routes.int-spec.ts` (`/admin` prefix) | `migrations` job | 403 |
| 4 | Plain ADMIN → `/admin/ai/*` | `admin-routes.int-spec.ts` after adding `"/admin/ai"` to `SUPER_ADMIN_PREFIXES` | `migrations` job | 403 |
| 5 | Route handlers read the cookie | existing `route-auth.spec.ts` | `verify` job | passes with no `PUBLIC_ROUTES` entry |
| 6 | Disabled: status 200 `enabled:false`, echo 503, **zero** client calls | `admin-ai.service.spec.ts` (fake client asserts not called) | `verify` | as stated |
| 7 | Role-before-flag order | `admin-ai.service.spec.ts` | `verify` | student with AI off → 403, not 503 |
| 8 | Config: enabled without secret / short / equals a JWT secret / bad URL host / `https:` | `apps/api/src/ai/ai-config.spec.ts` calling `getApiEnv(source)` (`packages/config/src/api.ts:238`) with an explicit env object | `verify` | parse fails; disabled + no secret parses |
| 9 | Token minting | `ai-runtime.token.spec.ts` | `verify` | exact claims of §3.2, `exp-iat = 30`, `bh` over the sent bytes |
| 10 | Error mapping and timeout | `ai-runtime.client.spec.ts` (local `http` stub) | `verify` | each row of the §6 mapping table; abort at `AI_RUNTIME_TIMEOUT_MS`; never 401/403 to the caller |
| 11 | Runtime auth: missing, non-Bearer, bad signature, `alg: none`, `alg: HS512`, expired (beyond leeway), `iat` in the future, `exp-iat=61`, wrong `aud`, wrong `iss`, wrong `scope` (403), wrong `task` (403), `dataClass` mismatch (403), `rid` mismatch, `bh` mismatch, replayed `jti`, previous secret accepted, unknown secret rejected | `tests/test_auth.py` | AI job (pytest) | statuses as in §3.2; 401 body identical for every 401 reason |
| 12 | Runtime start-up fail-closed: no secret, short secret, previous = current, missing/mismatched `task-policy.json` | `tests/test_startup.py` | AI job | non-zero exit |
| 13 | Limits: 16 KiB + 1 → 413 (with and without `Content-Length`); `text/plain` → 415; malformed JSON → 400; extra field (`permissions`) → 400; 201-char text → 400; in-flight full → 429 `BUSY`; slow provider → 504 | `tests/test_limits.py` (delay/blocking injected via `app.dependency_overrides`, not via any request field) | AI job | as stated |
| 14 | Docs disabled | `tests/test_routes.py` | AI job | `/docs`, `/redoc`, `/openapi.json` → 404 |
| 15 | Log safety | `tests/test_logging.py`, `ai-log.spec.ts` | AI job, `verify` | a sentinel input string and the secret/token never appear in captured logs or error bodies, on success and on every error path |
| 16 | Contract drift | `node scripts/ai/export-contract.mjs --check` | AI job | no diff |
| 17 | Contract conformance | `contract-conformance.spec.ts`, `tests/test_contract.py` | `verify`, AI job | every fixture verdict agrees across Zod, Pydantic, jsonschema; required/enum/error-code/version parity |
| 18 | Dependency allowlist | `tests/test_dependencies.py` | AI job | `uv.lock` runtime packages ⊆ allowlist |
| 19 | Health and readiness | `tests/test_health.py` | AI job | `/healthz` 200 unauthenticated; `/readyz` and `/v1/info` 401 without a token, 200 with `runtime:info` |
| 20 | Compose topology and port exposure | `scripts/ai/compose-topology-test.sh` (§4.4) | AI job, Docker on the GitHub runner | all 9 assertions |
| 21 | ARM64 image builds | `docker buildx build --platform linux/arm64` (QEMU) | AI job (OD-24) | image builds; `python -c "import app.main"` runs under emulation |
| 22 | Regression | existing `npm run typecheck`, `lint`, `test`, `test:integration`, web build | existing jobs | unchanged; `AI_ENABLED` unset everywhere |

## 9. CI

A new job `ai` in `ci.yml` (OD-23):

- Triggers on `pull_request` and `workflow_dispatch` only, when
  `services/ai-runtime/**`, `packages/types/src/ai*.ts`, `scripts/ai/**`,
  `compose.ai.yml`, `apps/api/src/ai/**` or the job itself changes. It does
  **not** run under `workflow_call`, so it never gates or delays a production
  deploy in P1.
- Steps: setup-node 22 (existing `NODE_VERSION`); `astral-sh/setup-uv` pinned to
  a commit SHA with the version in a comment (CLAUDE.md §6); `uv sync --frozen`;
  tests 11–19; build `packages/types` and run test 16; start Uvicorn on
  `127.0.0.1` and run test 1; test 20; test 21.
- Tests 5–10 and the TS half of 15 and 17 are ordinary `apps/api` specs, so they
  run in the existing `verify` job and its Jest scoping.
- No step pulls model weights, contacts a provider, or reads a production secret.

## 10. Acceptance gates

1. Every row of §8 green, with the CI run linked in the PR.
2. With defaults, `docker compose -f docker-compose.yml config` is byte-identical
   to before the change, no new container starts, and no new variable is
   required.
3. With the overlay, `--profile ai` and `AI_ENABLED=true` on a dev machine,
   `POST /admin/ai/echo` round-trips, with one metadata line per side sharing
   the `rid`.
4. The PR diff contains no change to `docker-compose.yml`,
   `scripts/deploy-production.sh`, `.github/workflows/deploy-production.yml`,
   `apps/api/prisma/**` or any real `.env` file.
5. Docs updated as listed in §2.
6. Merge target per OD-22; never `main` without the owner's explicit approval.

## 11. Future prerequisites (recorded, not done in P1)

- `deploy-production.sh` must learn the `ai-runtime` service (build, health
  gate, `:last-good`/`:previous` tags, `-f compose.ai.yml` or a merge of the
  service into `docker-compose.yml`) before the runtime runs in production.
- The deploy and CI filters must add `services/ai-runtime/**` at the same time.
- The production `api` environment block must list the `AI_*` variables.
- Moving the runtime off-host needs mTLS or WireGuard (ADR-005).

## 12. Effort and risks

- **Effort:** about 4–5 developer-days (smaller than revision 2: no generate or
  embed mocks, no route config, no retries).
- **Risks:** aarch64 wheels (only `pydantic-core` is native among the runtime
  deps; mitigated by test 21); contract drift (tests 16–17); a dual-homed `api`
  behaving differently than [A] predicts (test 20 proves it before any
  production use).

---

## Appendix A. Later-phase sketches (not contract v1.0, not generated, not implemented)

Kept for planning only; each becomes a contract minor version with its own
fixtures when its phase is approved.

| Endpoint | Phase | Sketch |
|---|---|---|
| `POST /v1/generate` | 3 | `{task, promptVersion, dataClass, route, messages[≤64], outputJsonSchema?, maxOutputTokens ≤ 8192, temperature, seed?}` → `{output: text \| json, usage, provider, model, modelRevision, latencyMs, finishReason}`; tools only in Phase 6 |
| `POST /v1/embed` | RAG PoC | `{dataClass, route, kind: query \| document, texts[≤128 × ≤8000 chars]}` → `{vectors, dim, model, modelRevision, normalized, usage, latencyMs}` |
| `POST /v1/rerank` | RAG PoC | `{dataClass, route, query ≤ 2000, passages[≤64]}` → `{scores[{id, score}], model, modelRevision, latencyMs}` |
| `POST /v1/documents/prepare` | RAG PoC | multipart ≤ 20 MB → normalised chunks with page, heading path, offsets, hashes and warnings |

With them come per-capability concurrency, quota handling (`DEFERRED`, never a
paid fallback), the retry policy and the locality policy of AI_FOUNDATION.md §3–4.

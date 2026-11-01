# AI architecture decision records

Status: **OD-1, OD-2, OD-6 (option a), OD-19 and OD-20 to OD-24 approved
2026-10-19; OD-7 approved 2026-10-27** (§4); everything else is still a proposal. §1 records constraints the audit verified; those are
facts, not choices. §2 holds proposed decisions. §3 lists owner decisions. A
recommendation is not approved just because a brief or prompt mentions it.

Format: context → decision → alternatives → consequences.

Revision 3 (2026-10-19, pre-P1 correction) revised ADR-004, ADR-005 and ADR-010
and added OD-20 to OD-24 after checking them against the repository. The
evidence is in PHASE1_SPEC.md §0. **Still nothing here is approved**; an ADR
becomes approved only when the owner says so and this file records the date
(§4).

---

## 1. Audit-backed constraints (verified 2026-10-19)

| ID | Constraint | Evidence |
|---|---|---|
| C-1 | Authorization lives in NestJS services (token-string pattern, `authenticateUser`, `getXVisibilityWhere`). It's tested by `route-auth.spec.ts` and the integration access suites | `apps/api/src/auth/authenticate.ts`, `test/integration/access/` |
| C-2 | The app is single-tenant. No tenant column exists anywhere. Admins see everything | `schema.prisma`, `docs/AUTHORIZATION.md` |
| C-3 | Production is one 2-core ARM64 VPS (Neoverse-N1) with 11.6 GiB RAM and no GPU. It also runs LiveKit, egress recording, Postgres, Redis and the Stockfish pool | `nproc`, `free`, `docker stats` |
| C-4 | The OCI A1 limit is fully used (2/2 OCPU, 12/12 GB). No free second instance is available under the current limits | `oci limits resource-availability get` |
| C-5 | Postgres 15.18 on `postgres:15-alpine` has no `pgvector`. Collation is `en_US.utf8` (libc, musl) | `pg_available_extensions`, `pg_database` |
| C-6 | Async work uses the row-as-job pattern (`game_analyses`). BullMQ is optional and only used by invoices | `game-analysis.worker.ts`, `queue.module.ts` |
| C-7 | Students are minors. Sentry and logs are already restricted for that reason | CLAUDE.md §3.6d2, `instrument.ts` |
| C-8 | There's no transcript, coach notes are empty in practice, and no knowledge documents or document-upload path exist | Aggregate counts; `CourseModuleContentType` |
| C-9 | `features/legal/content.ts` must stay true to the code. It names no AI processor today | CLAUDE.md §3.6l |
| C-10 | The Gemini API's unpaid tier bars apps likely used by under-18s and uses input for training. Hugging Face gives free accounts no inference credits. OpenRouter `:free` allows 50 requests a day under 10 purchased credits | Official docs, accessed 2026-10-19 (see INFRASTRUCTURE_DECISION.md §6) |

---

## 2. Proposed decisions (waiting for approval)

### ADR-001: Hybrid split. NestJS is the control plane; Python is a stateless model plane

- **Context.** Revision 1 deferred Python until there was a Python-only need.
  The brief now includes RAG ingestion, local embeddings, reranking, retrieval
  evaluation, and later STT and trained models. Those are that need. C-1 means
  authorization can't move.
- **Decision.**
  - A FastAPI `ai-runtime` in `services/ai-runtime/` runs every model
    invocation (generate, embed, rerank) and document preparation.
  - NestJS keeps everything else: authz, data access, task registry,
    prompts, routing policy, budgets, jobs, validation, storage, audit.
  - The runtime has **no DB credentials and no user tokens**.
- **Alternatives.**
  - (A) All AI in NestJS. Simplest today, but weak for parsing, embeddings and
    eval on ARM CPU.
  - (B) Python owns AI including data access. This duplicates authz and
    violates C-1.
  - (C′) Python with a read-only DB role on a `rag` schema. Rejected for now:
    it's a second access path to audit. Revisit only if moving vectors through
    NestJS proves to be a bottleneck, which isn't expected at this corpus size.
- **Consequences.**
  - A new runtime and deploy unit, a cross-language contract (ADR-004), and a
    second CI job.
  - Every AI call goes through the runtime, so if it's down, AI is deferred.
    That's acceptable because AI is never on a critical path.

### ADR-002: Row-as-job in NestJS; no queue in the runtime

- **Decision.** Long work (summaries, ingestion, re-embedding, eval) runs as
  NestJS job rows, as in `game_analyses`. Runtime calls are synchronous and
  bounded. There's no Redis or Celery in Python.
- **Alternatives.** Celery or RQ in Python (a second job system, plus Redis
  coupling); BullMQ (jobs are dropped when Redis is unset; C-6).
- **Consequences.** NestJS sends large ingests in chunks. The runtime stays
  stateless and restart-safe.

### ADR-003: Data-class routing policy, enforced in both services

- **Decision.** Every task declares one `dataClass` (`PUBLIC`, `INTERNAL`,
  `PSEUDONYMOUS_STUDENT`, `PERSONAL_STUDENT` or `SENSITIVE_MINOR_COMMS`). The
  locality rules are hard-coded (AI_FOUNDATION.md §4.2). There is never a paid
  fallback: routes are explicit, external routes must be free-only, and
  exhaustion means `DEFERRED`.
- **Alternatives.** A per-provider allowlist only, which can't distinguish
  public text from children's data.
- **Consequences.** A new task must classify its data. That's reviewed in the PR.

### ADR-004: The contract's source of truth is Zod in `packages/types`, exported as JSON Schema

- **Decision.**
  - `packages/types/src/ai-runtime-contract.ts` defines the request and
    response schemas.
  - A script writes `services/ai-runtime/contract/v1/*.schema.json`, which is
    committed.
  - Generation uses Zod 4's native `z.toJSONSchema` (Draft 2020-12; the repo
    is on `zod@4.4.3`), so no generator dependency is added.
  - CI fails on drift (`export-contract.mjs --check`).
  - Shared hand-written valid/invalid fixtures must get the same verdict from
    Zod, Pydantic and a JSON Schema validator; required fields, enums, error
    codes and the contract version are compared for parity
    (PHASE1_SPEC.md §3.5).
  - Contract schemas avoid constructs JSON Schema can't express (`.default`,
    `.transform`, `.refine`) and non-ASCII-safe regex classes like `\w`.
- **Alternatives.** OpenAPI generated from FastAPI with TS codegen. That makes
  Python the source of truth while the rest of the repo's contracts live in Zod.
- **Consequences.** One contract language for the whole repo. Pydantic models
  are hand-written and kept honest by the fixtures, not generated.

### ADR-005: Service authentication uses a short-lived HS256 JWT plus an internal network

- **Decision.**
  - A dedicated secret `AI_RUNTIME_SHARED_SECRET`, different from
    `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (checked at config parse in
    every `NODE_ENV` when AI is enabled). Missing or weak secret = the API
    refuses to boot with AI enabled, and the runtime refuses to start at all.
  - A per-call token, `alg` pinned to HS256, lifetime 30 s (verifier rejects
    `exp - iat > 60`), 5 s leeway, claims `iss`, `aud`, `iat`, `exp`, `jti`,
    `scope`, `rid`, `ver`, plus `task`/`dataClass` and the body hash `bh` on
    task calls. Exact rules and check order: PHASE1_SPEC.md §3.2.
  - Replay handling per OD-21. Without the replay cache, `jti` is only a
    correlation id and the docs must say so.
  - NestJS stays the only user-facing authorization point; the runtime checks
    only the service token against the generated task-policy table and never
    accepts permissions from a request body (requests are strict).
  - The internal network topology is ADR-010 / OD-20.
- **Alternatives.**
  - A static bearer. It can't be scoped or expire.
  - mTLS. Overkill on a single-host bridge network; adopt it if the runtime
    moves to another host, with WireGuard between hosts.
- **Consequences.** Rotation is ordered: runtime first (new + previous secret),
  then the API, then drop the previous secret (PHASE1_SPEC.md §3.4). Runtime
  auth failures are never shown to a browser as 401 (that would trigger the web
  client's refresh); the API maps them to 502.

### ADR-006: Postgres + pgvector for vectors; no separate vector database

- **Decision.** Use pgvector (HNSW) together with built-in full-text search for
  hybrid retrieval. Production gets pgvector from a **custom image built on
  `postgres:15-alpine`**, which keeps musl collation behaviour (C-5). The CI
  `migrations` image changes to match.
- **Alternatives.**
  - Qdrant, Chroma, etc. A new stateful service with its own backups and no SQL
    authz join.
  - The Debian `pgvector/pgvector` image. It changes the libc that collation
    depends on, so 456 text-index entries would need a REINDEX, which is
    production DB risk.
  - Exact search in the application over `real[]`. Viable below about 20K
    chunks and kept as a fallback if the image change isn't approved.
- **Consequences.** The DB image change is a production change that needs its
  own approval (OD-6b), a backup and a tested rollback. The PoC doesn't need it.

### ADR-007: Assistant tools call existing services with the caller's token

- **Decision.**
  - Tools are a registry of Zod-typed functions that call the same service
    methods controllers use, passing the user's access token.
  - The tool kinds are `READ`, `DRAFT` and `ACTION`. `ACTION` always needs a
    separate user confirmation, and v1 ships none.
  - The model never gets a DB, shell, filesystem or fetch tool.
- **Alternatives.** Tool-specific permission code, which would duplicate
  authorization and let it drift.
- **Consequences.** Some service methods may need a read-only variant shaped
  for tool output, with authz unchanged.

### ADR-008: Chess correctness is never delegated to an LLM

- **Decision.**
  - Legality and positions go through the chess wrapper.
  - Evaluations come from Stockfish or stored `GameAnalysis`.
  - Themes come from metadata.
  - Statistics come from SQL.
  - The LLM only explains supplied evidence. Every SAN or FEN in its output is
    re-validated.
  - AI never writes ratings, attempts or games.

### ADR-009: Phase 1 adds no database tables

- **Decision.** The foundation uses mock providers and logs only. `AiUsageEvent`
  arrives with the first budgeted production feature.
- **Consequence.** Phase 1 has zero migration risk and can be fully reverted by
  removing code.

### ADR-010: The runtime ships in an opt-in Compose overlay, with flags that default to off

- **Decision (revised in revision 3).**
  - The `ai-runtime` service and the `ai_internal` (`internal: true`) network
    live in `compose.ai.yml`, used only with
    `-f docker-compose.yml -f compose.ai.yml --profile ai`. `docker-compose.yml`
    is not edited in P1 (OD-20).
  - `AI_ENABLED=false` by default, plus one flag per feature. Disabled routes
    answer 503 after authentication and the role check, matching
    `EXTERNAL_GAME_IMPORT_ENABLED` / `GAME_ANALYSIS_ENABLED`.
- **Why not a profile inside `docker-compose.yml`.** The `api` service must join
  `ai_internal` to reach the runtime; that edit is in `api`'s own definition,
  so the next production `up -d api` recreates `nexa_api` on a new network, and
  any `docker-compose*.yml` change triggers an api + web deploy
  (`deploy-production.yml`).
- **Consequence.** P1 cannot change production networking. The code itself
  still deploys as an inert rebuild when it reaches `main` (OD-22).

---

## 3. Open owner decisions

Each has a recommendation; none is approved.

| ID | Decision | Recommendation | Blocks |
|---|---|---|---|
| OD-1 | Approve ADR-001, the NestJS + Python split | **Approve** | Phase 1 |
| OD-2 | Python toolchain | Python 3.12, `uv` with a committed `uv.lock` (hash-pinned), `python:3.12-slim-bookworm` (multi-arch, includes arm64). Runtime deps limited to `fastapi`, `uvicorn` (no `[standard]` extras, so no native `uvloop`/`httptools`), `pydantic`, `pyjwt`; only `pydantic-core` is native. `uv` is not installed on the box today [V]; P1 needs it only on dev machines and in CI (`astral-sh/setup-uv`, SHA-pinned). Alternative: pip-tools `requirements.txt --require-hashes` (no new tool, slower, manual lock refresh) | Phase 1 |
| OD-3 | May **PUBLIC / INTERNAL** (no personal data) tasks use an external free tier? | Not yet. Revisit after the local capacity decision (OD-6). If yes: Groq or OpenRouter with ZDR, free-only, no card on file | External routes |
| OD-4 | May any student-derived data (even pseudonymised) go to an external provider? | **No** for 2026. Re-assess with a provider DPA review | — |
| OD-5 | Coach approves student-facing AI text before students see it | **Yes, required** | Phase 3 |
| OD-6 | Where generation runs: (a) current VPS off-hours with a ≤4B model after a benchmark; (b) a separate machine (purchase needed); (c) an OCI limit increase request (cost to be verified); (d) external, PUBLIC data only | **(a) benchmark first**, with (c) asked of Oracle in parallel at no commitment. See INFRASTRUCTURE_DECISION.md | Phase 3 |
| OD-6b | pgvector in production via a custom alpine image | Approve **only when** RAG goes to production, with a backup and a rehearsed rollback | Phase 5 |
| OD-8 | Coach-owned knowledge collections | Later (Phase 7+) | — |
| OD-9 | Student-facing assistant | Last. Needs notices, a scope policy and moderation | Phase 8 |
| OD-10 | Assistant conversation retention | 30 days; coaches can't read student conversations | Phase 6 |
| OD-11 | A staging environment | A separate isolated Compose project (not the production DB), or `nexa_gen_int` on the box with the AI profile off-hours. The owner should choose. **Does not block P1**, which never runs on the box | Phase 3 rollout |
| OD-12 | Room-wide live chat as summary evidence | Yes, room-wide only, after the privacy page update. Private messages never | Phase 3 |
| OD-13 | Transcription of class audio | Out of scope for 2026 (consent for minors' voices, CPU). **Revised proposal 2026-10-31:** allow the **coach's voice only** (never students' or the room mix), with each coach's written consent, for Phase 3 v1 (PHASE3_SPEC.md §0a) | Phase 3 v1 |
| OD-14 | Commission a legal opinion on safeguarding (DPDP §9 and the students' other jurisdictions) | **Yes**, before any build on real data | Phase 9 |
| OD-15 | Safeguarding channels in scope | Live-class private messages + persistent DIRECT coach↔student, if the opinion allows | Phase 9 |
| OD-16 | A named safeguarding lead and backup, and who may review | The owner names them | Phase 9 |
| OD-17 | Notice text (privacy page, terms, parents) | Draft with counsel | Phase 9 |
| OD-18 | Safeguarding v1 depth | Deterministic detectors + human review; model classifier only if FP load justifies it | Phase 9 |
| OD-19 | Fix the recording cap (130 GB > 127 GB free) and prune Docker build cache (9 GB reclaimable) | Yes: set the cap to about 90 GB **before** any model weights | Any local model |
| OD-20 | Compose topology for P1 | **Overlay file `compose.ai.yml`** (ADR-010): production compose untouched, the file name is outside the deploy filter. Alternative: `profiles: ["ai"]` inside `docker-compose.yml` — simpler to discover, but edits `api`'s networks (container recreated on next deploy) and triggers an api + web deploy on merge | Phase 1 |
| OD-21 | Service-token replay protection | **Implement**: body-hash claim `bh` + an in-memory `jti` cache (90 s, single worker), about 20 lines. Alternative: no cache; `jti` documented as a correlation id; replay window is the 30 s token lifetime on an internal network. Either way the docs must state which | Phase 1 |
| OD-22 | Where P1 merges | **`dev` only**; merging to `main` is a separate approval. Any P1 merge to `main` rebuilds and restarts production api + web (`packages/**`, `apps/api/**` match the deploy filter) with the AI code inert. Alternative: merge to `main` and accept that routine deploy | Phase 1 merge |
| OD-23 | Does the new `ai` CI job gate production deploys? | **No, not in P1**: it runs on PRs and manual dispatch only, path-filtered, not under `workflow_call`. Alternative: make it part of the deploy gate (a runtime-only failure would then block unrelated deploys) | Phase 1 |
| OD-24 | Where the arm64 image build is verified | **CI with `docker buildx --platform linux/arm64` (QEMU)**: free, off the production box, slow but the image is small. Alternatives: a GitHub arm64 runner (availability for this repo's plan unverified [U]); the production box only with explicit approval, off-hours | Phase 1 |

| OD-25 | Phase 3 model and digest | The 3a benchmark winner, pinned by Ollama digest; Apache/MIT licence preferred (PHASE3_SPEC.md §13) | Phase 3 |
| OD-26 | First production run of `ai-runtime` + `ollama` (compose, deploy script, `api` env listing) | Its own change, after Phase 3 is green on staging | Phase 3 rollout |
| OD-27 | Plan gating for summaries | New `aiClassSummaries` plan feature, Enterprise only at launch | Phase 3 |
| OD-28 | What students see about AI | Always label the recap "Prepared by your coach with AI assistance" | Phase 3 |
| OD-29 | Coach notification for a ready draft | In-app badge only in v1; no `MessagingEvent` | Phase 3 |


Closed: **OD-7** (licensing of RAG content) was approved 2026-10-27: public domain, CC0/CC-BY and academy-owned only, no copyrighted books without written permission. The approval log (§4) is the record.

---

## 4. Approval log

| Date | Approved | Option taken | Effect |
|---|---|---|---|
| 2026-10-19 | OD-1 (ADR-001) | NestJS control plane + stateless Python model plane | Phase 1 may start |
| 2026-10-19 | OD-2 | Python 3.12, `uv` + committed `uv.lock`, `python:3.12-slim-bookworm`, deps `fastapi`, `uvicorn`, `pydantic`, `pyjwt` | |
| 2026-10-19 | OD-20 (ADR-010) | Overlay `compose.ai.yml`; `docker-compose.yml` untouched | |
| 2026-10-19 | OD-21 | Implement replay protection: `bh` body-hash claim + in-memory `jti` cache (90 s, one worker) | |
| 2026-10-19 | OD-22 | P1 branches off `dev` and merges to `dev` only, on explicit approval; `main` is a separate approval | |
| 2026-10-19 | OD-23 | `ai` CI job on PRs + manual dispatch only; not a deploy gate | |
| 2026-10-19 | OD-24 | arm64 image verified in CI with `buildx` + QEMU, never on the production box | |
| 2026-10-19 | OD-6 | (a) benchmark a ≤4B model off-hours on the current VPS first (INFRASTRUCTURE_DECISION.md §4). (c), the OCI A1 limit inquiry, is the owner's to send, with no commitment | Phase 3a may run once a no-class window is named |
| 2026-10-19 | OD-19 | Recording cap to 90 GB and prune the build cache before any weights | Build cache pruned 2026-10-19 (9.08 GB freed, 138 GB free). The cap change in the production `.env` is still to do; `run-capacity-benchmark.sh` refuses to run until the live API reports ≤ 90 |
| 2026-10-26 | Phase 2 (RAG PoC) start; OD-7 **pending** | Owner asked to "start to implement rag": that approves starting Phase 2 only. OD-7 is **not yet decided**: the PoC follows its recommended option (public domain, CC0/CC-BY and academy-owned content only, no copyrighted books without written permission) until the owner confirms it in writing; the PoC uses only CC0, a 1921 public-domain book and owned or synthetic text, so nothing changes if they do | PoC built on `feat/rag-poc`; runs off-box in CI only (RAG_POC.md hard limits). Phase 5 (production RAG) is still unapproved |
| 2026-10-27 | OD-7 | As recommended: knowledge-base content is limited to academy-owned material, public domain and CC0/CC-BY (credited). No copyrighted books, courses or other academies' material without written permission. With the owner's same-day direction that the product ships **no** pre-loaded knowledge base (every document is added by an admin, with per-role audiences and versioning), this is a rule for what admins upload: Phase 5 gives each document a required source/licence field and shows it in the change log. The PoC corpus is evaluation-only and is never loaded into the product | The PoC dataset needs no change. Phase 5 (production RAG) is still unapproved: OD-6b and a build go-ahead remain |
| 2026-10-27 | Phase 5a (knowledge base, no AI) | Owner: "yes start". No pre-loaded knowledge base: admins and super admins manage every document (course material, games, platform how-to and navigation, FAQs); visibility per role (students never get coach/admin answers) and optionally per batch; every document versioned with a change log; all proposed add-ons (unanswered inbox, ask-my-coach, page-aware help, preview as role, feedback, scheduling/expiry/review-by, coach drafts with approval, chess boards in articles, translations, coach topic trends, import/export); assistant tools "if required" | docs/KNOWLEDGE_BASE.md; branch `feat/knowledge-base`, merged to main 2026-10-28 (PR #104) on the owner's approval. Phase 5b (pgvector + AI answers) still needs OD-6b |

| 2026-10-31 | Phase 3 v1 scope (planning only) | Owner: v1 is a **student recap only**, built from the **coach's voice only**; coaches teach in **Tamil and English, mixed**; transcription tries **option A first** (Chrome's speech recognition in the coach's browser); more evidence is added in later versions. Not a build go-ahead. OD-13 (coach-voice only, with consent), OD-5 and the recap language are still open | PHASE3_SPEC.md §0a. Next: a coach tests `/admin/caption-test` on a real mixed Tamil/English lesson |

ADR-002 to ADR-009 stay proposals; P1 follows ADR-009 (no tables) because the
spec already limits it to that.

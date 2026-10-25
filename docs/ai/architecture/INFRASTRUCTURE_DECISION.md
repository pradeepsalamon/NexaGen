# AI infrastructure decision report

Status: **proposal** (2026-10-19). All facts were gathered read-only. Nothing
was installed, pulled, restarted or reconfigured.

Labels: **[V]** verified now · **[A]** assumption or estimate · **[U]** unknown.

## 1. Verified facts

| Fact | Value | How it was checked |
|---|---|---|
| CPU | 2 × aarch64 Ampere Neoverse-N1 [V] | `nproc`, `lscpu` |
| RAM | 11.6 GiB total, 9.0 GiB available; swap 8 GiB, 267 MiB used [V] | `free -h` |
| Disk | 193 GB, 67 GB used, **127 GB free** [V] | `df -h /` |
| GPU | None [V] | no `/dev/nvidia*` |
| Load at idle | 0.2–0.65, up 71 days [V] | `uptime` |
| Containers at idle | api 399 MiB, web 154 MiB, postgres 103 MiB, livekit 44 MiB, egress 41 MiB, redis 8 MiB (512 MiB cap), beszel 29 MiB [V] | `docker stats` |
| Docker disk | images 10.7 GB, volumes 6.1 GB, **build cache 16 GB (9 GB reclaimable)** [V] | `docker system df` |
| Recordings | 1.2 GB used; **cap 130 GB > 127 GB free** [V] | `du` in the API container, env |
| Postgres | 15.18, `postgres:15-alpine`, 2.76 GB database, `en_US.utf8` libc collation (musl), **no `vector` extension available** [V] | `psql` catalog queries |
| OCI region / AD | AP-MUMBAI-1, one AD [V] | `oci iam availability-domain list` |
| OCI A1 limits | cores available 0 / used 2; memory available 0 / used 12 GB [V] | `oci limits resource-availability get` |
| Workload | ~52 classes a month, average 76 min; class-time load includes egress (Chromium + encoder) and Stockfish [V] | aggregate counts |
| Network | One bridge network `nexa_network`; Postgres, Redis and app ports bound to `127.0.0.1` [V] | `docker-compose.yml` |
| Build location | Images are built **on the ARM box** during deploy; CI runs on x86 [V] | `deploy-production.sh`, `ci.yml` |

## 2. Options

| | 1. Small Python runtime on the current VPS, no LLM | 2. Separate local inference machine | 3. Second OCI instance | 4. External API for approved workloads |
|---|---|---|---|---|
| Availability | Now | Requires a purchase [A] | **Not under current limits [V]**. Needs a limit increase request; cost terms [U] | Free tiers exist; terms in §6 |
| Cost | €0 | Hardware cost (needs approval) | €0 if within Always Free [U] | €0 on a free tier; must never fall back to paid |
| RAM / CPU | Runtime ~150–250 MB [A]; + small ONNX embedder ~150–300 MB [A]; CPU near zero at idle | Sized to need | Up to 2 OCPU / 12 GB more if granted [U] | None locally |
| Fits live-class workload | Yes, with caps (`cpus: 0.5`, `mem_limit: 768m`) and workers paused while live | Fully isolated | Fully isolated | Fully isolated |
| Generation quality | None (mock, embeddings only) | 7–8B+ possible with a GPU [A] | 3–4B CPU-only, like today's box but dedicated [A] | Good |
| Minors' data | Stays on box | Stays on owned hardware; needs a private link (WireGuard) | Stays in our tenancy; VCN-private | **Not allowed** for student data (OD-4); PUBLIC/INTERNAL only after OD-3 |
| Ops complexity | Low: one Compose service | High: a new host, patching, link, backups | Medium: a second VM, VCN rules | Low; contractual risk |
| ARM notes | Python wheels for `fastapi`, `pydantic-core`, `onnxruntime` and `pypdf` exist for aarch64 [A]: verify in the Phase 1 image build | Depends | Same ARM as today | n/a |

### Local generation on the current VPS (only if OD-6a is approved)

These are estimates, not measurements [A], for Q4 quantisation on 2 N1 cores:

| Model | RAM | Generation speed | One class summary (~4K in / ~1.2K out) |
|---|---|---|---|
| 3–4B | 2.5–3.5 GB | 5–8 tok/s | 3–6 min |
| 7–8B | 5–6 GB | 2–4 tok/s | 8–15 min, not recommended |

At ~2 classes a day, a 3–4B model needs 10–30 CPU-minutes a day off-hours,
which fits. An interactive assistant on this box does **not** fit: a 30–60 s
answer while both cores are saturated is unacceptable. The assistant therefore
needs Option 2, 3 or 4.

## 3. pgvector path (for the RAG production phase)

1. **Preferred:** a custom image `FROM postgres:15-alpine` that compiles pgvector
   (pinned tag, `make OPTFLAGS="" with_llvm=no` or with clang/llvm installed [U]:
   verify in a spike). It keeps musl, so collation behaviour is unchanged and
   the data volume and backups are compatible. The CI `migrations` service image
   must use the same image.
2. **Rejected unless the owner accepts the risk:** the Debian `pgvector/pgvector:pg15`
   image. It moves libc from musl to glibc under an `en_US.utf8` collation, so
   text sort order can change and 456 text-index entries would need a REINDEX.
   It would also need downtime and a verification pass.
3. **Fallback without an extension:** store embeddings as `real[]` and run exact
   cosine in NestJS over the allowed chunks. This is acceptable below about 20K
   chunks [A].

The cutover runs **backup → image swap → `CREATE EXTENSION vector` →
verification**. Rollback is the previous image; the extension stays unused,
because migrations are additive.

## 4. Benchmark plan (needs approval: it uses production CPU)

- **Where:** first on a developer ARM machine or an x86 dev box with the
  relative numbers noted. Then, if OD-6a is approved, **off-hours on the box**
  with no live class, `docker run --cpus 1.5 --memory 5g`, weights on a
  temporary volume that's deleted afterwards.
- **Measure:** prompt tokens/s, generation tokens/s, peak RSS, wall time on 10
  synthetic class-evidence bundles, golden-set quality (the Phase 3 golden set, ROADMAP.md), and
  the CPU impact on a concurrent synthetic Stockfish request.
- **Pass criteria:**
  - summary p95 ≤ 10 min
  - peak RSS ≤ 4.5 GB
  - schema-valid ≥ 95% before retry
  - grounding violations 0 after validation
  - **usable ≥ 90% after one retry** (added 2026-10-25 for the re-run; "usable"
    is defined in §4.3 before any run)

### 4.1 Running it

Approved 2026-10-19 (OD-6a, OD-19). The harness is `scripts/ai/benchmark/`:

```bash
node scripts/ai/benchmark/bench.mjs --self-test                 # validator checks, no model, safe anywhere
node --test scripts/ai/benchmark/bench.stub.test.mjs            # whole scorer against a stub Ollama
scripts/ai/benchmark/run-capacity-benchmark.sh --confirm-off-hours [--model qwen2.5:3b] [--no-think]
```

- **Pre-flight refusals.** The runner refuses with < 20 GB free, while the live
  `nexa_api` has `RECORDING_STORAGE_LIMIT_GB` > 90 (OD-19), or while LiveKit
  reports any room with participants. It polls LiveKit every 20 s and stops
  the model if a class starts (exit 3).
- **Container.** `ollama/ollama:0.34.4` runs with `--cpus 1.5 --memory 5g
  --cpu-shares 512` on a loopback-only port. The container and its weights
  volume are always removed, even on Ctrl-C.
- **Bundles.** Ten synthetic bundles (`bundles.mjs`: public-domain games,
  invented students). They're scored against the Phase 3 schema and grounding
  rules with one repair retry. Since 2026-10-25 the rules are the shared
  module `packages/types/src/class-summary.ts` (§4.3); `validate.mjs` only
  wraps it, and the runner builds `@nexa-chess/types` and runs both tests
  before it starts a container.
- **Measured besides the five criteria.** Tokens/s, a keyword fact-recall
  proxy (the Phase 3 golden set doesn't exist yet), and the slowdown of a
  fixed-node Stockfish search inside `nexa_api`.
- **Output.** `report.md` and `results.json` in `~/ai-bench/<UTC timestamp>/`.
  Paste the verdict into this section.

### 4.2 Result: run of 2026-10-19 (qwen2.5:3b, Ollama 0.34.4)

Run 18:22 UTC, no class live. Raw output is in `~/ai-bench/20261019T170505Z/` on the box; the container, weights and image were removed afterwards.

**Capacity: PASS. Quality: not good enough yet.**

| Criterion | Target | Measured | |
|---|---|---|---|
| Summary p95 (incl. repair retry) | ≤ 10 min | 9.12 min | ok (tight) |
| Peak RSS | ≤ 4.5 GiB | 3.31 GiB | ok |
| Schema-valid before retry | ≥ 95% | 100% | ok |
| Grounding violations after validation | 0 | 0 | ok |

| Also measured | Value |
|---|---|
| Summaries usable (READY) after one retry | **5 / 10** |
| Grounding violations before retry | 10, mostly invented `variations` (e.g. a poll's `Nxf7` cited as a move of the game, looping move lists) and one `S#` in the student view |
| Prompt / generation tokens/s (median) | 18.1 / 4.2 |
| Fact recall (keyword proxy) | 30% |
| Stockfish slowdown during generation | 1.04× (median 5.3 s fixed-node search) |

Reading:

- **This box can run the model.** It stays within the 1.5-CPU / 5 GB envelope,
  and Stockfish is barely affected.
- **The four pass criteria miss the success rate.** Every rejected summary was
  caught, so nothing wrong would reach a coach. But half the classes would
  get no summary.
- **Proposed fifth criterion:** "≥ 90% READY after one retry".

Before Phase 3, re-run with these two changes:

1. **`variations` comes from code.** Build `variations` deterministically from
   the evidence (ADR-008: chess correctness is never delegated to an LLM). The
   model only comments on lines it is given. This removes the largest failure
   class.
2. **Compare a stronger model.** Run a ≤4B candidate from AI_FOUNDATION.md §4.4
   (e.g. Qwen3-4B) side by side.

Harness fixes made during the run (commits `a8fd4f7`, `f41c7ba`):

- **Streaming.** Generation streams, because Node's fetch drops a request
  after 5 minutes with no headers.
- **Grammar limits.** The JSON schema handed to Ollama carries the length and
  count limits.

### 4.3 Re-run design (pre-registered 2026-10-25, before any run)

What changed since §4.2 (branch `feat/ai-summary-grounded-lines`):

- **Move lines come from code.** Each game in the evidence carries its SAN
  mainline, replayed by code. `buildSummaryLines` turns each one into a line
  `L1`, `L2`, …. The model gets the lines as numbered moves. A variation it
  returns is `{ line, fromMove, toMove, comment }`, at most 6 moves, with no
  moves in it. The SAN a coach sees is rendered by `formatSummaryLine` from
  the game. A model-written `san` is a schema error.
- **Chess tokens in prose are checked.** Every move, square, signed engine
  score (`+1.5`), game result (`1-0`) and puzzle id the model writes must
  appear in the evidence. A square counts if a piece stands on it in the
  line's start position, a move lands on it, or the evidence text mentions it.
  Unknown evidence refs and `S#` in the student view are still checked.
- **Retry, then remove.** Any schema error or unsupported item gets one
  repair call that lists the problems. After that, schema errors fail the
  summary (`SCHEMA`). Unsupported items are **removed**, never rewritten or
  invented, and the rest is judged by the usability rule below.
- **Limit.** Claims about game events in plain words ("White resigned",
  "S2 won the match") can't be checked mechanically. The coach's review (OD-5)
  stays the safeguard, and nothing is published without it.

**"Usable" (fixed now; the scoring may not change after the run).** A
bundle counts as usable (READY) when, after at most one repair retry and
removal of unsupported items:

1. the final answer is schema-valid;
2. every required section still has at least one item: lesson overview, next
   objectives, recap, key concepts and practice ideas;
3. at least **75%** of the model's items were kept
   (`SUMMARY_MIN_KEPT_CLAIM_SHARE`); and
4. re-checking the delivered summary finds **0** unsupported items (the leak
   check, criterion 4).

A model error or timeout counts as not usable. The criterion is
`usable / 10 bundles ≥ 90%`. The code is `assessClassSummaryUsability` and
`generateGroundedClassSummary`, with their regression tests in
`apps/api/src/ai/class-summary.spec.ts`.

**Also recorded:** retry rate; unsupported-claim rate (unsupported items ÷
items) on the first answer and after the retry, before removal; items
removed; p50/p95 latency; peak RSS; Stockfish slowdown; tokens/s; fact recall.

**Comparable settings.** Both models run the same way:

- same 10 bundles, same prompts and schema;
- `ollama/ollama:0.34.4`, `--cpus 1.5 --memory 5g --cpu-shares 512`;
- `num_ctx 8192`, temperature 0.2, seed 42;
- one model at a time, in a fresh container each.

The two models:

- `qwen2.5:3b`, the §4.2 baseline, now with the new pipeline;
- `qwen3:4b` (Apache-2.0, 2.5 GB weights) with `--no-think`, so it doesn't
  spend tokens on a reasoning trace.

**Data.** Only `bundles.mjs`: public-domain games, invented students and chat
lines. Nothing comes from the database. The model runs in a loopback-only
local container. The only outbound traffic is pulling the image and weights,
and no class data leaves the box.

**Still to do:** the run itself (OD-6a, which needs a named no-class window).
The comparison with §4.2 isn't one-to-one. The prompt and schema changed (lines
instead of free SAN), so a better READY rate reflects the pipeline and the
model together.

## 5. Recommendation

1. **Now:** Option 1. Add a small `ai-runtime` to the existing Compose stack
   behind the `ai` profile, with no LLM and only mock providers in Phase 1. It
   costs nothing, touches nothing until enabled, and targets arm64 (verified
   off the box first, DECISIONS.md OD-24; production compose is untouched in
   Phase 1, OD-20).
2. **Prerequisite cleanup before any weights (OD-19):**
   - lower `RECORDING_STORAGE_LIMIT_GB` to about 90
   - prune the 9 GB of reclaimable build cache (it's already in the deploy
     script's prune policy; confirm)
3. **Before the first generative production feature (OD-6):** run the benchmark
   in §4. If it passes, run summaries off-hours on the box (Option 1 plus Ollama
   in the same profile, `cpus: 1.5`, `mem_limit: 5g`, paused while live). At the
   same time, **ask Oracle about an A1 limit increase** (Option 3). Get the cost
   answer in writing before accepting.
4. **The interactive assistant** needs dedicated capacity (Option 3 or 2, or 4
   for PUBLIC data only). Decide that when Phase 6 starts, with real usage
   numbers.
5. **No hardware purchase** is recommended until the benchmark and Phase 3
   usage data exist.

## 6. External provider terms (carried over from revision 1; re-verify before use)

| Provider | Free terms (2026-10-19) | Data and minors |
|---|---|---|
| OpenRouter `:free` | 20 RPM; 50 requests a day with under 10 purchased credits; 1,000 a day after a $10 one-off purchase (paid, so needs approval) | Retention varies by upstream provider. Use `provider.data_collection: "deny"`, `zdr: true` and `max_price` 0. Upstream minors clauses [U] |
| Groq | Developer-plan figures seen (30 RPM, 1K RPD, 8K TPM for small models); free-plan figures [U] | No retention by default; ZDR available. Training statement and minors clause [U] |
| Hugging Face Inference Providers | **No monthly credits for free accounts**; PRO costs money | Varies by provider |
| Gemini API, unpaid | Free | **Excluded**: input used for training and human review, and apps "likely to be accessed by individuals under the age of 18" are barred |

Sources:
- https://openrouter.ai/docs/api-reference/limits
- https://openrouter.ai/docs/features/privacy-and-logging
- https://openrouter.ai/docs/guides/routing/provider-selection
- https://huggingface.co/docs/inference-providers/pricing
- https://ai.google.dev/gemini-api/terms
- https://console.groq.com/docs/rate-limits
- https://console.groq.com/docs/your-data

## 7. Deployment stages

| Stage | What runs | Gate |
|---|---|---|
| Local dev | `docker compose --profile ai up ai-runtime` with mock providers; NestJS `AI_ENABLED=true` locally | Unit tests |
| CI: unit | `pytest` (runtime) + Jest (gateway, with a fake runtime client) + contract drift check | Required on PR |
| CI: contract integration | Job starts the runtime container (mock) and the NestJS client contract suite calls it over HTTP | Required on PR touching `ai/` or `services/ai-runtime/` |
| Staging | Per OD-11 | Owner sign-off |
| Production | Profile `ai` enabled on the box; flags still off; then one feature flag at a time, one coach first | Owner approval per step |

Operations:
- **Health:** a Docker `healthcheck` on `/healthz`; NestJS readiness includes
  the runtime's `/readyz` as non-fatal (degraded).
- **Limits:** `cpus: 0.5`, `mem_limit: 768m` (no LLM); with Ollama, `cpus: 1.5`,
  `mem_limit: 5g` on that container.
- **Backups:** the runtime is stateless and has nothing to back up. AI rows are
  in Postgres and covered by the existing dumps. Model weights can be re-pulled
  by pinned digest and are excluded from backups.
- **Rollback:** flags off (immediate); stop the profile; image `:last-good`, as
  for the other services, once `deploy-production.sh` knows the service (a
  later change, not in Phase 1).

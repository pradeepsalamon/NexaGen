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

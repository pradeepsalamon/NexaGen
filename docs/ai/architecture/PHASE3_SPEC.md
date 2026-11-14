# Phase 3 specification: after-class summaries

Status: **proposal, not approved** (revision 2, 2026-10-25: §5–§6 move lines from code; revision 3, 2026-10-31: v1 narrowed to a student recap from the coach's voice, §0a). Phase 3 starts
only when all of these hold:

- the 3a benchmark passes (INFRASTRUCTURE_DECISION.md §4.1), or the owner
  picks an OD-3/OD-4 alternative;
- OD-5, OD-11 and OD-12 are approved;
- the new decisions OD-25 to OD-29 (§13) are approved;
- the privacy text is drafted (§10).

Goal: when a class ends, a local model drafts a summary from what happened in
the room. The coach reviews it, edits it and publishes it. Students then see
a class-level recap plus their own results, which are computed
deterministically. **Nothing the model writes reaches a student without a
coach's publish.** No student data leaves the box.

This document turns AI_FOUNDATION.md §8 and Appendix A into a buildable spec
and corrects them against the repository (§0).

Labels:

- **[V]** verified in the repo (read-only, 2026-10-19)
- **[A]** an assumption the build must confirm
- **[R]** a recommendation

---

## 0a. Owner scope change, 2026-10-31: v1 is a student recap from the coach's voice

**Planning only. Nothing is built, and v1 doesn't start until the open items
below are decided.** On 2026-10-31 the owner narrowed v1. Where this section
conflicts with §1–§14, it wins for v1. The rest of the spec stays the target
for later versions, which will add evidence.

| | §1–§14 (full spec) | **v1 (this section)** |
|---|---|---|
| Who reads it | Coach notes + student recap | **Students only** (a class recap) |
| Evidence | Board, chapters, puzzles, polls, simuls, matches, attendance, notes, room chat (§4) | **The coach's speech only**, as a transcript |
| Languages | English | **Tamil and English, mixed within one class** |
| Transcription | Out of scope (OD-13) | **Option A: Chrome's built-in speech recognition in the coach's browser** during class (the `/admin/caption-test` bench on `feat/live-captions-test`, not merged) |
| Generation | Local `qwen2.5:3b`, off-hours (§5) | Same model and path; transcript chunked (see below) |

**Why only the coach's voice.** It's an adult who can consent. Students'
voices, the main OD-13 concern, are never captured: the coach's own browser
recognises only the coach's microphone, never the room mix.

**Planned v1 pipeline [R]:**

1. During class, the coach's Chrome recognises the coach's speech and the web
   app sends finished lines to the API (a text stream; no audio reaches our
   server).
2. The API stores the lines against the class (a new transcript table,
   additive migration; retention 30 days like `evidenceJson`).
3. After the class, names of rostered students in the transcript are replaced
   by `S#` (§4 pseudonymiser) before anything reaches the model.
4. The transcript is chunked to fit the ~6,000-token input budget, each chunk
   is summarised, then the partial summaries are merged into one recap
   (map → reduce). Estimate for a 1-hour class: about 8–10K spoken words ≈
   12K tokens, **15–25 min of off-hours CPU [A, not measured]**.
5. Output: the student view only (recap, key concepts, practice ideas). The
   recap quotes **no moves**: speech gets notation wrong ("night takes F
   seven"), and v1 has no board evidence to check a move against.

**Risks to test before any build:**

- **Mixed Tamil/English in Chrome.** Web Speech recognises one language per
  session (`ta-IN` or `en-IN`). In `ta-IN`, English chess terms may come out
  in Tamil script or garbled. `chessTermFixes.ts` on the test branch covers
  only a few terms. The planned coach test on `/admin/caption-test` must use
  a real mixed lesson.
- **The model reading Tamil.** `qwen2.5:3b` was benchmarked on English
  synthetic bundles only (INFRASTRUCTURE_DECISION.md §4.6). Its Tamil
  comprehension is unproven, and the recap's output language (English, Tamil
  or both) is undecided. Re-benchmark on real transcripts before choosing
  the model (OD-25).
- **Audio to Google.** Chrome's recognition sends the coach's audio to
  Google. It's the coach's voice, but it can contain students' names, so the
  coach's consent and the privacy page (§10) must say so.
- **Chrome only.** Coaches on other browsers produce no transcript, so the
  class gets no recap (`SKIPPED_NO_EVIDENCE`).
- **Long transcripts.** Map → reduce over 2–3 chunks hasn't been run on this
  box. The timing above is an estimate.

**Open owner decisions for v1:**

- **OD-13 (revised):** allow transcription of the coach's voice only, with
  each coach's written consent. Choosing option A implies it; it isn't yet
  recorded as approved.
- **OD-5:** does a coach still approve each recap before students see it?
  The recommendation stays **yes**, even more so for transcripts.
- **Recap language:** English, Tamil, or the student's choice.
- OD-25 to OD-29 still apply. OD-12 (room chat) isn't needed for v1.

Fallback if Chrome's mixed-language quality is poor: Groq's free Whisper
large-v3 on the coach's audio track only (needs an OD-4 exception for coach
audio), or local `faster-whisper` at night (English only in practice: small.en
takes about 1.5 h of CPU per class hour, LIVE_CAPTIONS.md §5.2 on
`feat/ai-capacity-benchmark`).

---

## 0. Corrections to AI_FOUNDATION.md Appendix A

| # | Appendix A said | Repository fact | Correction |
|---|---|---|---|
| 1 | `evidenceJson` is nulled after 30 days by a `RETENTION_RULES` entry | `RETENTION_RULES` (`retention/retention.rules.ts`) **deletes rows** by age; it can't null a column [V] | A nightly `ClassSummaryEvidenceSweep` (`JOB_LOCKS.classSummaryEvidenceSweep`) sets `evidenceJson = NULL` where `createdAt < now() - 30 days`. `AiUsageEvent` does use `RETENTION_RULES` (400 days) |
| 2 | Routes under `/classes/:id/ai-summary` | There's no `/classes` API prefix. Class routes are `/coach/classes/*` and `/live-class/:id/*` [V] | New `API_ROUTES.classSummary.*` under `/class-summaries/:classId` (§7) |
| 3 | "Every SAN replays from its referenced PGN" | Chapters store a JSON `state` (move tree), not a PGN column (`LiveClassChapter.state`) [V]. Class-board games go to the Game Library as PGN | The evidence builder renders each chapter's **mainline** with `move-tree.ts` (`mainlineNodes`, `moveTreeToPgn`), keeping its root FEN. The validator replays from that FEN. That `state` holds a `MoveTree` is [A]: confirm it, and add a converter if it doesn't |
| 4 | Feature on/off by env flag only | Every catalogued product feature is plan-gated (`platform-plans.ts`, `@RequireFeature`, spec-enforced) [V] | Both: an env kill-switch `AI_CLASS_SUMMARIES_ENABLED` and a plan feature `aiClassSummaries` (OD-27) |
| 5 | Student sees the recap "if rostered or attended" | Attendance is `ClassAttendance` per class; the roster is `BatchStudent` (soft-deletable) [V] | Visible if a `ClassAttendance` row exists for the student, or they were an active `BatchStudent` when the class started |
| 6 | The worker "pauses while live" | `LiveSession.status = LIVE` marks a live class. Egress state is `LiveSession.recordingStatus` (`RECORDING`/`STOPPING`) [V] | The claim's guard: no `LIVE` session and no `recordingStatus IN ('RECORDING','STOPPING')` anywhere (§3.3) |

---

## 1. Scope

| In Phase 3 | Not in Phase 3 |
|---|---|
| `ClassSummary` and `AiUsageEvent` tables (additive migration, getters, export) | Transcription (OD-13), video or audio of any kind |
| Evidence builder, pseudonymiser, input hash | Private live-chat messages (`recipientId IS NOT NULL`), persistent chat, profiles, payments, feedback |
| Runtime contract **v1.1**: `POST /v1/generate` + an `ollama` provider | Embeddings, RAG, rerank, tools |
| `ollama` service in `compose.ai.yml`, internal network, a pinned model | External or paid providers (OD-3/OD-4 stay "no") |
| Worker (row-as-job), catch-up cron, evidence sweep | Auto-publish of any kind |
| Validator: schema, grounding, SAN replay, `S#` leak, one repair retry | Per-student AI text (each student's own results are deterministic) |
| Coach review UI (edit, publish, discard, regenerate, feedback), student recap | Turning suggestions into assignments automatically |
| Privacy export sections, privacy page text, golden set, evaluation report | Demo classes, classes shorter than 10 minutes |

---

## 2. Data model (one additive migration)

```prisma
enum ClassSummaryStatus { QUEUED RUNNING READY_FOR_REVIEW PUBLISHED DISCARDED DEFERRED FAILED SKIPPED_NO_EVIDENCE }

model ClassSummary {
  id                String             @id @default(cuid())
  classId           String             @unique
  class             CoachClass         @relation(fields: [classId], references: [id], onDelete: Cascade)
  status            ClassSummaryStatus @default(QUEUED)
  notBefore         DateTime           @default(now())
  attempts          Int                @default(0)
  claimedAt         DateTime?
  heartbeatAt       DateTime?
  inputHash         String?            // sha256(canonical evidence + promptVersion + route)
  evidenceJson      Json?              // pseudonymised bundle; nulled after 30 days (§0 #1)
  pseudonymMap      Json?              // { "S1": userId, ... }: the only link back to students
  coachJson         Json?              // validated model output, coach view (may contain S#)
  studentJson       Json?              // validated model output, student view (never S#)
  editedStudentJson Json?              // the coach's edit; what students see when set
  failureCode       String?            // SCHEMA | GROUNDING | RUNTIME | TIMEOUT
  provider          String?
  model             String?
  modelRevision     String?            // Ollama digest
  promptVersion     String?
  schemaVersion     String?
  publishedById     String?
  publishedBy       User?              @relation("ClassSummaryPublishedBy", fields: [publishedById], references: [id], onDelete: SetNull)
  publishedAt       DateTime?
  coachRating       Int?               // -1 | 1 (thumbs), for evaluation
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  @@index([status, notBefore])
  @@map("class_summaries")
}

model AiUsageEvent {
  id            String   @id @default(cuid())
  scopeKey      String   // "global" until tenancy
  taskId        String   // "class_summary.v1"
  provider      String
  model         String
  modelRevision String?
  promptVersion String
  tokensIn      Int
  tokensOut     Int
  latencyMs     Int
  outcome       String   // OK | SCHEMA_INVALID | GROUNDING_REJECTED | RUNTIME_ERROR | TIMEOUT
  jobRef        String?  // ClassSummary.id
  createdAt     DateTime @default(now())

  @@index([scopeKey, createdAt])
  @@map("ai_usage_events")
}
```

Repository rules that apply:

- Getters for both models in `prisma.service.ts`.
- Neither model is soft-deletable or registered in Trash; both are derived data.
  The summary row is deleted with its class (`onDelete: Cascade`).
- `ai_usage_events` gets a 400-day `RETENTION_RULES` row.
- Timestamps stay naive UTC. The claim SQL copies the
  `game-analysis.worker.ts` pattern, `now() AT TIME ZONE 'UTC'` (§3.3).

---

## 3. Lifecycle

### 3.1 Trigger [V]

`LiveClassService.internalEndClass` (`live-class.service.ts:486`) is the single
idempotent end funnel: only the call that flips `LIVE → ENDED` gets past the
`count === 0` return. After `finalizeClassAttendance`, in its own `try/catch`,
it calls `ClassSummaryService.enqueueForClass(classId)`. That call:

- skips the class (no row) when the flag is off, the plan lacks the feature,
  `isDemo` is true, or the class lasted under 10 minutes (`endedAt - startedAt`);
- otherwise upserts `{ status: QUEUED, notBefore: now + 2 min }` on the unique
  `classId`. It never generates inline.

A catch-up cron runs every 10 min under `JOB_LOCKS.classSummaryCatchUp`. It
enqueues `ENDED` sessions from the last 48 h that have no row, which covers a
crash between the flip and the enqueue.

### 3.2 States

```text
QUEUED ─claim─▶ RUNNING ─ok─▶ READY_FOR_REVIEW ─publish─▶ PUBLISHED
   ▲              │  │                 │                      │
   │   live class─┘  └─fail×2─▶ FAILED └─discard─▶ DISCARDED  └─(unpublish)─▶ READY_FOR_REVIEW
   └──────────── DEFERRED (notBefore = now + 15 min)
RUNNING with no evidence ─▶ SKIPPED_NO_EVIDENCE
```

- **Regenerate** works from `READY_FOR_REVIEW`, `FAILED` or `DISCARDED`. It
  sets `QUEUED`, clears the output and `editedStudentJson`, and returns 409 while `RUNNING`.
- **Unpublish** exists so publish can use the immediate-undo pattern (§8).

### 3.3 Worker [R]

`ClassSummaryWorker` follows `game-analysis.worker.ts`:

- **Claim.** One raw `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED)`.
  It takes the row with `status IN (QUEUED, DEFERRED)` and
  `notBefore <= now() AT TIME ZONE 'UTC'`, **and only when no `LiveSession` is
  `LIVE` and none has `recordingStatus IN ('RECORDING','STOPPING')`**.
- **Heartbeat and stale sweep.** The heartbeat refreshes every 30 s. A sweep
  re-queues a row whose heartbeat is older than 5 min.
- **Concurrency.** One job at a time, box-wide, and `OLLAMA_NUM_PARALLEL=1`.
- **Mid-run class start.** The worker checks for a live class between calls,
  meaning before the repair retry. If one has started, it cancels the HTTP
  call (AbortController; the runtime's cancel token stops Ollama) and sets
  `DEFERRED`.
- **Retry budget.** `attempts` counts claims; after 4 claims the row is
  `FAILED` with `TIMEOUT`.

A summary therefore runs between classes and never during one. The ROADMAP
target ("READY within 2 h of the day's last class") follows from the 3a
throughput.

---

## 4. Evidence builder

`ClassSummaryEvidenceBuilder.build(classId)` returns
`{ bundle, pseudonymMap, inputHash }` or `null` (no evidence). It reads under
the class's own scope; it never calls a user-facing service.

| Ref kind | Source [V] | Included |
|---|---|---|
| `CLASS` | `CoachClass` title, topic, objectives, `LiveSession.startedAt/endedAt` | Duration, level from batch |
| `ACTIVITY_OUTLINE` | `LiveClassActivityQueueItem` (title, kind, `completedAt`) | Items reached, in order |
| `CHAPTER_PGN` | `LiveClassChapter.state` → mainline PGN via `move-tree.ts` (§0 #3) | Title + PGN, ≤ 120 plies each |
| `BOARD_GAME` | Class-board Game Library games + stored `GameAnalysis` | PGN + up to 5 engine-classified mistakes (White-relative, as stored) |
| `PUZZLE` | `LiveClassPuzzleAssignment` + `PuzzleAttempt` | Puzzle id, themes, rating; per-`S#` solved / time |
| `POLL`, `SIMUL`, `MATCH` | `LiveClassMovePoll*`, `LiveClassSimul*`, `LiveClassMatch*` | Results by `S#` |
| `ATTENDANCE` | `ClassAttendance` | Counts only |
| `NOTES`, `HOMEWORK` | `CoachClass.notes`, `homework` | Text as written |
| `ROOM_CHAT` | `LiveChatMessage` with **`recipientId IS NULL`** | **Only with OD-12 approved.** Sender becomes `S#` or `COACH`. ≤ 60 messages, ≤ 300 chars each |

Rules:

- **Pseudonyms.**
  - Students get `S1…Sn`, ordered by userId. Pseudonyms are stable for a class,
    and the userId order carries no rank.
  - Names are **also** replaced inside free text: chat bodies, notes and
    homework, matched on first name, full name and username, case-insensitively.
  - The coach becomes `COACH`.
  - `pseudonymMap` is stored separately, so the bundle itself holds no
    identifiers.
- **Budget.** The bundle is capped at `maxInputTokens` (6,000 [A], estimated
  at chars/3.5). When it's over, items are dropped in this order: chat → board
  analyses → extra chapters → per-student puzzle rows (aggregated instead).
  Refs are renumbered after trimming.
- **Empty.** A bundle with no chapter, game, puzzle, poll or note is
  `SKIPPED_NO_EVIDENCE`.
- **Input hash.** When `inputHash` equals the last successful hash, regenerate
  reuses the output. A regenerate whose evidence hasn't changed only re-runs
  if the coach asks for it again (`force`).

---

## 5. Generation path (contract v1.1)

- **Contract.** `POST /v1/generate` moves from the PHASE1_SPEC.md Appendix A
  sketch into the contract as minor version 1.1: Zod in
  `ai-runtime-contract.ts`, exported, drift-checked, with shared fixtures.
  Tools stay excluded.
- **Task.** `class_summary.v1` in the `ai.ts` task table:
  - `dataClass: PSEUDONYMOUS_STUDENT`, so the route is local only, enforced
    in both services;
  - `maxInputTokens 6000`, `maxOutputTokens 1500`, `timeoutMs 900000`;
  - `temperature 0`, a fixed `seed`;
  - `outputSchema` = `classSummaryModelOutputSchema` in `@nexa-chess/types`
    (`class-summary.ts`, `class_summary.v2`). It's the AI_FOUNDATION.md §A.2
    schema, except a variation is `{ line, fromMove, toMove, comment }`: the
    model never writes moves (§6).
- **Runtime.** An `OllamaProvider` with `locality: "local"`. Ollama's `format`
  is given the JSON Schema. The provider reports `modelRevision` = the model
  digest.
- **Compose (`compose.ai.yml`, still opt-in).**
  - An `ollama` service pinned to the image version the benchmark used, with
    `cpus: 1.5`, `mem_limit: 5g` and `cpu_shares: 512`.
  - It sits only on `ai_internal`, has no `ports:` and no egress.
  - Weights live on a named volume that only `scripts/ai/pull-model.sh
    <model>@<digest>` fills. That script refuses a digest other than the one
    recorded in OD-25.
- **Production wiring** (ROADMAP cross-cutting row, OD-26):
  - the `api` environment lists `AI_*`;
  - `deploy-production.sh` learns `ai-runtime` and `ollama` (build, health
    gate, `:last-good`);
  - the deploy and CI filters add `services/ai-runtime/**`.

  This is the first time the runtime runs in production, and it's a separate
  approval.

---

## 6. Validation (NestJS, authoritative)

The rules are the pure module `packages/types/src/class-summary.ts`, shared
with the benchmark and tested in `apps/api/src/ai/class-summary.spec.ts`. The
NestJS worker calls `generateGroundedClassSummary` with its own `generate`
(the runtime call) and `beforeRetry` (the live-class check, §3.3).

**Move lines are built by code (ADR-008).** The evidence builder gives each
`CHAPTER_PGN` / `BOARD_GAME` item its SAN mainline (`moves`, replayed with
`Chess` from `common/chess/chess`) and its root FEN (`startFen`).
`buildSummaryLines` turns each one into a line `L1`, `L2`, … of at most 120
plies. The prompt lists the lines with move numbers. A variation names a line
and a range of at most 6 moves. The SAN shown to the coach is rendered from
the game by `formatSummaryLine`.

Checks (`checkClassSummaryOutput`), each per item:

1. Zod-parse; on a failure, `SCHEMA`. A model-written `san` is a schema error.
2. Every `E#` exists in the bundle.
3. Every variation names an existing line and starts inside it, in order.
   Its end is shortened to the game's last move and to 6 moves
   (`adjustments`); the moves are always the game's. With no games there are
   no lines, so any variation is unsupported.
4. Every chess token in prose must be in the evidence: a move (SAN), a
   square, a signed engine score, a game result or a puzzle id. A square counts
   if a piece stands on it in the line's start FEN, a move lands on it, or the
   evidence text mentions it. Puzzle ids are matched with the caller's
   `puzzleIdPattern`; the default only fits the benchmark's `pz_…` ids.
5. No internal student identifier anywhere in `student` (`findStudentIdentifiers`:
   `S1`, `S 1`, `S-1`, `s1`, `student 3`). A student item that names a student
   is removed, never rewritten. A READY summary's whole student view must pass
   `studentViewPrivacyViolations`, which the publish route (§7) reuses for its
   400.
6. Every quoted chat span (text in "…") is a substring of a cited `ROOM_CHAT`
   ref. *(Not yet in the module; add it with OD-12.)*

**Retry, then remove.**

- On any failure the worker makes **one** repair call that lists the problems.
  After that, schema errors make the row `FAILED` with `SCHEMA`.
- Unsupported items are **removed** (`pruneClassSummary`), never rewritten.
- Both schema-valid answers are judged the same way. The better one is kept
  (`selectClassSummaryCandidate`): READY first, then fewer removals, then a
  larger share kept, then the repair.
  The rest counts only if it is usable (`assessClassSummaryUsability`): every
  required section keeps an item, at least 75% of items are kept, and
  re-checking the result finds nothing unsupported.
- Otherwise the row is `FAILED` with `GROUNDING`, and the coach sees
  "couldn't summarise this class" plus Regenerate.

Free-text claims about events in plain words aren't machine-checkable. That
is why the coach's review (OD-5) gates every publish.

Every call writes one `AiUsageEvent`. Logs keep metadata only, never prompt or
output text.

---

## 7. API (`API_ROUTES.classSummary`)

| Route | Who | Notes |
|---|---|---|
| `GET /class-summaries/:classId` | Class coach, staff: both views, `S#` mapped to names at read time from `pseudonymMap` and the current roster. Student: published student view + **their own** deterministic results | Anyone else gets 404 (not 403: no existence leak). Student visibility per §0 #5 |
| `POST /class-summaries/:classId/regenerate` | Class coach, staff | Throttled 5/h per class; 409 while `RUNNING`; `{ force?: boolean }` |
| `POST /class-summaries/:classId/publish` | Class coach, staff | `{ student?: StudentSummaryView }`, which is the edit, validated by the same Zod and the `S#` rule (400). Only from `READY_FOR_REVIEW` (409 otherwise) |
| `POST /class-summaries/:classId/unpublish` | Class coach, staff | Undo for publish (§8) |
| `POST /class-summaries/:classId/discard` | Class coach, staff | From `READY_FOR_REVIEW`; regenerate undoes it |
| `POST /class-summaries/:classId/feedback` | Class coach | `{ rating: -1 \| 1 }` |

- **Auth and parsing.**
  - The token-string auth pattern: `getAccessToken` → `authenticateUser`.
  - A private `assertCanReviewSummary(user, cls)`: the class's coach,
    `ADMIN` or `SUPER_ADMIN`.
  - `parseOrBadRequest` for params; a Zod pipe for bodies.
- **Plan and kill-switch.** `@RequireFeature("aiClassSummaries")` on the
  controller. With `AI_CLASS_SUMMARIES_ENABLED=false`, every route answers 503
  after auth, as game analysis does.
- **Tests.** Each route gets a row in `cross-user-access.int-spec.ts`: coach A
  can't read or act on coach B's class, a student of batch B gets 404, and
  every denial has a positive control.

---

## 8. Web

- **Coach.**
  - `/coach/history` gets a summary badge per class: Drafting / Ready / Published.
  - The row opens a drawer `ClassSummaryPanel`:
    - the coach view (observations with ref chips, variations on a
      `useChessAppearance()` board);
    - an editable student view with a live `S#` warning;
    - Publish, Discard, Regenerate and thumbs.
  - Feature files go in `features/class-summary/{api,hooks,components}`;
    query keys go in `queryKeys.ts`.
- **Student.** `/student/live-classes` past-class cards get a "Class recap"
  section, shown only when published. It contains the recap, key concepts,
  practice ideas and "Your results" (deterministic).
- **Undo** (`useUndoableMutation`):
  - publish is `immediate`, with unpublish as its reverse;
  - discard is `immediate`, with regenerate as its reverse.

  Regenerate is excluded: it costs a generation. Add that line to
  `lib/undo/README.md`.
- **Conventions.** Dates go through `lib/datetime.ts`. Strings say "AI draft",
  never claiming the coach wrote it. The coach's published text is shown
  without an AI label to students only when the coach edited it (OD-28).

---

## 9. Configuration

| Variable | Default | Where |
|---|---|---|
| `AI_CLASS_SUMMARIES_ENABLED` | `false` | `packages/config` `api.ts`; listed in the `api` environment only with OD-26 |
| `AI_CLASS_SUMMARY_ROUTE` | (none) | e.g. `ollama:qwen2.5:3b`. Boot fails if the flag is on and the route is unset or not local |
| `AI_CLASS_SUMMARY_MIN_MINUTES` | `10` | Shorter classes are skipped |

Existing `AI_ENABLED` / `AI_RUNTIME_*` from Phase 1 are unchanged.

---

## 10. Privacy and legal

- `features/legal/content.ts`: a new item under how data is used. It says
  that class activity is summarised by a model running on the academy's own
  server, that nothing is sent to a third party, and that a coach reviews it
  before students see it. Room chat is listed only if OD-12 is approved.
  Retention: the evidence is kept 30 days, and the summary lives with the
  class.
- Privacy export (`privacy.service.ts`), CLAUDE.md §3.6l:
  - **student:** the published student view of each class they can see, plus
    their own results;
  - **coach:** the summaries of their classes.

  `pseudonymMap` is never exported, because it links other students.
- Account deletion. The `pseudonymMap` entry for the user is removed, so their
  `S#` renders as "a student". The summary text is pseudonymous already.
- Sentry gets ids only. No summary text or evidence ever goes to logs or
  Sentry.

---

## 11. Golden set and evaluation

- **Location.** `services/ai-runtime/eval/golden/class_summary/`: 30 bundles
  committed as JSON, each with:
  - `expectFacts`: facts a good summary must mention;
  - `forbidden`: claims that are false for that bundle;
  - a reference summary written by a coach.
- **Sources:**
  - 10 from `scripts/ai/benchmark/bundles.mjs` (synthetic);
  - 20 coach-written from real lesson plans with **invented** students.

  No real class data goes into the repo (C-7).
- **Runner.** `scripts/ai/eval-class-summary.mjs` reuses `validate.mjs`. It
  reports:
  - schema-valid before retry;
  - grounding precision (must be 100% after the validator);
  - fact recall (target ≥ 70% [R]);
  - forbidden-claim rate (target 0);
  - `S#` leakage (0);
  - p50 and p95 latency.

  Reports go to `services/ai-runtime/eval/reports/`.
- **Coach usefulness.** Thumbs over 4 weeks, ≥ 70% positive (ROADMAP).

---

## 12. Tests

| Layer | What |
|---|---|
| Unit (`*.spec.ts`) | The validator, one case per §6 rule. The pseudonymiser: names in free text, ordering, an empty roster. Evidence budgeting and renumbering. The state machine, including 409s. Enqueue skips (demo, short, flag, plan) |
| Integration (`*.int-spec.ts`) | Claim SQL under concurrency (two workers, one claim). The live-class guard blocks a claim. The stale sweep. The evidence sweep nulls only old rows. The upsert is idempotent when `internalEndClass` races the cron. The cascade on class delete. The `route-auth` and `admin-routes` suites pick up the new routes |
| Access | `cross-user-access.int-spec.ts` rows for all six routes |
| Runtime (`*.runtime-spec.ts`, AI CI job) | v1.1 fixtures round trip. `PSEUDONYMOUS_STUDENT` to a non-local route is refused in both services. Ollama is mocked with a canned-JSON HTTP stub, so CI pulls no weights |
| E2E (opt-in `RUN_CLASS_SUMMARY_E2E=1`) | End a class → the stub provider → coach publishes → student sees the recap with no `S#` |

---

## 13. New owner decisions (to add to DECISIONS.md §3)

| ID | Decision | Recommendation |
|---|---|---|
| OD-25 | Which model and digest | The 3a winner, pinned by digest, Apache/MIT preferred |
| OD-26 | First production run of `ai-runtime` + `ollama`: compose, deploy script, env listing | Approve as its own change, after Phase 3 is green on staging |
| OD-27 | Plan gating | A new `aiClassSummaries` feature, Enterprise only at launch (migration adds it to that row) |
| OD-28 | What students see about AI | Label the recap "Prepared by your coach with AI assistance" always (recommended), or only when the coach didn't edit it |
| OD-29 | Coach notification | An in-app badge only in v1. No `MessagingEvent`, so no WhatsApp/email for drafts |

OD-5 (coach approval), OD-11 (staging) and OD-12 (room chat as evidence)
already exist and block this phase.

---

## 14. Rollout

1. Merge behind the flag, off.
2. On staging (OD-11), real-shaped but synthetic classes. Run the golden-set
   report.
3. Production with one coach (plan feature on, flag on, OD-26 shipped) for 2
   weeks. Watch Beszel CPU during the summary window, the live-class
   join/latency metrics and the `AiUsageEvent` outcomes.
4. All coaches when the ROADMAP Phase 3 acceptance holds.

**Rollback:** set the flag off (the routes answer 503 and the worker idles),
then restore the `:last-good` images. The migration is additive and stays.

## 15. Effort and risks

| Item | Size |
|---|---|
| Schema + worker + evidence builder + validator | M |
| Runtime v1.1 + Ollama provider + compose | M |
| Coach and student UI | M |
| Privacy, legal, export, golden set, eval | S–M |
| **Total** | **L (about 3–4 weeks of focused work)** |

| Risk | Mitigation |
|---|---|
| Model quality is too low for coaches to bother | Golden-set gate before any coach sees it; thumbs; discard is one click |
| CPU contention with a class that starts mid-generation | Claim guard, a mid-run check before the retry, `cpu_shares 512`, a 1.5-CPU cap |
| A pseudonym leaks into the student view | Validator rule 4, the publish-time check, the coach's review, and an e2e assertion |
| A name in free text reaches the model | The free-text name replacement (§4), with a unit test per field |
| The benchmark fails | A documented no-go. The fallbacks are OD-6 (b)/(c), or the summaries wait |

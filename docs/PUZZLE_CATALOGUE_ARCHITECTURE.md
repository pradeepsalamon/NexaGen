# Lichess Puzzle Catalogue & Adaptive Training — Architecture Audit

Status: **implemented; this is the original audit.** What was built, and how, is
[PUZZLE_CATALOGUE_IMPLEMENTATION_SPEC.md](PUZZLE_CATALOGUE_IMPLEMENTATION_SPEC.md):
the `lichess_puzzles` table and load tooling, rating maths, the catalogue API +
UI (`puzzle-catalog.service.ts`, `CatalogBrowser`) and student rated training
(`puzzle-training.service.ts`, `StudentTrainingClient`). The audit below
(2026-10-03, against `feat/beszel-monitoring` @ `0939b61`) is kept for its
measurements and is not updated. §G.3 (Phase 6 set-level and training modules)
is still not built.

Evidence base: the code paths cited below (read, not assumed), the production
host's real resources and Postgres settings (read-only), a full profile of the
current dump (`lichess_db_puzzle.csv.zst`, downloaded to a session scratchpad),
and a benchmark of the proposed table in a **throwaway** Postgres 15 container on
this box capped at 1 CPU / 1.5 GB (deleted afterwards). Numbers marked
**measured** came from that; numbers marked *estimate* are extrapolated and say
from what.

---

## A. Executive summary

**Can NexaChess safely use the 6.15M Lichess puzzles?** Yes. The data is clean:
6,157,341 rows, 0 duplicate ids, 0 malformed ids/FEN/UCI across the whole file;
0 illegal lines in a 100k-row `chess.js` replay (**measured**). It is CC0.

**Should they live in PostgreSQL?** Yes — in the existing `nexa_postgres`
instance, no new datastore. **Measured** at full size: 1.63 GB heap + ~0.3 GB of
indexes ≈ **2.0 GB**; COPY of all 6.15M rows in 50 s at 1 CPU; index builds 10–60 s
each. With the right index and physical order, the selection queries the product
needs run in **1–2 ms p50 / < 5 ms p95** (common themes) and **7–10 ms p50 /
18–31 ms p95** (rare themes). Disk (153 GB free) and RAM (11 GB) are not
constraints; the 2-vCPU CPU budget shared with LiveKit/egress/Stockfish is, which
is why the heavy validation work runs *off* the production box.

**But not in the existing `puzzles` table.** The current library code assumes a
library of tens-to-hundreds of hand-authored rows. Six concrete things break at
6M rows (§C.4) — most severely, the default title sort in
`PuzzleService.list` loads *every matching id + title into Node* to natural-sort
them, and all three consumers of that endpoint (admin/coach library, in-class
`PuzzleAssignModal`, course `AttachModuleModal`) hit that path.

**Recommended shape (the simplest one that keeps the layers apart):**

```
SOURCE DATA        lichess_puzzles      6.15M rows, raw Lichess fields, read-only,
                                        reproducible, excluded from backups
     │  "adopt" / "train" materialises ONE row on first use
     ▼
NEXACHESS PUZZLE   puzzles (existing)   + source / sourceId / rating / setupMoveUci
     │
LEARNING DATA      puzzle_attempts, puzzle_rating_changes, student_progress (existing, unchanged shape)
PEDAGOGICAL DATA   puzzle_topics (folders = sets), courses/course_modules (existing)
ADAPTIVE DATA      derived on read from attempts (no new table in V1)
```

**What can be reused as-is:** the solver (`StudentPuzzleSolveClient` +
`usePuzzleAttempt` + `PracticeBoard`), the server-authoritative attempt flow
(`PuzzleAttemptService` start/save/submit/hint), the single SOLVE_LINE engine
(`AssignmentEvaluationService`), topic folders, courses, live-class sharing,
rating + streak storage, Trash/soft delete for authored puzzles. No technology
needs replacing: Prisma, TanStack Query, local solver state, chess.js and
PostgreSQL all stay.

**What must change (all small, all evidence-backed):**
1. Fix `PuzzleService.list` title sort (needed even without Lichess).
2. Accept *any* checkmating final move — 5.2% of Lichess mate puzzles
   (171/3,291 in a sample, **measured**) have more than one; today a correct mate
   is marked wrong.
3. Rate against the puzzle's own rating, not a 5-value difficulty bucket, and
   stop giving full rating credit to solves that needed wrong moves (Lichess
   ratings assume first-try correctness).
4. Store and show the opponent's setup move (Lichess positions are "after the
   opponent just played X"; today the student would see a cold position).
5. Wire the server's existing (unused) progressive hint endpoint into the
   student solver — Lichess puzzles carry no text hints, so today they would
   have no hints at all.
6. Exclude the catalogue's data from `scripts/backup_db.sh`.

**What should NOT change:** the attempt model, the evaluation engine's structure,
the auth pattern, folder-based curation, live-class flows, Prisma for request
paths, the solver UI.

**One product decision is needed before Phase 3** (§H.0): the codebase states
deliberately that *"Puzzles are classroom material … there is no student
library"* (`apps/web/src/app/student/puzzles/page.tsx`). Self-directed adaptive
training reverses that. Phases 0–2 (fixes, catalogue, coach curation) are useful
either way; the student training surface is not built until that is decided.

---

## B. Current architecture (traced, not assumed)

### B.1 Request path — student solves a puzzle today

```
/student/puzzles/[id]                         apps/web/src/app/student/puzzles/[id]
  └ StudentPuzzleSolveClient                  features/puzzles/components/StudentPuzzleSolveClient.tsx
      └ usePuzzleAttempt({start})             features/puzzles/hooks/usePuzzleAttempt.ts   (React local state)
          │ POST API_ROUTES.puzzles.attempts(id)
          ▼
      PuzzleAttemptService.start              apps/api/src/puzzle/puzzle-attempt.service.ts
          loadSolvable: PUBLISHED + (GLOBAL | PRIVATE by a coach of the student's batch)
          resume IN_PROGRESS attempt, else create attemptNumber = count+1
          returns fen, orientation = studentColor = side to move in `fen`
          │
   board: PracticeBoard(fen) — student plays
          │ PUT puzzles.attempt(id, attemptId)  {moves:[...played, candidate]}
          ▼
      saveProgress → evaluation.assertLegalLine → solveLineFeedback
          wrong  → wrongMoves += 1 (line NOT persisted; client snaps back)
          right  → movesJson saved; forced opponent reply returned (opponentReply)
          client appends reply, PUTs again, and when lineComplete →
          │ POST puzzles.submit
          ▼
      submit → evaluateSolveLine (exact UCI prefix match) → status SOLVED/FAILED,
               scorePercent, accuracyPercent, hintsUsed = max(server, client)
          ├ analyticsEvents.record(PUZZLE_ATTEMPT)                       fire-and-forget
          └ progress.recordPuzzleResult(difficulty, solved, hintsUsed)    fire-and-forget
                 ProgressRecorderService (row lock on student_progress)
                 first finished attempt per (student, puzzle) only → PuzzleRatingChange
                 Elo vs PUZZLE_DIFFICULTY_RATINGS[difficulty]; K 40 (<20 rated) / 20
                 streak by the student's own timezone day
```

Hints in the student UI are the puzzle's **authored text hints** (`hintsJson`),
counted client-side and sent as `hintsUsed`. The server's progressive hint
endpoint (`POST /puzzles/:id/attempts/:attemptId/hint` →
`AssignmentEvaluationService.solveLineHint`: piece → origin square → move,
server-counted) exists and has a client function (`puzzleApi.ts:220`) but **no
component calls it**.

"Give up" submits the current moves → FAILED; the result reveals the solution.

### B.2 Other entry points into the same puzzle rows

| Path | Code | Note |
|---|---|---|
| Admin/coach library | `PuzzleLibraryClient` → `GET /puzzles` → `PuzzleService.list` | 20/page, filters, sortable columns |
| PGN multi-game import | `PuzzleImportDialog` → `POST /puzzles/import` (≤200) → `createOne` | per-item failures |
| Live class share | `PuzzleAssignModal` / `useLoadNextPuzzle` → `GET /puzzles?sort=title&pageSize=100` → `LiveClassPuzzleService` | folder = sequence ("Ask"/"Load next" walk a folder by title) |
| Live attempt | `liveClass.puzzleAttempt` → `PuzzleAttemptService.start(…, {liveClassId})` | same save/submit routes, plus `assertLiveAssignmentOpen` |
| Course module | `AttachModuleModal` → `GET /puzzles` ; `CourseModule.puzzleId` | one module = one puzzle; self-healing completion from SOLVED attempts |
| Progress | `GET /progress/me`, `/progress/students/:id` → `ProgressService.build` | rating, history (100), recent (10), solved/attempted counts |

### B.3 Sources of truth

| Concept | Source of truth today |
|---|---|
| Puzzle definition | `puzzles` row (`fen` = position the solver sees, side to move = solver) |
| Puzzle solution | `puzzles.solutionMovesJson` `[{uci,san}]`, normalised by `normalizeSolution` (chess.js) |
| Puzzle difficulty | `puzzles.difficulty` enum (BEGINNER…EXPERT), author-chosen |
| Puzzle "rating" | none per puzzle — derived from the enum via `PUZZLE_DIFFICULTY_RATINGS` (800/1000/1300/1600/1900) |
| Student puzzle rating | `student_progress.puzzleRating` (+ `peakRating`, `ratedPuzzles`) |
| Rating history | `puzzle_rating_changes` (unique `(studentId, puzzleId)`; `puzzleId` has no FK) |
| Attempt | `puzzle_attempts` (moves, score, accuracy, hintsUsed, wrongMoves, durationSeconds) |
| Wrong moves | `puzzle_attempts.wrongMoves`, incremented server-side in `saveProgress` |
| Hints | text: `puzzles.hintsJson` (count client-reported); progressive: server-counted but unused by UI |
| Streak | `student_progress.currentStreak/longestStreak/lastActiveDay` |
| Curriculum membership | `puzzles.topicId` (one folder per puzzle) and `course_modules.puzzleId` |
| Assignment (live) | `live_class_puzzle_assignments` |
| Assignment (homework) | `assignments` (PGN/SOLVE_LINE, separate model; not puzzle rows) |
| Completion | `puzzle_attempts.status = SOLVED`; course: `student_module_progress` |
| Recommendation | **none exists** |
| Stockfish in puzzles | **none** — `AssignmentEvaluationService` holds `StockfishService` only for PLAY_VS_ENGINE accuracy/replies |

### B.4 Production reality (read-only checks)

- Host: 2 vCPU ARM, 11 GiB RAM (8.8 GiB available), 193 GB disk / 153 GB free.
  Runs web, api (+ in-process Stockfish pool, default 4 engines), postgres,
  redis, livekit, egress, beszel.
- Postgres 15.18, **stock settings**: `shared_buffers 128MB`, `work_mem 4MB`,
  `maintenance_work_mem 64MB`, `max_connections 100`, `max_wal_size 1GB`.
  Container has Docker's default 64 MB `/dev/shm`.
- `nexa_chess` is **19 MB**: 29 puzzles, 110 attempts, 17 topics, 0 courses.
- `DATABASE_URL` sets no `connection_limit` → Prisma's default pool
  (2×CPU+1 = 5).
- Backup: `pg_dump | gzip` nightly at 20:00 UTC, 14-day retention to OCI.

---

## C. Existing schema analysis

### C.1 Puzzle-related models

```
PuzzleTopic (soft-delete, Trash) ─┬─< Puzzle (soft-delete, Trash) ─┬─< PuzzleAttempt (cascade)
  parentId tree, partial-unique   │    topicId Restrict             ├─< LiveClassPuzzleAssignment (Restrict)
  name/slug                       │                                 └─< CourseModule.puzzleId (Restrict)
                                  │
Course ─< CourseModule (ASSIGNMENT | PUZZLE) ─< StudentModuleProgress
StudentProgress (1/student)   PuzzleRatingChange (unique student+puzzle)
PuzzleScoringSettings (live-class points, singleton)
Assignment ─< AssignmentBatch ─< StudentAssignment ─< StudentAssignmentAttempt   (separate homework model)
Practice / StudentPractice  (legacy stub, string-typed; read only by student.service — do not build on it)
```

### C.2 `Puzzle` columns that matter here

`fen` (solver's position), `solutionMovesJson` (JSON `[{uci,san}]`),
`hintsJson`, `tags String[]` (free tags, searched with `has`), `puzzleType`
(7-value enum), `difficulty` (5-value enum), `estimatedSeconds`, `scoringJson`,
`status` DRAFT/PUBLISHED/ARCHIVED, `visibility` GLOBAL/PRIVATE, `createdByRole`
(required), `topicId` (required), soft-delete columns. **13 indexes.**

### C.3 Semantics the import must respect

- **Solver colour = side to move in `fen`** — both server
  (`PuzzleAttemptService.sideToMove`) and client (`puzzleSolverEngine.sideToMove`).
  Lichess's `FEN` is the position *before* the opponent's move, so the stored
  `fen` must be the position **after** `Moves[0]`, and the solution is
  `Moves[1..]`.
- Opponent replies inside the solution are auto-played by
  `solveLineFeedback` (`opponentReply`). Lichess's even-length lines
  (2–34 plies, **measured**) map 1:1 onto this.
- Matching is **exact UCI prefix** (`matchedPrefix`). Lichess accepts any mate on
  the final move; see §J.2.
- A wrong move does **not** end the attempt; the student retries from the last
  good position. `wrongMoves` is counted.
- Rating: only the **first finished attempt** per (student, puzzle) is rated;
  score 1 clean, ½ with hints, 0 failed; wrong moves ignored.

### C.4 Why 6M rows cannot go into `puzzles` directly

| # | Code | What happens at 6M rows |
|---|---|---|
| 1 | `PuzzleService.list` — `resolveOrderBy(..., { title: "asc" })` default, then `if (titleOrder) findMany({ where, select: {id,title} })` + JS `compareNatural` sort | Unsorted library, `AttachModuleModal` (no sort ⇒ default), `PuzzleAssignModal` and `useLoadNextPuzzle` (explicit `sort: "title"`) all load **every matching row** into Node. With `status=PUBLISHED, scope=all` that is 6M rows → API OOM. |
| 2 | `list` / `listForStudent` — `prisma.puzzle.count({ where })` on every page | Filtered exact counts **measured at 32 s** (theme + rating filter; bitmap goes lossy under `work_mem 4MB` and reads the whole 1.4 GB heap). |
| 3 | `search` → `title/description contains insensitive` | `ILIKE '%x%'` sequential scans of 6M rows per keystroke (debounced, but still). |
| 4 | `stats()` — 6 `count()` calls | Each a scan of the table on every library page load. |
| 5 | Visibility: GLOBAL puzzles appear in every coach's library and the in-class picker | Coaches lose their 29 curated puzzles in a 6M-row list. |
| 6 | Soft delete + Trash + 13 indexes + nightly `pg_dump` | Trash semantics meaningless for source data; every write maintains 13 indexes; backups grow ~20–25× with data that can be re-downloaded. |

---

## D. Lichess → NexaChess field mapping

Profile of the current dump (**measured**, all 6,157,341 rows):

| Field | Observed |
|---|---|
| PuzzleId | 5 chars `[A-Za-z0-9]`, unique |
| FEN | 6 fields, avg 53 chars; all parse in chess.js (100k sample) |
| Moves | UCI, 2–34 plies (all even); 2: 15%, 4: 51%, 6: 26%, 8+: 8% |
| Rating | 399–3323; p5 648, p25 1041, p50 1413, p75 1870, p95 2437 |
| RatingDeviation | 45–500; p50 79, p75 89, p95 118 |
| Popularity | −83…100; p5 60, p50 90 |
| NbPlays | 0–312,665; p25 121, p50 400 |
| Themes | 73 distinct keys, 1–13 per puzzle (avg 4.4) → 27M memberships |
| OpeningTags | 20% of rows; 1,591 distinct |
| DailyDate | **1,787 rows** (0.03%), Unix ms |

| Lichess field | Current NexaChess field | Match? | Transformation | Recommendation |
|---|---|---|---|---|
| PuzzleId | — | No | none | `lichess_puzzles.id` (PK). On a materialised puzzle: `puzzles.sourceId` + `source = LICHESS`, unique together. |
| FEN | `puzzles.fen` | Semantics differ | apply `Moves[0]` with chess.js → canonical FEN | Catalogue keeps the **raw** FEN (source fidelity, refresh diffs). `puzzles.fen` = post-setup FEN. |
| Moves | `puzzles.solutionMovesJson` | Format differs | `Moves[0]` → `puzzles.setupMoveUci` (new); `Moves[1..]` → `normalizeSolution` → `[{uci,san}]` | Catalogue keeps the raw UCI string; SAN is computed once at materialisation by the existing `normalizeSolution`. |
| Rating | — (enum only) | No | — | Catalogue `rating SmallInt`. Materialised: `puzzles.rating Int?` (new, NexaChess-owned, **seeded** from source) + `difficulty` derived by band. |
| RatingDeviation | — | No | — | Catalogue only. Used for the `eligible` quality gate. Not copied. |
| Popularity | — | No | — | Catalogue only. Quality gate. |
| NbPlays | — | No | — | Catalogue only. Quality gate. |
| Themes | `puzzles.tags String[]` | Close | split on space | Catalogue `themes String[]` + GIN. Materialised: copied into the existing `tags` (so library search/tags keep working; no new column). |
| GameUrl | — | No | — | Catalogue only (provenance, "view original game" for coaches). |
| OpeningTags | — | No | split on space | Catalogue `openingTags String[]` + GIN (measured 9.6 MB). Coach browse by opening. |
| DailyDate | — | No | ms → UTC | **Not imported.** 0.03% populated and no NexaChess feature uses it (§24). Re-addable from the file. |

Fields NexaChess needs that Lichess lacks, kept to those with a concrete consumer:

| Field | Where | Purpose |
|---|---|---|
| `source` enum (`NEXA` default, `LICHESS`) | `puzzles` | Provenance; library filter; idempotent materialisation |
| `sourceId String?` | `puzzles` | Links to the catalogue row; unique with `source` |
| `rating Int?` | `puzzles` | Per-puzzle difficulty for the student-rating maths; null ⇒ enum bucket (all existing rows) |
| `setupMoveUci String?` | `puzzles` | Highlight / animate the opponent's move that created the puzzle |
| `ratingBand SmallInt`, `randKey Int`, `eligible Boolean` | `lichess_puzzles` | Selection index (§K.3) and quality gate |
| `refreshedAt DateTime` | `lichess_puzzles` | Which dump a row was last seen in (refresh diffs / retired puzzles) |

Not added (no consumer yet): verification status (validation happens before the
row exists), import batch id (rollback is a `TRUNCATE`, §28), version, age group,
skill level, curriculum category, training objective, lesson.

---

## E. Target database schema

### E.1 Data ownership decision

Options evaluated:

| Option | Shape | Verdict |
|---|---|---|
| 1. Lichess rows straight into `puzzles` | one table | **Rejected** — §C.4. |
| 2. Generic `Puzzle` + `PuzzleSource` + `PuzzleVersion` + `PuzzleMetadata` | 4 tables | **Rejected** — one external source exists; `PuzzleVersion` has no consumer (issued puzzles are not edited in place by anything); `PuzzleMetadata` would be an EAV bag of Lichess fields. Pure abstraction cost. |
| 3. **Source catalogue table + generic `Puzzle` with provenance columns, materialise on use** | 1 new table, 4 new columns | **Recommended.** |

Option 3 gives the generic model the brief asks for at the level that matters:
`Puzzle` is source-independent (`source` + `sourceId`), and every source keeps its
own raw metadata in its own catalogue table. A second source (e.g. NexaChess
engine-generated puzzles) gets its own catalogue table only if its metadata
differs; if it doesn't, it can write `puzzles` rows directly with
`source = GENERATED`.

Why materialise instead of joining the catalogue everywhere: attempts, rating
changes, course modules, live assignments and the solver all key on
`puzzles.id`. Creating the `puzzles` row the first time a puzzle is actually used
(adopted by a coach, or served to a student) keeps **every existing code path
unchanged**, and keeps `puzzles` small (one row per puzzle anyone has touched; a
student solving 30/day for 5 years touches ~55k).

Tradeoffs accepted:
- One Lichess puzzle ↔ at most one `puzzles` row (unique `(source, sourceId)`),
  hence in one folder. A coach who wants it in a second folder duplicates it
  (`duplicate()` already exists and does not copy `sourceId`). Revisit (§E.4) only
  if that becomes routine.
- Two representations of the same position. The catalogue is never edited, so
  they cannot drift except by a deliberate NexaChess edit of the `puzzles` row —
  which is the point of separating them.

### E.2 Prisma sketch (illustrative, not final)

```prisma
enum PuzzleSource {
  NEXA      // authored in NexaChess (every existing row)
  LICHESS
}

model Puzzle {
  // … all existing fields unchanged …
  source       PuzzleSource @default(NEXA)
  sourceId     String?      // lichess_puzzles.id when source = LICHESS
  /// NexaChess difficulty rating. Seeded from the source rating on
  /// materialisation; null = derive from `difficulty` (PUZZLE_DIFFICULTY_RATINGS).
  rating       Int?
  /// The opponent move that produced `fen` (Lichess Moves[0]); display only.
  setupMoveUci String?

  @@unique([source, sourceId])   // NULL sourceIds don't collide
  @@index([source])
}

/// Raw Lichess puzzle dump (CC0). Read-only source data: loaded by
/// scripts/lichess-puzzles-load.sh, never written by the API, not
/// soft-deletable, not Trash-registered, excluded from backup data.
model LichessPuzzle {
  id              String    @id            // PuzzleId
  fen             String                   // position BEFORE Moves[0]
  moves           String                   // raw UCI, space separated
  rating          Int       @db.SmallInt
  ratingDeviation Int       @db.SmallInt
  popularity      Int       @db.SmallInt
  nbPlays         Int
  themes          String[]
  openingTags     String[]
  gameUrl         String
  ratingBand      Int       @db.SmallInt   // rating / 50
  randKey         Int                      // stable hash of id
  eligible        Boolean                  // quality gate (§F.4)
  refreshedAt     DateTime

  @@index([eligible, ratingBand, randKey])
  @@index([themes], type: Gin)
  @@index([openingTags], type: Gin)
  @@map("lichess_puzzles")
}

model PuzzleAttempt {
  // … unchanged …
  @@index([studentId, completedAt])   // history / recent-performance reads
}
```

Notes:
- **No hand-written partial or expression index.** An earlier benchmark used
  `WHERE eligible` partial indexes and `((rating/50), rand_key)`. Both are
  dropped from the design: Prisma binds `eligible = $1` as a parameter, and once
  Postgres switches to a generic plan it can no longer prove a partial-index
  predicate. A real `ratingBand` column with `eligible` leading the composite is
  fully expressible in `schema.prisma`, keeps CI's `prisma migrate diff
  --exit-code` clean, and costs ~45 MB more (*estimate* from the measured 87 MB
  partial index × 6.15/4.05).
- `PrismaService` needs a `lichessPuzzle` getter (CLAUDE.md §7 rule 1).
- `difficulty` stays required. On materialisation it is derived from the rating
  with the midpoints of the existing `PUZZLE_DIFFICULTY_RATINGS`:
  < 900 BEGINNER, < 1150 EASY, < 1450 INTERMEDIATE, < 1750 ADVANCED, else EXPERT.
- `puzzleType` derived from themes: `mate*` → CHECKMATE, `*Endgame|endgame` →
  ENDGAME, `opening` → OPENING, else TACTICAL.
- `title`: `"<primary motif label> · <rating>"` (e.g. "Fork · 1450") — generated,
  editable after adoption.
- `topicId` (required): adopted puzzles go to the folder the coach picks;
  training-served puzzles go to a system folder "Lichess training", created
  lazily by the service (the same lazy-seed pattern as `PuzzleScoringSettings`
  and `OfflinePaymentMethod` — no seed migration).
- `createdByRole`: the adopting user's role; for training-served puzzles
  `ADMIN` with `createdById = null` (label "Admin" via the existing
  `roleLabel`).

### E.3 Theme storage (§9)

| Option | Cost (**measured**/extrapolated) | Verdict |
|---|---|---|
| A. `String[]` on the catalogue | GIN 25–38 MB | **Chosen** for the catalogue. |
| B. `PuzzleTheme` + membership table | 27M rows, **~2.1 GB** (measured 104 MB per 300k puzzles) — larger than the whole catalogue heap | Rejected. |
| C. `smallint[]` ids + dictionary | heap 227 B/row vs 278 (≈ −300 MB) | Rejected for V1: a dictionary join for every read and every coach filter to save 15%. Revisit only if disk matters. |
| D. Hierarchical theme taxonomy table | — | Rejected. Lichess's 73 keys are a fixed, externally-owned vocabulary; NexaChess's own hierarchy already exists — `PuzzleTopic` folders. |

Answers to the brief's questions, from the code:
- *Will themes be edited?* Lichess themes, no (source data). NexaChess
  classification is the folder a puzzle sits in, plus the copied `tags`, both
  already editable.
- *Hierarchical / coach-created categories?* Already served by `PuzzleTopic`
  (nested folders, `MAX_PUZZLE_TOPIC_DEPTH`).
- *Curriculum using multiple themes?* Yes, for training specs (§G.3) — an
  array filter (`themes && $1`) on the GIN index covers it.

The 73 theme keys get a static catalogue in `@nexa-chess/types`
(`lichess-themes.ts`): key, display label, group (`motif`, `mate`, `phase`,
`length`, `goal`, `origin`, `special`), and a `minRating` below which the
recommender doesn't pick it as a target (e.g. `mateIn4`). Display labels and
grouping are the only "taxonomy" needed.

### E.4 Puzzle sets (§14)

**Already exists: a `PuzzleTopic` folder is the reusable set.** In-class "Ask" /
"Load next" walk a folder in title order (`useLoadNextPuzzle`,
`lib/puzzleCursor.ts`), the share dialog browses folders, and the library filters
by folder subtree. "Fork Fundamentals" or "Mate in 1" are folders.

A separate `PuzzleSet` / `PuzzleSetItem` many-to-many is **not justified yet**.
It would duplicate the folder concept, and the only thing it adds is one puzzle
in several sets. Signal that would justify it: coaches routinely duplicating the
same Lichess puzzle into several folders, or a product need for ordered sets
that mix puzzles across folders.

---

## F. Import architecture

### F.1 Shape

```
lichess_db_puzzle.csv.zst  (307 MB)
   │  zstd -dc  (4 s for the whole file — never the bottleneck)
   ▼
STAGE 1 — PREPARE (offline: a dev laptop or CI runner, NOT the prod box)
   apps/api/scripts/lichess-puzzles-prepare.cjs
   line split (no CSV library — no field contains a comma or quote; the
   column count is asserted per line and a mismatch is a reject)
   validate (§F.3) with the repo's chess.js
   derive ratingBand, randKey = hash(id), eligible
   ─► lichess_puzzles.<dump>.tsv   sorted by (ratingBand, randKey)  ~1.3 GB
   ─► rejects.<dump>.tsv           id, line no, reason
   ─► manifest.<dump>.json         source sha256, counts, durations
   │  copy the .tsv.zst (~300 MB) to the box
   ▼
STAGE 2 — LOAD (prod box, DB-only work, off-peak)
   scripts/lichess-puzzles-load.sh <manifest>
   ① preflight: migration applied, disk free > 3× file, no LIVE class,
      not inside the 20:00 UTC backup window
   ② \copy → lichess_puzzles_staging (UNLOGGED, no indexes)          ~1 min
   ③ promote in chunks of one ratingBand (~60 chunks × ~100k rows):
        INSERT … SELECT … FROM staging WHERE ratingBand = $b
        ON CONFLICT (id) DO UPDATE SET <metadata> , refreshedAt
          WHERE <any metadata changed>
      each chunk its own transaction; between chunks re-check for a LIVE
      class and sleep; progress = the set of bands already carrying
      refreshedAt = this dump
   ④ retire: UPDATE … SET eligible = false WHERE refreshedAt < this dump
   ⑤ VACUUM (FREEZE, ANALYZE, PARALLEL 0) lichess_puzzles
   ⑥ DROP staging; print the report
```

### F.2 Choices and why

| Question | Decision | Evidence / reason |
|---|---|---|
| Stream or load in memory? | Stream end to end | Node holds one line at a time; GNU `sort` (disk-backed) does the ordering. |
| Where does validation run? | **Off the prod box** | chess.js replays **~970 puzzles/s per core (measured)** → ~1.75 h on one core. On the prod box that is a vCPU taken from LiveKit/egress/Stockfish for hours. Off-box it costs nothing. |
| Physical order | Pre-sorted by `(ratingBand, randKey)` in the TSV | Rare-theme selection dropped from **753 ms to ~7 ms p50** once the heap was band-sorted (**measured**). Sorting inside Postgres took **4 min** at `work_mem 4MB` vs `sort` on a laptop. |
| COPY vs Prisma `createMany` | `psql \copy` via `docker exec -i nexa_postgres` | **50 s for 6.15M rows (measured)**. Prisma has no COPY; `createMany` would push 6M rows through the query engine in JSON. psql is already in the container — no new npm dependency (`pg`, `pg-copy-streams` not needed). |
| Staging table? | Yes, UNLOGGED, dropped after | Makes the refresh a diff (`ON CONFLICT … WHERE changed`), makes promotion resumable per band, and keeps the indexed table's write path in bounded transactions. |
| Upsert vs insert | Upsert (`ON CONFLICT (id) DO UPDATE … WHERE` changed) | Monthly refresh changes rating/RD/popularity/plays on many rows; unchanged rows write nothing. First load is the same code path. |
| Duplicates | Within a file: prepare rejects (0 seen). Across loads: PK conflict = update. | |
| Transactions | One per band chunk (~100k rows) | No transaction holds locks for long; `lichess_puzzles` is read by nothing else during the first load. |
| Resume | Re-run the script | Stage 2 is idempotent: staging is truncated and reloaded (1 min); chunks already carrying this dump's `refreshedAt` are skipped. A crash, restart, dropped SSH or DB restart all resume by re-running. Prepare is also re-runnable (pure function of the input file). |
| Failed rows | Never reach the DB | `rejects.tsv` + counts in the manifest; the load refuses if rejects > 0.1% (a format change upstream). |
| Rollback | §28 | |

### F.3 Validation rules (prepare stage)

| Field | Rule | Reject or flag |
|---|---|---|
| line | exactly 11 comma-separated columns | reject |
| PuzzleId | `^[A-Za-z0-9]{5}$`, unique within file | reject |
| FEN | `new Chess(fen)` succeeds (repo chess.js 1.4) | reject |
| Moves | each token `^[a-h][1-8][a-h][1-8][qrbn]?$`; even count ≥ 2; every move legal in sequence from FEN (same `chess.move({from,to,promotion})` call `applyUci` uses) | reject |
| Mate themes | if `themes` contains `mate`, the final position is checkmate | reject (0 failures in 3,291 sampled) |
| Rating | integer 100–4000 | reject |
| RatingDeviation | integer 0–1000 | reject |
| Popularity | integer −100…100 | reject |
| NbPlays | integer ≥ 0 | reject |
| Themes | non-empty; keys outside the known 73 | **flag** (kept, counted in manifest; the types catalogue needs updating) |
| OpeningTags | `^[A-Za-z0-9_'-]+$` per tag | flag |
| GameUrl | starts with `https://lichess.org/` | flag |

FEN is stored as given (raw source). The canonical post-setup FEN is produced at
materialisation by the existing `assertValidFen` / `normalizeSolution` path,
which also re-validates the line — so even a catalogue row that bypassed prepare
can never become an unplayable `puzzles` row.

### F.4 Quality gate — `eligible`

`ratingDeviation <= 90 AND popularity >= 50 AND nbPlays >= 100` →
**4,052,640 eligible (65.8%, measured)**. Ineligible rows stay in the catalogue
(a coach may still adopt one deliberately) but are never auto-served. The
thresholds are a V1 opinion: RD > 90 means Lichess itself isn't confident in the
rating, and the training maths depends on that rating.

### F.5 Commands (§26)

Two commands are necessary; the rest of the brief's list folds into them:

| Command | Does | Folds in |
|---|---|---|
| `npm run puzzles:prepare -w apps/api -- --in <file.zst> --out <dir>` | stream, validate, derive, sort, write TSV + rejects + manifest | download (a `curl` line in the README), validate, stats |
| `scripts/lichess-puzzles-load.sh <manifest.json>` | preflight, staging COPY, chunked promote, retire, vacuum, report | import, resume (re-run), rebuild indexes (not needed — indexes are migration-owned), stats (end-of-run report) |

Not created: `puzzles:reclassify` (no NexaChess classification is computed in
bulk in V1), `puzzles:rebuild-indexes` (indexes come from the migration).

Report printed by both: total rows, valid, rejected (by reason), flagged,
inserted, updated, unchanged, retired, duration, rows/s.

---

## G. Curriculum architecture

### G.1 What exists

`Course → CourseModule (ASSIGNMENT | PUZZLE, one item each) →
StudentModuleProgress`. Courses are admin-authored and **every PUBLISHED course
is visible to every student** (`CourseProgressService.listForStudent` has no
batch/enrolment filter). A puzzle module completes when the student has a SOLVED
attempt at that puzzle anywhere (self-healing on read). Puzzles reach a course
by the `AttachModuleModal` picker.

Homework is a different model (`Assignment` + `AssignmentBatch` per batch with a
due date) and is not puzzle rows.

### G.2 How imported puzzles become curriculum content (V1 — no schema change)

```
Admin/coach browses the catalogue (theme, rating window, opening, quality)
   → "Add to folder"  → materialises N puzzles into a PuzzleTopic folder
        → folder is usable immediately by: live class Ask / Load next,
          share dialog, course module picker (one puzzle per module)
```

That is a complete curation loop with zero new pedagogical tables. "Curriculum →
Module → Lesson → Puzzle Set → Puzzle" maps to **Course → CourseModule →
(folder)**; "Lesson" has no separate existence in the codebase and should not get
one until it has content of its own (text, video) — at which point it is a new
`CourseModuleContentType`, not a parallel hierarchy.

### G.3 Next step (Phase 6): set-level and training modules

Today one module = one puzzle, so a 20-puzzle lesson is 20 modules. Two additive
content types, in this order:

1. `PUZZLE_TOPIC` — module references a folder + `requiredSolved`; completes
   when that many puzzles in the folder are solved. Uses the existing
   self-healing completion read.
2. `PUZZLE_TRAINING` — module stores a spec `{ themes[], ratingOffset, count }`
   ("Solve 15 fork puzzles at your level"); the student's next puzzle comes from
   the recommender constrained to the spec; completion = `count` solved puzzles
   tagged with one of the themes since the module was opened. This is where the
   6M catalogue pays off for curriculum: no curation needed.

Both are `CourseModule` columns + enum values + a branch in
`CourseProgressService`. Do not build them before the training surface exists.

---

## H. Adaptive recommendation architecture

### H.0 Product decision required

`apps/web/src/app/student/puzzles/page.tsx`: *"Puzzles are classroom material:
students only get one when a coach shares it in class (or it is part of a
course), so there is no student library."* A `/student/training` page reverses
that stance. Options: (a) open self-training to all students, (b) per-batch
switch so coaches decide, (c) keep it coach-only — the recommender then powers
coach tools ("suggest 10 puzzles for this student") and `PUZZLE_TRAINING`
course modules only. The algorithm below is the same for all three.

### H.1 Inputs available today (no new tables)

| Input | Source |
|---|---|
| Student rating R, rated count | `student_progress` |
| Recent results (solved, wrongMoves, hintsUsed, durationSeconds, attemptNumber) | last 200 completed `puzzle_attempts` (new `(studentId, completedAt)` index) |
| Themes of those attempts | `puzzles.tags` via the attempt's puzzle |
| Rating of those puzzles | `puzzles.rating` / `puzzle_rating_changes.puzzleRating` |
| Seen set | `sourceId`s of every puzzle the student has attempted (hundreds to a few thousand ids) |

### H.2 V1 algorithm (deterministic, explainable)

Pure functions live in `packages/types/src/puzzle-training.ts` (same pattern as
`computePendingFeedback`: pure, unit-tested, shared with any preview UI); the
service only does I/O.

```
1. Target rating
   T = R + step, where over the student's last 10 rated training results:
     ≥ 8 clean solves → +75 ;  ≤ 4 clean solves → −75 ;  else 0
   (clean = solved, wrongMoves = 0, hintsUsed = 0). Clamp to catalogue range.

2. Theme slot — a fixed cycle indexed by the student's training-attempt count:
     [WEAK, WEAK, MIXED, WEAK, EXPLORE, WEAK, REVIEW, MIXED, WEAK, EXPLORE]
   WEAK    = motif theme with the lowest smoothed success
             (clean + 1) / (attempts + 2), among motifs with ≥ 5 attempts
             in the last 200 and minRating ≤ T
   EXPLORE = eligible motif with the fewest attempts (ties: catalogue order)
   MIXED   = no theme filter
   REVIEW  = a puzzle the student FAILED ≥ 3 days ago and never solved since
             (re-serve the same puzzles row — spaced repetition, no new query)
   Empty slot (e.g. no motif has 5 attempts yet) → fall back to EXPLORE, then MIXED.

3. Candidates (one indexed query, §K.3)
   band = T / 50 ; start = hash(studentId, attemptCount) as randKey
   SELECT … WHERE eligible AND ratingBand = band AND randKey >= start
         [AND themes @> ARRAY[theme]]  ORDER BY ratingBand, randKey LIMIT 30
   wrap to randKey >= 0 if short; then widen band ±1, ±2; then drop the theme.

4. Filter in Node: drop the seen set (30 rows vs a few thousand ids — not a
   million-row filter); take the first.

5. Materialise (upsert by (LICHESS, id)) and return
   { puzzleId, slot, theme, targetRating } — the UI shows "Practising: Forks · 1450".
```

Why this and not the brief's example list: it uses only signals the attempt
table already records; "clean" uses the server-counted `wrongMoves` (the client
cannot skip it); repetition control is the seen set + REVIEW slot rather than
time windows; every pick has a one-line reason a coach can read.

### H.3 Repetition rules (§17)

| Category | Rule |
|---|---|
| Never attempted | eligible for every slot |
| Recently solved | never re-served by the recommender (seen set) |
| Recently failed | excluded from new picks; returns via REVIEW after ≥ 3 days |
| Repeatedly failed (≥ 3 attempts) | dropped from REVIEW; its theme stays WEAK |
| Mastered theme (≥ 80% clean over ≥ 20) | not chosen as WEAK; still in MIXED |
| Weak theme | WEAK slots (6 of 10) |

At 6M rows this needs no extra index: the seen set is per student and small, and
candidate generation is an index range scan (**measured** below).

### H.4 Path to adaptive difficulty (later, by signal)

- **Per-puzzle rating recalibration**: once a materialised puzzle has ≥ 30
  NexaChess first attempts, update `puzzles.rating` with the same Elo maths in
  reverse (the student is the opponent). Never touch the catalogue's source
  rating.
- **`StudentThemeStat`** derived table: only when the 200-attempt read becomes
  measurably slow (signal: students with > 5k attempts, p95 > 100 ms).
- Glicko-2 for students: only if rating volatility becomes a complaint; Elo with
  provisional K is adequate at this scale.
- ML: not before there are hundreds of thousands of NexaChess attempts.

### H.5 Student history (§16) — can we answer it today?

| Question | Today | Gap |
|---|---|---|
| Seen / solved / attempts / last attempted | yes (`puzzle_attempts`) | — |
| Average solve time | yes, `durationSeconds` | client-reported; fine for trends, not for scoring |
| Hint dependency | partially | text-hint count is client-reported; server hint count is authoritative once the UI uses it (§J.3) |
| Wrong-move frequency | yes, server-counted | — |
| Themes causing mistakes / improving | only via `puzzles.tags` | works once Lichess themes are copied into `tags`; hand-authored puzzles have free tags |
| Difficulty progression | yes, `puzzle_rating_changes` | `puzzleRating` column becomes meaningful once it stores the real puzzle rating |

Raw attempt data stays in `puzzle_attempts`; per-theme statistics are derived on
read (§H.4 for when to persist them).

---

## I. API design

### I.1 Reuse unchanged

`GET /puzzles/mine/:id`, `POST /puzzles/:id/attempts`, `PUT …/attempts/:aid`,
`POST …/submit`, `POST …/hint`, `GET /progress/me`, `GET /progress/students/:id`,
all `/puzzles/topics*`, all live-class puzzle routes, all course routes.

### I.2 Change

| Route | Change |
|---|---|
| `GET /puzzles` (`puzzles.list`) | Fix the title sort (§J.1); add `source` filter (default: all; library shows a Source column/filter). |
| `POST …/attempts` response (`StartPuzzleAttemptResponse`) | add `setupMove: { uci, san, fenBefore } \| null` |
| `GET /progress/*` (`StudentProgressDto`) | add `themes: { theme, attempts, clean, rate }[]` (top N) — no new route |

### I.3 Add (in `API_ROUTES.puzzles`)

| Route | Role | Purpose |
|---|---|---|
| `GET /puzzles/catalog` → `catalog` | admin, coach | Browse: `themes[]`, `ratingMin/Max`, `opening`, `eligibleOnly`, keyset `after=<band>:<randKey>`, `pageSize ≤ 50`. **No total count**; returns `hasMore`. Rows include the post-setup FEN computed in Node for the 25–50 rows on the page. |
| `POST /puzzles/catalog/adopt` → `catalogAdopt` | admin, coach | `{ sourceIds[≤200], topicId, publish }` → materialise (existing `createOne` visibility rules: coach ⇒ PRIVATE). Per-item failures like `/puzzles/import`. |
| `POST /puzzles/training/next` → `trainingNext` | student (after §H.0) | `{ theme? }` → `{ puzzleId, slot, theme, targetRating }`. POST because it may create the `puzzles` row. Throttled like other student routes. |
| `GET /puzzles/daily` → `daily` | any | Phase 7 only (§24). |

Contract rules from CLAUDE.md apply: paths in `API_ROUTES` first, Zod schemas +
types in `packages/types/src/puzzle.ts`, token-string auth via
`puzzle-auth.helper.ts`, no guards.

---

## J. Frontend integration and required engine fixes

### J.1 `PuzzleService.list` title sort (fix regardless of Lichess)

Replace the load-all-then-`compareNatural` branch with a database-side natural
order: an ICU collation with numeric ordering
(`CREATE COLLATION … (provider = icu, locale = 'en-u-kn-true')`, `ORDER BY title
COLLATE …`) if the `postgres:15-alpine` image was built with ICU (check
`SELECT * FROM pg_collation WHERE collprovider = 'i' LIMIT 1` before choosing),
otherwise a `titleSortKey` column (digit runs zero-padded) maintained by
`createOne`/`update`/`duplicate`. Either keeps "Puzzle 2" before "Puzzle 10" and
lets `skip/take` page in the database.

### J.2 Accept any checkmate on the final ply

`AssignmentEvaluationService.matchedPrefix` (and therefore `solveLineFeedback`,
`evaluateSolveLine`, `solveLineHint`) plus the client mirror
`puzzleSolverEngine.applyStudentMove`: if index = last solution ply and the
student's move is legal and delivers checkmate, treat it as matching. **5.2% of
Lichess mate puzzles** have alternative mating moves (**measured**, 171 / 3,291);
it also fixes the same latent bug for hand-authored SOLVE_LINE assignments.

### J.3 Solver changes (no redesign)

| File | Change |
|---|---|
| `StudentPuzzleSolveClient.tsx` | When `hints.length === 0`, the hint button calls the server hint endpoint (level 1 → 2 → 3: piece, origin, move) and highlights squares; show `setupMove` as the last-move highlight before the first student move; "Next puzzle" button in training mode. |
| `usePuzzleAttempt.ts` | `requestHint(level)` → `requestPuzzleHint` (already in `puzzleApi.ts`); keep state local — nothing here needs Zustand. |
| `PracticeBoard` | unchanged (already takes `lastMove`). |
| `puzzleSolverEngine.ts` | alternative-mate rule (J.2). |
| `PuzzleLibraryClient.tsx` | Source column/filter; a "Lichess catalogue" tab rendered by a new `CatalogBrowser` component (`useInfiniteQuery` with the keyset cursor, theme multi-select, rating range, "Add to folder"). Keep it a sibling file — the client is already 525 lines (BACKLOG "god components"). |
| `app/student/training/page.tsx` + `StudentTrainingClient.tsx` | after §H.0: calls `trainingNext`, then renders the existing solve client for that id. |

State placement stays as the codebase has it: TanStack Query for catalogue
pages, training picks and progress (keys added to `lib/queryKeys.ts`
`puzzles.*`); React local state for the in-progress attempt (as
`usePuzzleAttempt` does today); no Zustand.

### J.4 Rating maths (`packages/types/src/progress.ts`)

- `nextPuzzleRating({ opponentRating, … })` takes a number; callers pass
  `puzzle.rating ?? PUZZLE_DIFFICULTY_RATINGS[difficulty]`.
  `PuzzleRatingChange.puzzleRating` already stores a number.
- `puzzleResultScore(solved, hintsUsed, wrongMoves)`: a solve after a wrong move
  scores 0 (decision needed: 0 = Lichess semantics; ½ = gentler). Today it scores
  1, which on Lichess-calibrated puzzles would inflate ratings, because a student
  can brute-force the line move by move.
- Scale: student ratings will converge onto the Lichess puzzle scale. Hand-authored
  puzzles (rating null) keep the bucket values, which sit roughly on the same
  scale. Recalibrate them later from attempts (§H.4) rather than guessing now.

### J.5 Live class

Unchanged. A coach adopts catalogue puzzles into a folder, then shares from that
folder exactly as today. Whether live-class attempts should be **rated** is an
existing question (they are today, including timed-out ones). Worth deciding
alongside J.4, not part of this work.

---

## K. Performance analysis

### K.1 Storage

| Item | Value |
|---|---|
| Compressed source | 307 MB (**measured**) |
| Uncompressed CSV | 1.14 GB, 6,157,341 rows (**measured**) |
| Prepared TSV | 1.31 GB (**measured**) |
| Catalogue heap | **1.63 GB**, 278 B/row (**measured**) |
| PK | 132 MB (**measured**) |
| `(eligible, ratingBand, randKey)` | ~130 MB (*estimate*: measured 87 MB as a partial index over 4.05M rows) |
| themes GIN | ~25–40 MB (measured 25 MB partial) |
| openingTags GIN | 9.6 MB (**measured**) |
| **Total catalogue** | **≈ 1.95–2.0 GB** |
| Materialised `puzzles` growth | ~2–4 KB/row with indexes; 50k touched puzzles ≈ 150 MB (*estimate*) |
| DB today → after | 19 MB → ~2 GB |
| WAL during load | ~2–3 GB written over the load, recycled under `max_wal_size 1GB` (*estimate*) |

### K.2 Import performance

| Step | Where | Time |
|---|---|---|
| Decompress | anywhere | 4 s (**measured**) |
| Validate (chess.js) | off-box | 970 rows/s/core → ~1.75 h on 1 core, < 30 min on an 8-core laptop with workers (**measured** rate) |
| Sort | off-box | minutes (GNU sort) |
| COPY to staging | prod | 50 s at 1 CPU (**measured**, logged table) |
| Promote into indexed table | prod | *estimate* 5–20 min in 60 chunks (index maintenance; the GIN pending list absorbs the array inserts) |
| Index builds (if built after) | prod | PK 58 s, others 10–16 s each at 1 CPU (**measured**) |
| VACUUM FREEZE ANALYZE | prod | ~1–2 min (*estimate*) |

### K.3 Query performance (**measured**, 6.15M rows, 1 CPU, band-sorted heap, mostly cold cache, 100–300 runs each)

| Query | p50 | p95 | p99 | max |
|---|---|---|---|---|
| PK lookup | 0.57 ms | 0.95 | 1.58 | 11.7 |
| Next: any theme, band walk | 0.92 | 2.37 | 3.70 | 5.9 |
| Next: `fork` (13%) | 1.63 | 4.53 | 6.02 | 8.1 |
| Next: `pin` (6%) | 1.64 | 4.89 | 5.88 | 8.7 |
| Next: `smotheredMate` (0.4%) | 9.59 | 31.3 | 55.6 | 77 |
| Next: `arabianMate` (0.1%) | 7.14 | 18.3 | 33.0 | 1,044 (first cold hit) |
| Browse: fork, 1200–1400, LIMIT 25 | 0.21 | 0.26 | 12.2 | 23.6 |
| Band walk excluding a 2,000-id seen set (SQL anti-join) | — | — | — | 146 ms ⇒ do this filter in Node on 30 candidates instead |
| `count(*)` fork 1200–1400 | **32 s** | | | lossy bitmap at `work_mem 4MB` → whole-heap read |
| `ORDER BY random() LIMIT 30` fork 1200–1400 | **32.6 s** | | | |
| `ORDER BY random() LIMIT 1` whole table | 1.95 s (warm) | | | |
| Rare theme **before** band-sorting the heap | 753 ms (cold) | | | 5,422 random heap pages |

Conclusions:
- **Random selection = a precomputed `randKey` + a band-walk index**, never
  `ORDER BY random()` (1,000–30,000× slower here).
- **No exact counts and no OFFSET paging on the catalogue.** Keyset cursors and
  `hasMore`.
- **Load the heap in `(ratingBand, randKey)` order.** It is a static table, so
  that locality is free and permanent.
- Prod's `work_mem 4MB` / `shared_buffers 128MB` are fine for these index-ordered
  queries. They are what makes any *unbounded* catalogue query pathological.
  Raising `shared_buffers` to ~1 GB and `work_mem` to 16 MB is a reasonable
  separate tuning change (`docker-compose.yml` `command: postgres -c …`); measure
  before and after rather than bundling it with this work.

### K.4 Targets (§32)

Set from the measurements, with headroom for the API's own work (auth lookup,
materialise upsert, history read):

| Operation | p50 | p95 | p99 |
|---|---|---|---|
| Catalogue SQL: band walk (common theme) | < 3 ms | < 10 ms | < 20 ms |
| Catalogue SQL: band walk (rare theme) | < 15 ms | < 50 ms | < 100 ms |
| `POST /puzzles/training/next` end to end | < 60 ms | < 150 ms | < 300 ms |
| `GET /puzzles/catalog` page | < 40 ms | < 100 ms | < 250 ms |
| `GET /puzzles` library page (after J.1) | < 50 ms | < 150 ms | < 300 ms |
| Puzzle lookup (`GET /puzzles/mine/:id`) | < 20 ms | < 50 ms | < 100 ms |
| Import: prod-side wall time | ≤ 30 min | | |
| API p95 during the load | ≤ +20% vs the same window without it | | |

---

## L. Production safety

| Risk to | Mitigation |
|---|---|
| CPU (2 vCPU shared with LiveKit, egress Chrome, Stockfish pool) | All chess.js validation runs **off-box**. Prod does only COPY + chunked INSERT (single backend, effectively one core). Chunks sleep between transactions. The script refuses to start, and pauses between chunks, while `classes.status = 'LIVE'` for any row. |
| Memory | psql streams; no Node process on prod. Postgres session sets `maintenance_work_mem = 256MB` for the VACUUM only. |
| `/dev/shm` 64 MB in `nexa_postgres` | `SET max_parallel_maintenance_workers = 0` and `VACUUM (…, PARALLEL 0)` in the load session — the sandbox hit `could not resize shared memory segment … No space left on device` with defaults. |
| Locks | Only `lichess_puzzles` and the staging table are written; no existing table is touched; no `ALTER` runs during the load (the table comes from a normal migration beforehand). |
| API connection pool | The loader uses its own psql session through `docker exec`, not the API's Prisma pool (5 connections). `max_connections 100` leaves plenty. |
| Disk | Preflight requires free space > 3× the TSV (~4 GB; 153 GB free today). |
| Migrations / deploy | The migration only creates an empty table + columns + indexes: instant, CI-safe (`prisma migrate diff` clean since no hand-written index). **The data load is never a migration.** CI and `deploy-production.sh` never see it. |
| Backup window | Not between 19:30 and 21:30 UTC (backup at 20:00 UTC). Suggested window: 21:30–23:30 UTC (03:00–05:00 IST). |
| LiveKit | Separate container, UDP media. Affected only through CPU, covered above. |
| Stockfish | Not used by the import or by imported puzzles. The in-API pool is untouched. |
| Autovacuum | Static table: one `VACUUM FREEZE` after load avoids a later anti-wraparound scan of 1.6 GB at a random time. Monthly refresh updates a few % of rows → autovacuum handles it. |
| Maintenance mode | Not needed. Nothing user-facing reads the catalogue until the code that does is deployed. |

---

## M. Testing strategy

Unit (Jest, co-located `*.spec.ts`):
- **prepare script** (pure core extracted into a module): good row; each reject
  reason (bad id, 10 columns, bad FEN, bad UCI token, illegal move, odd ply
  count, mate theme without mate, rating out of range); unknown theme flagged;
  `randKey` stable for the same id; band computation.
- **materialiser**: post-setup FEN equals chess.js after `Moves[0]`;
  `setupMoveUci`; solution SAN from `normalizeSolution`; difficulty/type/title
  derivation; second call returns the same row (P2002 race path);
  coach ⇒ PRIVATE, admin ⇒ GLOBAL.
- **evaluation**: alternative mate accepted on the last ply only, not mid-line;
  exact-prefix behaviour unchanged elsewhere; hint on an alternative-mate ply.
- **solver engine (web mirror)**: same cases, kept in step with the server.
- **progress maths**: numeric opponent rating; null rating falls back to the
  bucket; wrong-move solve score; provisional K.
- **recommender (pure)**: target-rating step up/down/hold; slot cycle; WEAK
  needs ≥ 5 attempts; EXPLORE fallback; REVIEW picks a ≥ 3-day-old failure and
  never a solved one; seen filtering; widening order.

Integration (real Postgres, `*.int-spec.ts`, `src/test/integration/db.ts`):
- `(source, sourceId)` uniqueness; NULL sourceIds don't collide; concurrent
  materialisation of the same id yields one row.
- Upsert `ON CONFLICT … WHERE changed` writes nothing for unchanged rows; retire
  marks absent ids ineligible.
- Band-walk query returns rows in `(ratingBand, randKey)` order and **uses the
  composite index** (assert on `EXPLAIN` — no Seq Scan) with Prisma-generated
  SQL, on a few thousand seeded rows.
- Theme filter via GIN (`themes @> {x}`) and `&&` for multi-theme specs.
- Loader resume: kill after N chunks, re-run, final row count and checksums
  equal a clean run.

Existing specs to update: `puzzle-attempt.service.spec.ts` (setupMove, rating
input), `progress-recorder.service.spec.ts`,
`assignment-evaluation.service.spec.ts`, `puzzle.service.spec.ts` (list order).

E2E (Playwright, opt-in like the others): solve an adopted Lichess puzzle
(setup-move highlight, opponent auto-reply, alternative mate, server hint);
training "next" loop (after §H.0).

Performance: a `scripts/engine-bench`-style script running §K.4's queries
against `vps_dev` after a load there; the bar is §K.4.

---

## N. Migration plan (phases)

| Phase | Content | Ships value alone? | Gate |
|---|---|---|---|
| **0** | Fixes independent of Lichess: J.1 list sort, J.2 alternative mate, J.3 server hints in the student solver | Yes | unit specs green |
| **1** | Schema: `PuzzleSource`, `puzzles.source/sourceId/rating/setupMoveUci`, `LichessPuzzle`, attempt index; Prisma getter; types | No (empty table) | CI incl. `migrate diff` |
| **2** | Prepare script + load script + backup exclusion + docs. Load into **`vps_dev`** first; run §K.4 benchmarks there | No | rejects < 0.1%; benchmarks within target |
| **3** | Rating maths J.4 (numeric opponent rating; wrong-move score decision) | Yes | §H.0 / J.4 decisions made |
| **4** | Catalogue browse + adopt (API + `CatalogBrowser`) | **Yes — coaches get 6M puzzles for class and courses** | e2e adopt → share in class |
| **5** | Production load (window per §L) | — | Phase 4 deployed; backup excludes the table |
| **6** | Recommender + `trainingNext` + student training page (if §H.0 = yes) + theme stats on progress | Yes | p95 targets met on prod data |
| **7** | `PUZZLE_TOPIC` / `PUZZLE_TRAINING` course modules; daily puzzle if wanted | Yes | |
| **8** | Monitoring: training-next latency, materialised row growth, catalogue refresh monthly (re-run both commands) | — | |

Phase 0 is worth doing now whatever happens with the rest.

---

## O. Risk register

| Risk | Sev | Likelihood | Mitigation |
|---|---|---|---|
| Lichess rows imported into `puzzles` by a future shortcut → library OOM | High | Med | This design; J.1 fix also removes the OOM path |
| Import competes with a live class for CPU | High | Low | off-box validation; LIVE-class guard; off-peak window |
| Backups grow 20–25× and slow / fill OCI | Med | High if not handled | `--exclude-table-data=lichess_puzzles`; restore runbook re-runs the loader |
| Student ratings inflate (wrong-move solves rated as clean) | Med | High | J.4 |
| Correct alternative mates rejected → student frustration | Med | Certain without J.2 (5.2% of mate puzzles) | J.2 |
| Rating scale mismatch between authored (bucket) and Lichess puzzles | Low | Med | Same rough scale; recalibrate from attempts (§H.4) |
| Hard-deleting materialised puzzles erases student history (`PuzzleAttempt` cascades) | High | Low | Never hard-delete; archive. Rollback never touches `puzzles` rows with attempts. |
| Lichess format/theme changes in a future dump | Low | Med | column-count + vocabulary checks; load refuses at > 0.1% rejects |
| Lichess removes a puzzle we materialised | Low | Med | Retire = `eligible = false` in the catalogue only; the `puzzles` row and history remain valid |
| Partial-index / generic-plan pitfall with Prisma | Med | Med if partial indexes are used | Non-partial composite with `eligible` leading (§E.2) |
| Coaches overwhelmed by catalogue size | Low | Med | Catalogue is a separate tab; library default unchanged |
| Product stance on student self-training unresolved | Med | — | §H.0 decision before Phase 6 |
| Recommender serves too-hard puzzles to young beginners | Med | Med | themes' `minRating`; −75 step after poor runs; catalogue has ample low-rated supply (p5 = 648) |

---

## P. File-level implementation plan

Paths verified in the repo; "new" marks files to create.

| File | Current responsibility | Proposed change | Reason | Depends on | Tests | Migration impact |
|---|---|---|---|---|---|---|
| `apps/api/src/puzzle/puzzle.service.ts` | Library CRUD, list, stats | Replace title-sort branch with DB-side natural order; `source` filter; summary gets `source`, `rating` | §C.4 #1, J.1 | — | `puzzle.service.spec.ts` | none / `titleSortKey` column if no ICU |
| `apps/api/src/assignment/assignment-evaluation.service.ts` | SOLVE_LINE engine | Alternative mate on final ply in `matchedPrefix` & users | J.2 | — | `assignment-evaluation.service.spec.ts` | none |
| `apps/web/src/features/puzzles/components/solver/puzzleSolverEngine.ts` | Client SOLVE_LINE mirror | Same rule | J.2 | — | (no web unit tests; e2e) | none |
| `apps/web/src/features/puzzles/components/StudentPuzzleSolveClient.tsx` | Student solve UI | Server hints when no text hints; setup-move highlight; training "Next" | J.3 | `usePuzzleAttempt` | e2e | none |
| `apps/web/src/features/puzzles/hooks/usePuzzleAttempt.ts` | Attempt state machine | `requestHint(level)`; expose `setupMove` | J.3 | `puzzleApi.requestPuzzleHint` | e2e | none |
| `apps/api/prisma/schema.prisma` | Schema | `PuzzleSource` enum; 4 `Puzzle` columns + unique; `LichessPuzzle`; attempt index | §E.2 | — | int-spec | **new migration** (additive, empty table) |
| `apps/api/prisma/migrations/<ts>_lichess_puzzle_catalogue/` (new) | — | generated by `db:migrate:dev` | rule 2 | schema | CI | additive |
| `apps/api/src/prisma/prisma.service.ts` | Model getters | `get lichessPuzzle()` | rule 1 | schema | `prisma.service.spec.ts` | — |
| `packages/types/src/puzzle.ts` | Puzzle contract | `PuzzleSource`; summary `source`/`rating`; `StartPuzzleAttemptResponse.setupMove`; catalogue query/row/adopt schemas; training-next schemas | §I | — | typecheck | — |
| `packages/types/src/lichess-themes.ts` (new) | — | 73 keys, labels, groups, `minRating`; `difficultyFromRating`, `puzzleTypeFromThemes` | §E.3 | — | unit | — |
| `packages/types/src/puzzle-training.ts` (new) | — | Pure recommender policy (§H.2) | §H | lichess-themes | unit | — |
| `packages/types/src/progress.ts` | Rating & streak maths | numeric opponent rating; wrong-move score | J.4 | decision | unit | — |
| `packages/types/src/api-endpoints.ts` | Route registry | `puzzles.catalog`, `catalogAdopt`, `trainingNext`, (later) `daily` | rule 3 | — | — | — |
| `packages/types/src/index.ts` | Barrel | export new modules | | | | |
| `apps/api/src/progress/progress-recorder.service.ts` | Writes rating/streak | input carries `rating`, `wrongMoves` | J.4 | progress.ts | `progress-recorder.service.spec.ts` | — |
| `apps/api/src/progress/progress.service.ts` | Progress DTO | `themes` stats from last 200 attempts | §H.5 | tags populated | spec (new) | — |
| `apps/api/src/puzzle/puzzle-attempt.service.ts` | Student attempts | pass `rating`/`wrongMoves` to recorder; return `setupMove` | J.3, J.4 | schema | `puzzle-attempt.service.spec.ts` | — |
| `apps/api/src/puzzle/puzzle-catalog.service.ts` (new) | — | browse (keyset), adopt, `materialise()` (shared with training) | §I.3 | schema, types | spec + int-spec | — |
| `apps/api/src/puzzle/puzzle-training.service.ts` (new) | — | gather inputs, run policy, band-walk query, materialise | §H | catalog service | spec + int-spec | — |
| `apps/api/src/puzzle/puzzle.controller.ts` | Puzzle routes | catalogue + training routes (token-string pattern). Register static paths before `:id` routes | §I.3 | services | controller spec | — |
| `apps/api/src/puzzle/puzzle.module.ts` | Module wiring | provide the two services | | | | |
| `apps/api/scripts/lichess-puzzles-prepare.cjs` (new) + pure core module (new) | — | Stage 1 | §F | chess.js (existing dep) | unit on core | — |
| `apps/api/package.json` | Scripts | `"puzzles:prepare"` | §F.5 | | | |
| `scripts/lichess-puzzles-load.sh` (new) | — | Stage 2 | §F | migration deployed | resume int test on `vps_dev` | data only |
| `scripts/backup_db.sh` | Nightly dump | `pg_dump --exclude-table-data=lichess_puzzles` | §L | | manual dump + restore check | — |
| `apps/web/src/features/puzzles/api/puzzleApi.ts` | API client | catalogue, adopt, training-next functions | §I | types | e2e | — |
| `apps/web/src/features/puzzles/hooks/usePuzzlesApi.ts` | Query hooks | `useCatalog` (infinite), `useAdoptPuzzles`, `useTrainingNext` | | | | |
| `apps/web/src/lib/queryKeys.ts` | Query keys | `puzzles.catalog(params)`, `puzzles.training` | | | | |
| `apps/web/src/features/puzzles/components/PuzzleLibraryClient.tsx` | Library table | Source column/filter; catalogue tab host | §J.3 | | e2e | — |
| `apps/web/src/features/puzzles/components/CatalogBrowser.tsx` (new) | — | catalogue tab UI (reuse `components/ui/*`, `SimpleTooltip`, `RowActions`) | | | `npm run shots` | — |
| `apps/web/src/app/student/training/page.tsx` + `features/puzzles/components/StudentTrainingClient.tsx` (new) | — | training surface | §H.0 | decision | e2e | — |
| `apps/web/src/components/layout/navItems.ts` | Nav | "Training" for students | §H.0 | | shots | — |
| `apps/api/src/course/*`, `packages/types/src/course.ts`, `features/courses/*` | Courses | Phase 7 content types | §G.3 | Phase 6 | specs | additive migration |
| `README.md` (Puzzle Library section), `CLAUDE.md` §3.7 Puzzle Library bullet + §8 debugging rows, `docs/DATABASE_RESTORE.md` (re-run loader after restore), `docs/BACKLOG.md` | Docs | describe catalogue, commands, backup exclusion | rule 6 | | | |

---

## Q. KEEP / IMPROVE / REFACTOR / REPLACE

| Component | Verdict | Note |
|---|---|---|
| `Puzzle` model | IMPROVE | +4 nullable/defaulted columns; no reshaping |
| `PuzzleTopic` folders | KEEP | They are the puzzle sets |
| `PuzzleAttempt` | KEEP (+1 index) | Already records everything the recommender needs |
| `PuzzleService.list` | REFACTOR | DB-side natural sort; required before any growth |
| `PuzzleService.stats` | KEEP | `puzzles` stays small |
| `PuzzleService.importMany` / `createOne` | KEEP | Adoption reuses `createOne` |
| `PuzzleAttemptService` | IMPROVE | `setupMove` out; rating inputs to recorder |
| `AssignmentEvaluationService` | IMPROVE | alternative final mate |
| `ProgressRecorderService` + `progress.ts` maths | IMPROVE | numeric puzzle rating; wrong-move scoring |
| `ProgressService` | IMPROVE | theme stats |
| `StudentProgress`, `PuzzleRatingChange` | KEEP | |
| `LiveClassPuzzleService` + live UI | KEEP | consumes adopted puzzles as-is |
| `Course` / `CourseModule` | KEEP now, IMPROVE in Phase 7 | additive content types |
| `StudentPuzzleSolveClient`, `usePuzzleAttempt`, `PracticeBoard`, `PuzzleSolver` | IMPROVE | hints, setup move, alt mate |
| `PuzzleLibraryClient` | IMPROVE | catalogue tab as a sibling component |
| `StockfishService` | KEEP | no puzzle role needed |
| Soft delete / Trash | KEEP | catalogue deliberately outside it |
| `Practice` / `StudentPractice` | KEEP (untouched) | legacy stub; do not build training on it |
| chess.js, Prisma, PostgreSQL, TanStack Query | KEEP | |
| Zustand | KEEP (not used for this) | attempt state is correctly local |

**Nothing is classified REPLACE.** No component has a problem that the
improvements above don't solve at lower cost.

---

## R. Scaling notes (§29)

PostgreSQL + these indexes is sufficient now and for the foreseeable next stage:
the hot queries are sub-10 ms index range scans on a 2 GB static table. Signals
that would justify something else:

| Signal | Then consider |
|---|---|
| Free-text search over the catalogue (by game, player, description) becomes a product requirement | Postgres `tsvector`/trigram first; a search engine only if that fails |
| Training-next p95 > 150 ms with the DB on dedicated hardware | `StudentThemeStat` derived table; precomputed per-band candidate lists |
| Tens of millions of attempts and analytics over them | a read replica or columnar export — not before |
| More than ~3 GB of catalogue sources competing for the box's page cache | move Postgres off the LiveKit box; that is a hosting decision, not a datastore change |

---

## S. Licensing / provenance (§25)

The dump is CC0: no attribution or share-alike obligations, and NexaChess may
modify and redistribute freely. (Contrast the piece sets, where CC BY-NC-SA sets
were deliberately excluded — see `apps/web/public/chess/pieces/LICENSES.md`.)
Keep `source`, `sourceId` and `gameUrl` for provenance and refresh diffs, not for
legal reasons. A courtesy "Puzzles from the Lichess open database" credit is
optional. `gameUrl` links to public Lichess games; showing it to coaches only
avoids sending minors to an external site.

## T. Daily puzzle (§24)

Lichess `DailyDate` covers 1,787 puzzles and describes Lichess's own history; it
is not a NexaChess feature and is not imported. If NexaChess wants a daily
puzzle: one row per date (`DailyPuzzle { date @db.Date @unique, puzzleId }`),
chosen deterministically by hashing the date into the band walk over eligible
puzzles with rating 1300–1800, popularity ≥ 90, nbPlays ≥ 1,000 and not
`oneMove`, then materialised, so everyone gets the same puzzle and a restart
doesn't change it. Build it only when the product asks for it.

## U. Stockfish boundaries (§22–23)

- Today: puzzles use no engine. Stockfish serves PLAY_VS_ENGINE assignments,
  simul engine moves and the coach analysis board, from an in-API pool.
- Imported puzzles need **no engine work**: Lichess already engine-verified the
  only-move property, and NexaChess verifies legality with chess.js (prepare +
  materialisation).
- Allowed later, on demand only: "analyse this position" after a solve (existing
  `/stockfish/analyze`), coach explanations, and verifying puzzles NexaChess
  *generates* itself.
- Never: batch analysis of the catalogue (~6M positions × even 200 ms ≈ 14 CPU-days).

---

## Appendix — how the measurements were taken

- Dump downloaded 2026-10-03 to the session scratchpad (not the repo); profiled
  with a streaming Python pass over all rows.
- chess.js 1.4.0 (the repo's hoisted copy) replay of the first 100k rows (and a
  10k sample for alternative mates), `nice -n 10`.
- Throwaway `postgres:15-alpine` container, `--cpus=1 --memory=1536m`, no
  published port, own data dir, Postgres defaults (matching prod). Full 6.15M
  load, then the band-sorted copy, then 100–300 randomised runs per query via a
  PL/pgSQL timing loop. The container and its data were deleted afterwards. The
  production `nexa_postgres` was only read (`SHOW`, `pg_database_size`, three
  `count(*)`s).

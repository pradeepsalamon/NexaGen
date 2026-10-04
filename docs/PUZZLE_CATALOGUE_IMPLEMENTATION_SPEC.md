# Lichess Puzzle Catalogue — Implementation Spec

Status: **v2 — final architecture.** §15 PRs 1–4 are built (fixes, schema +
contract, backup exclusion, prepare/load tooling); nothing is imported into any
database yet. v1 was reviewed externally; §0 records what changed and why.
[PUZZLE_CATALOGUE_ARCHITECTURE.md](PUZZLE_CATALOGUE_ARCHITECTURE.md) holds the
audit and its measurements. Each numbered section answers one review question.

Owner decisions. Each carries the recommendation this spec is built on:

| # | Decision | Recommendation (assumed below) |
|---|---|---|
| D0 | Can students self-train, given today's "puzzles are classroom material" stance? | **Yes, per-batch opt-in** (`Batch.puzzleTrainingEnabled`, off by default). §0.4 explains why it lives on `Batch`, not `Entitlement`. |
| D1 | Rated score of a solve that needed a wrong move | **0.** Lichess ratings assume a first-try solve; anything above 0 lets brute-forcing raise a rating. This is a behaviour change; see §9 for the safeguards. |
| D2 | Rated score of a clean solve that used hints | **½** (unchanged) |
| D3 | Are live-class attempts rated? | **Unchanged** (yes). Out of scope, flagged only. |

---

## 0. v2 amendments (external review outcome)

| # | Review point | Verdict | Change |
|---|---|---|---|
| 1 | Prepared artifact + manifest as the official recovery artifact | **Accepted** | New `LichessCatalogueRelease` table + immutable OCI objects named by checksum (§0.1, §13, §14) |
| 2 | Separate source quality from training eligibility | **Accepted, one column** | `eligible` → `passesQualityGate`, defined narrowly. No stored `trainingEligible`: per-student suitability is computed by the training policy and never belongs on a 6M-row source table (§1) |
| 3 | Materialisation ≠ adoption | **Accepted** | Made explicit; training cache hidden from library/pickers by folder, no new column (§0.2, §3) |
| 4 | D0 owner: entitlement vs batch | **Checked; batch kept** | No capability/entitlement system exists to reuse (§0.4) |
| 5 | Rating change needs caution | **Accepted** | Pure functions + table-driven tests first; history never recalculated; switch-over in its own PR (§9) |
| 6 | Isolate alternative-mate logic | **Accepted, narrowed** | Dedicated `isAcceptedMateAlternative`, only when the book line itself ends in mate (§8) |
| 7 | Content fingerprint | **Accepted, and upgraded from optional to required** | The 2026-10-02 dump has **29,942 duplicate puzzles** by `contentHash` (same post-setup position + solution line, different ids, measured by prepare; see §1 for why this is not the raw-CSV 21,809). `contentHash` on both tables; duplicates fail the quality gate; seen-set is by content (§0.3, §1, §7) |
| + | Don't send solutions from catalogue browse | **Accepted** | Browse DTO has no solution; separate staff-only preview endpoint (§11) |
| + | Resource gates over a load-time target | **Accepted** | Pause/abort on live class, host load, API latency; time is a guideline (§13, §16) |
| — | Review diagram shows Assignment consuming `Puzzle` | **Corrected** | Homework is a *copy* into the separate `Assignment` model, not a `Puzzle` reference (§11). Final diagram in §0.5 |

### 0.1 Catalogue release identity

A catalogue release is the prepared artifact, identified by
`preparedSha256` and described by an immutable manifest:

```json
{
  "formatVersion": 1,
  "lichessDumpDate": "2026-10-01",
  "sourceUrl": "https://database.lichess.org/lichess_db_puzzle.csv.zst",
  "sourceSha256": "…",
  "preparedSha256": "…",
  "preparedAt": "2026-10-04T10:12:00Z",
  "preparerGitSha": "…",
  "rows": { "total": 6157341, "valid": 6157341, "rejected": 0, "duplicates": 29942, "passesQualityGate": 4034433 },
  "rejectReasons": {}, "unknownThemes": []
}
```

- OCI: `lichess/<preparedSha256>/{catalogue.tsv.zst,manifest.json}`. Objects are
  write-once and never overwritten.
- Retention: the release that is currently loaded plus the one before it.
- The load records the release in the database (see `LichessCatalogueRelease`,
  §1). That table is small and **is** backed up, so a restored database states
  exactly which artifact to reload.

### 0.2 Materialisation is not adoption

| | Materialisation | Adoption |
|---|---|---|
| Who | training, or a coach sharing in class | admin only |
| Effect | creates the `Puzzle` copy if missing; folder = system "Lichess" folder | creates it if missing **and** places it in a curated folder |
| Implies editorial approval | **No** | Yes |
| Visible in library / share dialog / course picker | **No** — hidden by default (§3) | Yes |

Both go through the same `materialise()` function, so there is still one copy
per source puzzle. "Adopted" is derived (`topicId ≠ system folder`), not stored.

### 0.3 Content identity

`contentHash` = first 16 hex chars of `sha256(<placement> <side> <castling>
<en-passant> of the post-setup FEN + "|" + solution UCI joined by spaces)`. The
half-move and full-move counters are excluded, so a transposition-identical
puzzle matches. It is identity of *content*; `(source, sourceId)` stays
identity of *origin*. It is indexed but never unique: two authored puzzles may
legitimately share content.

### 0.4 Why D0 lives on `Batch`, not `Entitlement`

- `Entitlement` (payments) grants a `Plan` to a user and enrols them in a
  batch. It exists only for students who **bought** something; admin-enrolled
  students have none.
- `Plan.features` is display copy (bullet points on `/plans`). Nothing in the
  API reads it to gate access.
- There is no capability or feature-flag system to extend, and building one
  for a single switch is not justified.
- Per-batch educational policy already lives on `Batch`
  (`Batch.liveClassSettings`), so `Batch.puzzleTrainingEnabled` follows an
  existing pattern.
- Rule: a student may train while at least one of their **active** (not
  soft-deleted) batches has it on. Leaving the last such batch removes access;
  past training attempts stay as history.
- Revisit if paid tiers ever need to gate features. That would be a general
  capability model across features, not a training-specific one.

### 0.5 Final architecture

```
 Lichess CC0 dump ──PREPARE (off-box: validate, dedupe by contentHash, derive, sort)──►
   prepared TSV + manifest  ──►  OCI lichess/<preparedSha256>/  (immutable recovery artifact)
        │
      LOAD (prod: staging → band-by-band upsert → retire → VACUUM; pauses on live class/load)
        ▼
 ┌──────────────────────────────┐      ┌────────────────────────────┐
 │ lichess_puzzles (6.15M)      │      │ lichess_catalogue_releases │  (backed up)
 │ SOURCE DATA, not backed up   │      └────────────────────────────┘
 └──────┬──────────────┬────────┘
        │              │
   Catalogue browse   Training selection (band walk; seen-by-content filter)
   (staff, no solution)│
   Preview (staff,     │
    with solution)     │
        │              │
  adopt (admin)   materialise (training / in-class share)
        └──────┬───────┘
               ▼   one copy per (source, sourceId); frozen snapshot
 ┌──────────────────────────────┐        ┌────────────────────────────┐
 │ puzzles (Nexa-owned)          │        │ assignments (SOLVE_LINE)   │
 │ curated folder | system folder│        │ homework = a COPY made via │
 └──┬───────────┬───────────┬───┘        │ the preview endpoint       │
    │           │           │            └────────────┬───────────────┘
 course module  live class  training                  │ (not rated; existing model)
    └───────────┼───────────┘                         ▼
                ▼                              student_assignment_attempts
          puzzle_attempts (context DIRECT | LIVE_CLASS | TRAINING)
                │
     ┌──────────┼──────────────┐
     ▼          ▼              ▼
 rating (§9)  theme stats   seen set (by contentHash)
 (pure fns)   (derived on read) → training policy (WEAK/EXPLORE/MIXED/REVIEW)
```

---

## 1. Exact `LichessPuzzle` schema

```prisma
/// Raw Lichess puzzle dump (CC0, database.lichess.org). SOURCE DATA ONLY:
/// written exclusively by scripts/lichess-puzzles-load.sh, never by the API.
/// Not soft-deletable, not Trash-registered, no FK in or out, table data
/// excluded from backups (reproducible from the dump).
model LichessPuzzle {
  id              String    @id                 // Lichess PuzzleId, e.g. "0000D"
  fen             String                        // position BEFORE moves[0], as published
  moves           String                        // UCI, space separated, as published (2–34 plies)
  rating          Int       @db.SmallInt        // Lichess Glicko-2 puzzle rating (399–3323 today)
  ratingDeviation Int       @db.SmallInt
  popularity      Int       @db.SmallInt        // −100…100
  nbPlays         Int
  themes          String[]                      // Lichess theme keys
  openingTags     String[]  @default([])
  gameUrl         String
  ratingBand      Int       @db.SmallInt        // floor(rating / 50)
  randKey         Int                           // stable: first 31 bits of sha1(id)
  contentHash     String                        // §0.3, computed from the post-setup position
  /// Passes the catalogue INGESTION gate (source quality + not a duplicate +
  /// not retired). It says nothing about whether a puzzle suits any student —
  /// that is the training policy's job, computed per request.
  passesQualityGate Boolean
  retiredAt       DateTime?                     // set when a refresh no longer contains the id
  releaseId       String                        // LichessCatalogueRelease.id that last wrote the row (no FK)

  @@index([ratingBand, randKey, id], map: "lichess_puzzles_walk_idx")
  @@index([themes], type: Gin, map: "lichess_puzzles_themes_gin")
  @@index([openingTags], type: Gin, map: "lichess_puzzles_opening_gin")
  @@map("lichess_puzzles")
}
```

Derived columns, computed by the prepare script (never by the API):

- `ratingBand = floor(rating / 50)`
- `randKey = parseInt(sha1(id).slice(0, 8), 16) & 0x7fffffff`. This is
  deterministic, so a refresh keeps every row's key and a reload reproduces the
  same order.
- `passesQualityGate = ratingDeviation <= 90 && popularity >= 50 && nbPlays >= 100
  && isCanonicalForContentHash && retiredAt == null`.
  - Without the duplicate rule this is 4,052,640 rows today (measured). Slightly
    fewer once duplicates are removed.
  - `isCanonicalForContentHash`: among rows sharing a `contentHash`, only the
    one with the highest `nbPlays` (ties: smallest id) passes. The other 29,942
    (2026-10-02 dump) stay in the catalogue but are never auto-served.
  - Why 29,942 and not 21,809: `contentHash` is `puzzleContentHash` of the
    position *after* Lichess's setup move (`moves[0]`) plus the solution
    `moves[1..]`, which is what a student sees and what a materialised `puzzles`
    row hashes to. The earlier 21,809 was measured on the raw CSV (FEN's first
    four fields + the full `Moves` column, setup move included). On the same
    6,157,341-row dump that raw key gives exactly 21,809; the post-setup key
    merges a further 8,133 rows whose different setup moves reach the same
    position and line. Those are real duplicates for us, so 29,942 is correct.
    (The full raw FEN, move counters included, gives only 51.)

Not stored: `DailyDate` (1,787 rows, no consumer), and no validation-status
column (validation happens before a row exists). Rollback is a `TRUNCATE`
(§13). `releaseId` is provenance only.

```prisma
/// One loaded catalogue release (§0.1). Tiny, backed up: after a restore it
/// names the exact OCI artifact to reload. Also the load script's state.
model LichessCatalogueRelease {
  id                 String    @id            // preparedSha256
  formatVersion      Int
  lichessDumpDate    DateTime  @db.Date
  sourceSha256       String
  manifest           Json                     // the full manifest, verbatim
  validRows          Int
  qualityGateRows    Int
  loadStartedAt      DateTime  @default(now())
  loadCompletedAt    DateTime?                // null = load in progress or interrupted
  @@map("lichess_catalogue_releases")
}
```

`PrismaService` gets a `get lichessPuzzle()` getter (CLAUDE.md §7 rule 1).

### Changes to existing models

```prisma
enum PuzzleSource {
  NEXA      // authored in NexaChess (every existing row)
  LICHESS
}

enum PuzzleAttemptContext {
  DIRECT      // /student/puzzles/:id, course module
  LIVE_CLASS  // started from a live-class assignment (liveClassId set)
  TRAINING    // served by POST /puzzles/training/next
}

model Puzzle {
  // … existing fields unchanged …
  source       PuzzleSource @default(NEXA)
  sourceId     String?      // LichessPuzzle.id when source = LICHESS
  rating       Int?         // NexaChess difficulty rating; null ⇒ PUZZLE_DIFFICULTY_RATINGS[difficulty]
  setupMoveUci String?      // opponent move that produced `fen` (Lichess moves[0]); display only
  contentHash  String?      // §0.3; set by every write path that touches fen/solution

  @@unique([source, sourceId], map: "puzzles_source_sourceId_key")
  @@index([contentHash])
}
```

`contentHash` is computed by one shared function, `puzzleContentHash(fen,
solution)` in `packages/types`. It is called from `createOne`, `update` (when
`fen` or the solution changes), `duplicate` and `materialise`.

- The migration backfills the existing rows in SQL. An int-spec asserts the SQL
  and TypeScript hashes agree on a fixture set, so a drift is caught in CI.
- Consumers:
  - The seen-set check (§7).
  - "Same puzzle already in library" warnings on adopt and on PGN import
    (warning only, never a block).

```prisma

model PuzzleAttempt {
  // … existing fields unchanged …
  context PuzzleAttemptContext @default(DIRECT)

  @@index([studentId, completedAt])
}

model Batch {
  // … only if D0 = per-batch opt-in …
  puzzleTrainingEnabled Boolean @default(false)
}
```

The migration adds one hand-written data statement after the generated DDL:
`UPDATE "puzzle_attempts" SET "context" = 'LIVE_CLASS' WHERE "liveClassId" IS NOT NULL;`.
That doesn't affect CI's `migrate diff`, which compares schema only.

Every index is declared in `schema.prisma`; there are no hand-written or
partial indexes. A partial `WHERE "passesQualityGate"` index is avoided on purpose: Prisma
binds the predicate as a parameter, and under a generic plan Postgres cannot
prove the partial-index condition.

---

## 2. Relationship between `LichessPuzzle` and `Puzzle`

```
LichessPuzzle (id)  ◄ · · · · logical, no FK · · · ·  Puzzle (source = LICHESS, sourceId)
   0..1 Puzzle per LichessPuzzle                      1 LichessPuzzle per LICHESS Puzzle
```

- **No foreign key, either direction.** The catalogue must be truncatable and
  reloadable without touching a single `puzzles` row (the rollback in §13).
  A Prisma relation would add an FK, so the link is two plain columns joined
  by hand where needed. The only places that join are the seen-set query (§7)
  and catalogue browse ("already in library" badge).
- A `Puzzle` with `source = LICHESS` is fully self-contained. Attempts, ratings,
  courses, live class and the solver never read the catalogue.
- A catalogue row with no `Puzzle` is simply unused supply.
- A `Puzzle` whose catalogue row is gone (retired upstream, or the catalogue
  was truncated) keeps working unchanged.

---

## 3. Does adoption copy or reference? — **Copy (a frozen snapshot)**

Materialisation creates a `puzzles` row from the catalogue row with this exact
transform, `materialiseLichessPuzzle(row, placement)` in
`apps/api/src/puzzle/puzzle-catalog.service.ts`:

| `puzzles` column | Value |
|---|---|
| `fen` | `assertValidFen(fen)` → apply `moves[0]` with chess.js → `.fen()` |
| `setupMoveUci` | `moves[0]` |
| `solutionMovesJson` | `evaluation.normalizeSolution(fen, moves[1..])` (existing; validates and rebuilds SAN) |
| `rating` | `row.rating` |
| `difficulty` | `< 900` BEGINNER, `< 1150` EASY, `< 1450` INTERMEDIATE, `< 1750` ADVANCED, else EXPERT |
| `puzzleType` | first match: any `mate*` → CHECKMATE; `endgame` or `*Endgame` → ENDGAME; `opening` → OPENING; else TACTICAL |
| `tags` | `row.themes` |
| `title` | `"<label of primary motif> · <rating>"`, e.g. "Fork · 1450". Primary motif = highest-priority theme of group `motif`/`mate` in `LICHESS_THEMES`; fallback "Puzzle". |
| `description`, `explanation`, `estimatedSeconds`, `scoringJson` | null |
| `hintsJson` | `[]` |
| `status` / `publishedAt` | `PUBLISHED` / now |
| `visibility` | `GLOBAL` |
| `topicId` | the folder chosen by an admin, else the system folder (below) |
| `createdById` / `createdByRole` | adopting admin's id / `ADMIN`; null / `ADMIN` when materialised by a coach or by training |
| `source` / `sourceId` | `LICHESS` / `row.id` |

Why a copy: everything downstream keys on `puzzles.id`, and an issued puzzle
should not change under a student mid-history. A later Lichess re-rating does
**not** flow into `puzzles.rating`; that column is NexaChess-owned from the
moment of copy (same principle as invoice snapshots).

**Materialisation ≠ adoption (§0.2).** `PuzzleService.list` excludes puzzles
in the system folder **unless** the request's `topicId` is that folder. As a
result the default library, the in-class share dialog / Ask / Load next, and
the course `AttachModuleModal` never show the training cache. An admin can
still open the "Lichess" folder deliberately. `stats()` counts them separately
(`trainingCache`).

**System folder:** `PuzzleTopic` with slug `lichess`, name "Lichess", created
lazily on first use (the same lazy-seed pattern as `PuzzleScoringSettings`).
It's found by slug through `withDeleted`; if it was trashed, it's restored
rather than duplicated.

**Edit rules for a `LICHESS` puzzle** (`PuzzleService.update`):

- Admin may change title, description, explanation, hints, topic, difficulty,
  rating, tags and status.
- `fen` / `solutionMoves` changes are rejected with 400: "This puzzle comes
  from the Lichess catalogue — duplicate it to edit the position."
- `duplicate()` creates a `NEXA` row (`sourceId` null) and copies
  `setupMoveUci` and `rating`.
- `PuzzleSummary.createdByName` shows "Lichess" for `source = LICHESS`.

---

## 4. Deduplication and source identity

1. **Identity of a source puzzle** = `(source, sourceId)`, unique in `puzzles`
   (non-partial, so it spans soft-deleted rows).
2. **At most one `puzzles` row per Lichess puzzle, ever.** Every materialisation
   path calls one function:
   1. Look up with `prisma.withDeleted` by `(LICHESS, id)` (CLAUDE.md §3.4:
      uniqueness pre-checks use `withDeleted`).
   2. If found and live: return it (for admin adoption, apply the folder rule
      below).
   3. If found and soft-deleted: return `IN_TRASH`. Training skips it, and
      adoption reports "in Trash — restore it first".
   4. If not found: create it. On P2002 (a concurrent creator won), re-read and
      return that row.
3. **Admin adopts a puzzle that already exists:**
   - In the system folder → it is **moved** to the requested folder.
   - In another curated folder → not moved; the per-item result is
     `ALREADY_IN_FOLDER` with that folder's name.
   - `ARCHIVED` or `DRAFT` → reported as such; not republished silently.
4. **Coaches never create or move folder membership.** Topics are admin-only
   today (`assertAdmin` in `PuzzleTopicService`). Coach materialisation always
   lands in the system folder.
5. **Duplicates are new puzzles.** A `duplicate()` of a Lichess puzzle is a
   `NEXA` puzzle with its own rating history; it is intentionally not tracked
   as the same source puzzle.
6. **Within the catalogue:** the PK is the Lichess id. Prepare rejects
   in-file duplicates (none exist today). A refresh is an upsert on the id.
7. **Hard delete** (Trash purge after 30 days) removes the row and, through the
   existing `PuzzleAttempt` cascade, its attempts — existing behaviour for every
   puzzle. After purge the Lichess id can be materialised again as a fresh row.
   No new code path ever hard-deletes a `LICHESS` puzzle.

---

## 5. Exact indexes (6.15M rows)

### `lichess_puzzles`

| Index | Columns | Serves | Size |
|---|---|---|---|
| `lichess_puzzles_pkey` | `id` | lookup, upsert conflict target, seen-set join | 132 MB (measured) |
| `lichess_puzzles_walk_idx` | `(ratingBand, randKey, id)` btree | training walk, browse keyset, rating window | ~170–200 MB (*estimate*: measured 87 MB for `(band, randKey)` on 4.05M rows, plus the `id` column and all 6.15M rows) |
| `lichess_puzzles_themes_gin` | `themes` GIN | rare-theme filters (planner's choice) | ~40 MB (measured 25 MB partial) |
| `lichess_puzzles_opening_gin` | `openingTags` GIN | browse by opening | 9.6 MB (measured) |

`id` is in the walk index because `randKey` (31-bit hash) is not unique: about
8,800 expected colliding pairs across 6.15M rows. The keyset cursor therefore
needs `id` as a tiebreak to be a total order.

`passesQualityGate` is filtered on the heap rather than indexed. 66% of rows pass, so the
walk reads about 1.5 rows per kept row. The heap is loaded physically in
`(ratingBand, randKey)` order (§13), which the measured latencies depend on.

### Existing tables

| Index | Why |
|---|---|
| `puzzles_source_sourceId_key` unique `(source, sourceId)` | identity (§4) |
| `puzzle_attempts (studentId, completedAt)` | recent-performance reads (last 10 / last 200) |

Nothing else. The existing `puzzle_attempts_studentId_idx` already serves the
seen-set query.

---

## 6. Theme/rating filtering without `COUNT(*)` or `ORDER BY random()`

**Randomness = a precomputed key plus a random start point.** Every query walks
`lichess_puzzles_walk_idx` in order, starting at a chosen `randKey`. Because
`randKey` is a hash of the id, each starting point gives an unbiased slice of
the band.

**Training walk.** Two fixed statements, chosen in code. A single
`($theme IS NULL OR …)` statement would hide the theme from the planner.

```sql
-- with theme
SELECT id, rating, themes FROM lichess_puzzles
WHERE "ratingBand" = $1
  AND ("ratingBand", "randKey", id) > ($1, $2, $3)      -- $3 = '' on the first batch
  AND "passesQualityGate"
  AND themes @> ARRAY[$4]::text[]
ORDER BY "ratingBand", "randKey", id
LIMIT 30;

-- mixed (no theme): the same without the themes line
```

**Browse keyset** (coach/admin catalogue):

```sql
SELECT … FROM lichess_puzzles
WHERE "ratingBand" BETWEEN $lo/50 AND $hi/50
  AND rating BETWEEN $lo AND $hi                         -- trims the two edge bands
  AND ("ratingBand", "randKey", id) > ($cb, $ck, $cid)   -- cursor; first page = ($lo/50, $seed, '')
  [AND "passesQualityGate"]                              -- "include low-confidence" off by default
  [AND themes && $themes::text[]]                        -- any-of; @> for all-of
  [AND "openingTags" @> ARRAY[$opening]::text[]]
ORDER BY "ratingBand", "randKey", id
LIMIT $pageSize + 1;                                     -- the extra row ⇒ hasMore
```

- The first page uses a per-session random `$seed` (start `randKey`), so
  "shuffle" is just a new seed. A browse never wraps. The order reads as
  "roughly by rating, shuffled within each 50-point band", which is the useful
  order for picking puzzles.
- **No totals anywhere.** Responses carry `{ puzzles, nextCursor, hasMore }`.
  The UI says "Load more", never "of N". (A filtered `COUNT(*)` was measured
  at 32 s.)
- **Guard:** every catalogue query runs in a Prisma interactive transaction
  that first runs `SET LOCAL statement_timeout = '3s'`. A timeout returns
  `200 { puzzles: [], hasMore: false, timedOut: true }` and the UI says
  "narrow the filters". A very rare theme over a wide rating window is the
  only realistic way to hit it.
- Raw SQL via `$queryRaw` tagged templates, which are parameterised. Prisma's
  query builder cannot express the row-value cursor comparison. Results map
  through a typed row shape.

---

## 7. Avoiding puzzles a student has already seen

**Seen** = any attempt the student has ever started at the same *content*,
from any source, in any context and any status. Matching on content (not on
`sourceId`) means a NexaChess-authored copy of the same position also counts,
and so do the 29,942 Lichess duplicates. The duplicates are already outside the
quality gate; this is the backstop.

```sql
SELECT DISTINCT p."contentHash"
FROM puzzle_attempts a JOIN puzzles p ON p.id = a."puzzleId"
WHERE a."studentId" = $1 AND p."contentHash" IS NOT NULL;
```

Each walk returns `contentHash` with every candidate row, and the filter
compares hash to hash.

This is one indexed read per request, bounded by the student's own attempt
count: hundreds to a few thousand ids, about one per puzzle ever opened.

**Selection loop** (`PuzzleTrainingService.next`):

```
for band in [b, b+1, b-1, b+2, b-2]:                       # target band first
  cursor = (band, startKey(studentId, trainingCount), '')
  repeat up to 5 batches:
    rows = walk(band, cursor, theme)                       # §6, LIMIT 30
    if rows empty and cursor not wrapped: cursor = (band, 0, ''); wrapped; continue
    for row in rows (in order):
      if row.contentHash in seen: continue
      puzzle = materialise(row)                            # §4
      if puzzle is IN_TRASH / ARCHIVED / DRAFT: continue   # admin retired it
      return puzzle
    cursor = last(rows)
if theme was set: retry the whole loop with no theme (slot becomes MIXED)
else: 404 "No new puzzles at this level" (practically unreachable: ~65k quality-gate rows per band)
```

`startKey = first 31 bits of sha1(studentId + ':' + trainingCount)`. It is
deterministic per request and different every request, so students don't
converge on the same rows and a retried request (same count) repeats the same
pick.

Cost: usually one walk query (1–5 ms measured) plus the seen read. The filter
in Node runs over 30 candidates, never millions of rows. **Revisit threshold:**
if any student passes ~20,000 attempts, move the seen filter into SQL
(`NOT EXISTS` against a `(studentId, puzzleId)` index) and re-measure.

**REVIEW slot** (§12) deliberately re-serves an already-seen puzzle the student
failed. It reads `puzzle_attempts` directly and never goes through the walk.

---

## 8. Alternative correct moves

**Rule, not data: a legal move that delivers checkmate solves the puzzle, at
any ply.** This is Lichess's own rule ("any mate wins").

- **Representation:** nothing is stored. `SolutionMove[]` stays the canonical
  line. The attempt's `movesJson` records the move the student actually played;
  the evaluator decides equivalence.
- **Engine change — one isolated, auditable helper** in
  `assignment-evaluation.service.ts` (exported, unit-tested on its own):

  ```ts
  /** The ONLY place mate-equivalence is decided. */
  export function isAcceptedMateAlternative(
    startFen: string,
    solution: SolutionMove[],
    playedBefore: AttemptMove[],   // the matched prefix
    candidate: AttemptMove,
    studentColor: ChessColor
  ): boolean
  ```

  It returns true only when **all** of these hold:
  1. The position after `playedBefore` has `studentColor` to move. This is
     always the case at a student ply; asserted anyway.
  2. `candidate` is legal there.
  3. `candidate` delivers checkmate.
  4. **The book line itself ends in checkmate** (replay `solution` to the end,
     `isCheckmate()`). This makes it a mate puzzle; a coach's non-mate line is
     never reinterpreted.
  5. The candidate's ply index is a student ply of that line.

  `matchedPrefix` keeps its exact-UCI loop. Only at the first mismatch does it
  ask the helper; a true answer marks the line complete. The rule therefore
  cannot change any line that doesn't end in mate. That is narrower than
  Lichess (which accepts a mate anywhere), deliberately, because it is shared
  with assignments. The line-ends-in-mate replay is memoised per call.
  It then feeds through:
  - `solveLineFeedback` → `correct: true, lineComplete: true, opponentReply: null`
  - `evaluateSolveLine` → `solved: true`, `scorePercent: 100`; review row marks
    the move correct and shows the book move as `expectedMove`
  - `solveLineHint` → unchanged (a hint always points at the book line)
- **Client mirror:** the same five conditions are reimplemented in
  `puzzleSolverEngine.ts` (`isAcceptedMateAlternative`). A shared fixture list
  of (fen, line, candidate, expected) lives in `packages/types` and both the
  API spec and an e2e case run it, so the two cannot drift silently.
- **Scope:** shared with assignment `SOLVE_LINE`, but by condition 4 only for
  lines that end in mate.
- **Why it matters:** 5.2% of Lichess mate puzzles (171 / 3,291 sampled) have
  a second mating final move.
- **Non-mate alternatives are not accepted.** Lichess lines are only-moves by
  construction. A hand-authored puzzle that needs alternatives would add an
  optional `alternatives?: string[]` (UCI) to `SolutionMove`; not in this work.

---

## 9. Exact rating algorithm

Applies to every rated attempt, whatever its source:

```
Rated attempt   = the student's FIRST attempt at a puzzle to reach SOLVED or FAILED
                  (existing: unique (studentId, puzzleId) on puzzle_rating_changes)
opponent        = puzzle.rating ?? PUZZLE_DIFFICULTY_RATINGS[puzzle.difficulty]
hints           = attempt.hintsUsed (max of the server-counted and client-reported values)
wrong           = attempt.wrongMoves (server-counted in saveProgress)

score = 0    if not solved                    (incl. "Give up", time-out, skipped training puzzle)
      = 0    if solved and wrong > 0          ← D1 (today: counts as a clean solve)
      = 0.5  if solved and wrong = 0 and hints > 0     ← D2 (unchanged)
      = 1    if solved and wrong = 0 and hints = 0

expected = 1 / (1 + 10^((opponent − rating) / 400))
K        = 40 if ratedPuzzles < 20 else 20
rating'  = max(100, round(rating + K × (score − expected)))
```

Worked example: a student rated 1200 (30 rated) solving a 1450 puzzle.

| Outcome | score | Δ |
|---|---|---|
| Clean | 1 | +16 |
| With hints | ½ | +6 |
| After a wrong move | 0 | −4 |
| Failed | 0 | −4 |

Unchanged from today: the provisional K, the 100 floor, the peak tracking, the
streak, and the rule that only the first finished attempt is rated.

Changes:
- `nextPuzzleRating({ rating, ratedPuzzles, opponentRating, score })` and
  `puzzleResultScore(solved, hintsUsed, wrongMoves)` in
  `packages/types/src/progress.ts`.
- `PuzzleResultInput` gains `rating: number | null` and `wrongMoves`.
- `PuzzleRatingChange.puzzleRating` now records the real opponent rating.

Puzzle ratings are **not** updated from NexaChess attempts in V1. Recalibration
(≥ 30 first attempts) is a later phase and only ever touches `puzzles.rating`.

**Safeguards for the D1 behaviour change:**
1. **Pure functions first, in their own PR (PR 5a):** `puzzleResultScore` and
   `nextPuzzleRating` with a table-driven spec covering every row of the
   outcome table above, both K values, the 100 floor, a null rating falling
   back to the bucket, and large rating gaps. Nothing calls the new signatures
   yet.
2. **Switch-over in a separate PR (PR 5b):** `ProgressRecorderService` passes
   `rating` and `wrongMoves`. The PR description states the D1 decision and
   its date.
3. **History is never recalculated.** No migration, script or job rewrites
   `puzzle_rating_changes` or `student_progress`. Ratings move forward from
   the switch-over only. The progress chart may show a slope change at that
   date; that is expected and is noted in the release notes for coaches.
4. **Pre-switch measurement:** run both scoring functions side by side over
   the existing `vps_dev` attempts (read-only script) and record the
   distribution of rating deltas in the PR. With 110 production attempts the
   impact is small now; the point is to record it.

---

## 10. Hints for imported puzzles

Imported puzzles have no text hints (`hintsJson = []`). They use the
**server-side progressive hint that already exists**:
`POST /puzzles/:id/attempts/:attemptId/hint` →
`AssignmentEvaluationService.solveLineHint`.

| Press | Level | Server returns | UI shows |
|---|---|---|---|
| 1st | 1 | `pieceType` | "Move a knight" plus a highlight on the piece of that type on the solution's from-square (the client knows the square only from level 2, so level 1 is text only) |
| 2nd | 2 | `fromSquare` | that square highlighted |
| 3rd | 3 | `uci`, `san` | arrow from → to |

- **Counting:** the server increments `hintsUsed` on each call while the
  student is on track and the line is incomplete (existing behaviour). For
  rating only `> 0` matters (§9). The client no longer has to report hints for
  these puzzles.
- **Which hint system shows:** a puzzle with text hints keeps today's text-hint
  button; a puzzle without them gets the progressive button. They are never
  shown together.
- **Engine:** none. The hint is read from the stored line.
- **After completion:** the solver shows the puzzle's motifs from `tags` via
  `LICHESS_THEMES` labels ("Motifs: Fork, Discovered attack") in place of the
  missing explanation. An admin may still add text hints and an explanation to
  an adopted puzzle.
- **Files:** `usePuzzleAttempt.ts` gets
  `requestHint()` → `requestPuzzleHint(puzzleId, attemptId, { moves, level })`
  and keeps the current level in local state. `StudentPuzzleSolveClient.tsx`
  renders the button and the highlight/arrow through `PracticeBoard`.
  `PracticeBoard` needs arrow/highlight props if it lacks them — check at
  implementation, since chessground supports `drawable.autoShapes`.

---

## 11. Coach catalogue → adoption → course/assignment flow

### Endpoints

| Route (`API_ROUTES.puzzles.*`) | Role | Body / query | Result |
|---|---|---|---|
| `GET /puzzles/catalog` → `catalog` | admin, coach | `ratingMin`, `ratingMax`, `themes[]`, `themeMode=any\|all`, `opening`, `includeBelowGate` (admin only), `seed`, `cursor`, `pageSize ≤ 50` | **`CatalogPuzzleSummary`**: `sourceId`, source `fen`, `setupMove` (uci + san), `postSetupFen`, `sideToMove`, `rating`, `themes`, `openingTags`, `popularity`, `nbPlays`, `inLibrary: { puzzleId, topicName, adopted } \| null`; page: `nextCursor`, `hasMore`, `timedOut`. **No solution moves.** |
| `GET /puzzles/catalog/:sourceId/preview` → `catalogPreview` | admin, coach | — | browse fields **plus** `setupMove`, `solutionMoves` (`[{uci,san}]`), `gameUrl`. The **only** catalogue route that returns a solution |
| `POST /puzzles/catalog/materialise` → `catalogMaterialise` | admin, coach | `{ sourceId }` | `{ puzzleId }` (system folder unless it already exists) |
| `POST /puzzles/catalog/adopt` → `catalogAdopt` | **admin** | `{ sourceIds[≤200], topicId }` | `{ adopted, moved, results: [{ sourceId, puzzleId?, outcome: CREATED\|MOVED\|ALREADY_IN_FOLDER\|IN_TRASH\|NOT_PUBLISHED\|NOT_FOUND\|INVALID }] }` |

Register the static `/puzzles/catalog*` routes before `/puzzles/:id` in
`puzzle.controller.ts`.

**DTO rule.** There are two types in `packages/types`:
`CatalogPuzzleSummary` (no solution) and `CatalogPuzzlePreview extends
CatalogPuzzleSummary` (+ `solutionMoves`, `gameUrl`). Only the preview service
method builds the second, and it runs `assertStaffOrCoach`. No catalogue route
is reachable by a student. Students see a solution only through the existing
attempt flow (after they solve, or on submit), unchanged. The browse
thumbnails don't need the line, and "Create homework" fetches the preview on
click.

### Flows

```
ADMIN curation
  Library → "Lichess catalogue" tab (CatalogBrowser)
    filter → select → "Add to folder <Fork Fundamentals>" → catalogAdopt
    → puzzles appear in that folder (PUBLISHED, GLOBAL)
       ├─ Course: Courses → module → AttachModuleModal (existing picker) → PUZZLE module
       ├─ Live class: share dialog / Ask / Load next walk the folder (existing)
       └─ Student: reachable through course or class (existing)

COACH in class
  PuzzleAssignModal → new "Catalogue" tab (same CatalogBrowser, compact)
    → "Share" → catalogMaterialise → existing liveClass.puzzle assign with that puzzleId

COACH homework
  CatalogBrowser row → "Create homework"
    → AssignmentFormDialog opened with:
        initialActivityType = SOLVE_LINE           (existing prop)
        initialFen          = post-setup FEN       (existing prop)
        initialSolutionMoves = preview.solutionMoves (NEW prop; fetched from catalogPreview on click)
        studentColor        = side to move
    → saved as an ordinary Assignment (a copy; no link to the catalogue or to puzzles)
    → DeployAssignmentDialog to a batch (existing)
```

- Assignments copy because `Assignment` is a separate content model
  (`startFen` + `solutionMovesJson`, ≤ 80 moves; Lichess lines are ≤ 33).
  Homework attempts are not puzzle attempts and are not rated, which is
  existing behaviour.
- Known gap: an assignment has no setup-move field, so homework shows a cold
  position. Acceptable for V1. Adding `setupMoveUci` to `Assignment` is a
  separate small change if coaches ask.
- Coaches cannot add to folders (topics are admin-only today) and cannot
  create `GLOBAL` puzzles. Materialised Lichess puzzles are `GLOBAL` but
  admin-owned and in the system folder, so neither existing rule is bent.

---

## 12. Student training architecture (built only after D0)

```
/student/training  (app/student/training/page.tsx — server component, cookie check)
  └ StudentTrainingClient (features/puzzles/components/)
      │ POST API_ROUTES.puzzles.trainingNext  { theme?: string }
      ▼
  PuzzleTrainingService.next(token, dto)
      1. assertStudent; gate: D0 (any of the student's batches has puzzleTrainingEnabled)
      2. close the student's open TRAINING attempt, if any:
           - started < 30 s ago with no moves → return it unchanged (double-click guard)
           - otherwise → submit internally as FAILED (rated 0 if first; "Skip counts as a miss")
      3. inputs (one round trip each):
           student_progress row; last 200 completed attempts (+ puzzles.tags, wrongMoves, hintsUsed, context)
      4. policy (pure, packages/types/src/puzzle-training.ts):
           target T, slot (WEAK|EXPLORE|MIXED|REVIEW), theme
      5. REVIEW → pick the oldest FAILED-never-solved puzzle, failed ≥ 3 days ago, < 3 tries
         else    → §7 selection loop
      6. create PuzzleAttempt { context: TRAINING, attemptNumber = count+1 }
      7. return { puzzleId, attemptId, slot, theme, themeLabel, targetRating }
      │
  StudentTrainingClient renders the existing StudentPuzzleSolveClient(puzzleId) in training mode:
      usePuzzleAttempt.start → PuzzleAttemptService.start resumes that IN_PROGRESS attempt
      (its resumable filter already matches: puzzleId, studentId, IN_PROGRESS, liveClassId null)
      solve / hint / submit → existing routes → rating + streak (§9)
      "Next puzzle" → trainingNext again
```

### Policy (pure, deterministic)

- **Target rating:** over the last 10 TRAINING results, `clean` = solved with
  wrong = 0 and hints = 0. ≥ 8 clean → T = R + 75; ≤ 4 clean → T = R − 75;
  else T = R. Clamp to [400, 2800].
- **Slot cycle**, indexed by `trainingCount mod 10`:
  `[WEAK, WEAK, MIXED, WEAK, EXPLORE, WEAK, REVIEW, MIXED, WEAK, EXPLORE]`
- **WEAK:** among motif/mate themes with `minRating ≤ T` and ≥ 5 attempts in
  the last 200, the lowest `(clean + 1) / (attempts + 2)`. Ties go to the theme
  attempted least recently.
- **EXPLORE:** the motif theme with the fewest attempts in the last
  200. Ties go to `LICHESS_THEMES` order.
- **Empty slot fallback:** WEAK → EXPLORE → MIXED. REVIEW with nothing due →
  WEAK.
- `trainingCount` = the number of TRAINING attempts the student has. It sets
  the slot and the start key.

### State

TanStack Query for `trainingNext` (a mutation) and progress. Local React state
inside `usePuzzleAttempt` for the attempt. No Zustand, no new store.

### Coach visibility

`StudentProgressDto.themes` (top weak/strong themes) on the existing progress
dialog. No new route.

### Not in V1

- `StudentThemeStat` table (revisit at p95 > 100 ms for the stats read).
- Puzzle re-rating.
- Spaced-repetition schedules beyond REVIEW.
- Per-student theme picker (the optional `theme` param exists for a "Practise
  forks" button but has no UI in V1).

---

## 13. Import: resume, retry, rollback

### Stage 1 — prepare (off the production box)

`npm run puzzles:prepare -w apps/api -- --in <dump.csv.zst> --out <dir>`
(`apps/api/scripts/lichess-puzzles-prepare.cjs` + a pure core module for unit
tests).

- **Pipeline:** `zstd -dc` → line split, asserting 11 columns → validate (audit
  §F.3) with the repo's chess.js, in N worker threads → derive `ratingBand`,
  `randKey`, post-setup FEN → `contentHash`, then a second pass marks the
  canonical row per `contentHash` → `passesQualityGate` → TSV → GNU `sort` by `(ratingBand, randKey, id)` →
  `zstd`.
- **Outputs** (as built in PR 4), laid out exactly as stored in OCI:
  - `<out>/<preparedSha256>/catalogue.tsv.zst`
  - `<out>/<preparedSha256>/rejects.tsv`
  - `<out>/<preparedSha256>/manifest.json`: the §0.1 fields plus `columns`,
    `files` (compressed size + sha256, uncompressed bytes), `qualityGate`,
    `unknownThemes`, `flagged`, `ratingBands`
  - `preparedSha256` = sha256 of the **uncompressed** sorted TSV, so it does
    not depend on the zstd version. The core is
    `apps/api/src/puzzle/catalogue/lichess-prepare.core.ts` (TS, unit-tested);
    the script loads it from the API build, so the content hash is the API's
    own `puzzleContentHash`.
  - The TSV carries neither `retiredAt` nor `releaseId`: the load fills
    `releaseId` (the release id is only known once the file is hashed).
- **Resume/retry:** none needed. It is a pure function of the input file;
  re-run it (~1.75 h on 1 core, faster with workers).
- **Exit non-zero** if rejects exceed 0.1% of rows.

### Stage 2 — load (production box)

`scripts/lichess-puzzles-load.sh <manifest.json>` (bash + psql through
`docker exec -i nexa_postgres`; no new npm dependencies).

| Step | Action | Idempotent / resume behaviour |
|---|---|---|
| 0 | `flock` on `/var/lock/nexa-lichess-load.lock` | a second run exits immediately |
| 1 | preflight: artifact fetched from `lichess/<preparedSha256>/` and its sha256 matches; manifest `formatVersion` supported; migration present; free disk > 3× TSV; not 19:30–21:30 UTC (backup); resource gate green (below); then `INSERT INTO lichess_catalogue_releases (id, …) ON CONFLICT (id) DO NOTHING` | refuses with a reason; nothing changed. Re-running the same release reuses its row |
| 2 | session settings: `synchronous_commit=off`, `max_parallel_maintenance_workers=0`, `maintenance_work_mem=256MB`, `statement_timeout=0`, `lock_timeout=5s` | per session |
| 3 | `DROP TABLE IF EXISTS lichess_puzzles_staging; CREATE UNLOGGED TABLE … (LIKE lichess_puzzles)`; `\copy` from the decompressed stream; `CREATE INDEX` on staging `(id)` and `("ratingBand")` | always rebuilt from scratch (~2 min) — re-running is the resume |
| 4 | for each band in ascending order: `INSERT INTO lichess_puzzles SELECT … FROM staging WHERE "ratingBand" = $b ORDER BY "randKey", id ON CONFLICT (id) DO UPDATE SET <all columns> WHERE (<every column but id, releaseId>) IS DISTINCT FROM (EXCLUDED.…)` — `releaseId` is left out of the comparison, otherwise every new release would rewrite all 6M rows; it therefore names the release that last *changed* a row; commit; re-check LIVE classes (pause and poll every 60 s while any); sleep 2 s | each band is its own transaction. A re-run re-executes every band; finished bands write zero rows (the `IS DISTINCT FROM` guard), so resume needs no ledger |
| 5 | retire: `UPDATE lichess_puzzles c SET "retiredAt" = now(), "passesQualityGate" = false WHERE c."retiredAt" IS NULL AND NOT EXISTS (SELECT 1 FROM staging s WHERE s.id = c.id)` | idempotent. A reappearing id is un-retired by step 4 (`retiredAt` NULL and a recomputed `passesQualityGate` come from staging) |
| 6 | `VACUUM (FREEZE, ANALYZE, PARALLEL 0) lichess_puzzles` | safe to repeat |
| 7 | `UPDATE lichess_catalogue_releases SET "loadCompletedAt" = now() WHERE id = $release`; `DROP TABLE lichess_puzzles_staging`; print a report (inserted / updated / unchanged / retired, duration, rows/s) and append it to `lichess-load.log` | — |

### Resource gate (checked in preflight and before every band)

| Signal | Source | Green | Action if not green |
|---|---|---|---|
| Live class | `SELECT count(*) FROM classes WHERE status = 'LIVE'` | 0 | pause, re-check every 60 s |
| Host CPU | 1-min load average (`/proc/loadavg`) | < 1.5 on this 2-vCPU box | pause until < 1.2 |
| API latency | `curl -w '%{time_total}' localhost:3001/health/ready`, 5 samples | median < 2× the preflight baseline | pause; abort after 15 min |
| Stockfish / API memory | `docker stats nexa_api` | < 80% of host memory | pause |
| Disk | `df` on the Docker data volume | free > 2× the remaining TSV | abort |

Wall time is a guideline (≈ 15–30 min), not a pass condition. The pass
conditions are "no gate tripped for longer than its limit" and the §16 impact
metrics. Every pause is logged with its reason in the run report.

### Failures

| Failure | Effect | Recovery |
|---|---|---|
| Process killed / SSH drop / host reboot mid-step 4 | bands committed so far are in; the in-flight band is rolled back; staging (UNLOGGED) may be empty after a crash | re-run the script |
| DB connection lost | same as above | re-run |
| Disk fills | the band transaction fails and rolls back; preflight should have prevented this | free space, re-run |
| Live class starts mid-load | script pauses between bands | continues automatically |
| Bad dump (format change) | prepare exits non-zero; nothing reaches prod | fix the parser / theme catalogue |

### Rollback, from least to most drastic

1. **Stop a load:** kill the script, then `DROP TABLE lichess_puzzles_staging`.
   Rows already promoted are harmless: nothing reads the catalogue except the
   Phase 4 code.
2. **Remove all catalogue data:** `TRUNCATE lichess_puzzles` (instant; takes a
   brief exclusive lock on that table only). No `puzzles` row, attempt or
   rating is affected (§2).
3. **Withdraw the feature:** revert or hide the catalogue/training UI and
   routes. Optionally archive (`status = ARCHIVED`, the existing bulk action)
   the `LICHESS` puzzles that have no attempts. **Never hard-delete** a
   `LICHESS` puzzle with attempts: the cascade erases student history.
4. **Remove the schema:** a new forward migration dropping the table and
   columns (Prisma has no down migrations). Only after step 3.

---

## 14. Production backup policy

- **`scripts/backup_db.sh`:** the dump line becomes
  `pg_dump -U "$DB_USER" --exclude-table-data=lichess_puzzles "$DB_NAME"`.
  - The table definition is still dumped; only the rows are skipped.
  - Applied to `nexa_chess`. `vps_dev` has no backup job today; the same rule
    applies if one is added.
  - Also applied to the API's own dumps in `apps/api/src/backup/backup.service.ts`
    (admin "Backup now" and the pre-restore safety dump), and to the load's
    `lichess_puzzles_staging` table. *(Done in PR 3; verified on a scratch
    Postgres 15: the dump succeeds while the tables don't exist yet, and a
    restore gives the table with 0 rows beside intact releases/puzzles.)*
  - Effect: nightly dumps stay at today's size plus materialised puzzles,
    instead of about 400–500 MB gzipped per night × 14 retained (*estimate*).
- **What stays backed up:** everything NexaChess-owned, including every
  materialised `puzzles` row, all attempts, rating changes and progress. A
  restore never loses student history, because no backed-up row references
  the catalogue by FK.
- **Official recovery artifact (§0.1):**
  `lichess/<preparedSha256>/{catalogue.tsv.zst, manifest.json}` in the existing
  OCI bucket, write-once. Retention: the release recorded as loaded in
  `lichess_catalogue_releases` plus the previous one. A release is never
  deleted while it is the loaded one.
  - Recovery doesn't depend on Lichess being reachable or on its dump
    staying the same.
  - Stage 1 never has to be repeated for a restore.
- **Restore runbook** (`docs/DATABASE_RESTORE.md`, new section):
  1. Restore the dump as today.
  2. `SELECT id FROM lichess_catalogue_releases WHERE "loadCompletedAt" IS NOT NULL ORDER BY "loadCompletedAt" DESC LIMIT 1`
     — the restored DB names its own artifact; fetch `lichess/<id>/`.
  3. Run `scripts/lichess-puzzles-load.sh <manifest>` (about 15–30 min).
  - Until step 3 finishes: the catalogue tab is empty, training falls back to
    REVIEW / 404, and every existing puzzle, course and class works.
- **Verification before Phase 5:** restore one excluded-data dump into a
  scratch database and confirm the table exists and is empty and the load
  repopulates it.

---

## 15. Migration and deployment order

Each step is a separate PR into `dev` (merge only on explicit human approval,
CLAUDE.md §7b). Each is backward compatible with the one before, and each is
deployable alone.

| # | PR | Migration | Deploy notes | Revert |
|---|---|---|---|---|
| 1 | **Fixes:** list title sort in the DB (ICU collation if the image has it, else a `titleSortKey` column); any-mate rule (server + client); server progressive hints in the student solver | only if `titleSortKey` is needed (additive) | normal | revert PR |
| 2 | **Schema + contract:** enums, `LichessPuzzle`, `LichessCatalogueRelease`, `puzzles` columns (`source`, `sourceId`, `rating`, `setupMoveUci`, `contentHash`) + unique + index, `contentHash` SQL backfill + parity int-spec, `PuzzleAttempt.context` + backfill + index, `Batch.puzzleTrainingEnabled`; Prisma getters; types incl. `puzzleContentHash`, `LICHESS_THEMES`, catalogue DTOs | additive; instant (`puzzles` 29 rows, `puzzle_attempts` 110) | `prisma migrate deploy` runs in `deploy-production.sh` before the API swap | forward migration |
| 3 | **Backup exclusion** in `backup_db.sh` + restore runbook | — | host script, effective at the next 20:00 UTC run. **Must be live before step 7** | revert |
| 4 | **Tooling:** prepare + load scripts, `puzzles:prepare` npm script, README section | — | none (not part of the app build) | revert |
| 5a | **Rating maths, pure functions only** (§9 safeguard 1) | — | no behaviour change | revert |
| 5b | **Rating switch-over** (recorder passes rating + wrongMoves; D1 in the PR description) | — | affects only new rated attempts; history untouched | revert (rows written in between stay as recorded) |
| 6 | **Catalogue API + UI:** browse (no solution) / preview (staff, with solution) / materialise / adopt; system folder hidden from list by default; duplicate-content warnings; `CatalogBrowser` in the library and `PuzzleAssignModal`; "Create homework" prefill; edit rules for `LICHESS` rows; "Lichess" author label | — | safe on an empty catalogue (empty results) | revert; any materialised puzzles remain ordinary puzzles |
| — | **Load into `vps_dev`**; run the §16 benchmarks; e2e there | — | ops | `TRUNCATE` |
| 7 | **Production load** (ops, not a deploy): window 21:30–23:30 UTC, after confirming step 3 ran | — | `scripts/lichess-puzzles-load.sh` | §13 rollback |
| 8 | **Training** (after D0): service, policy, `/student/training`, nav, progress theme stats | none, or the D0 column if not added in step 2 | normal | revert; TRAINING attempts remain valid history |
| 9 | Course `PUZZLE_TOPIC` / `PUZZLE_TRAINING` modules; daily puzzle | additive | later | — |

Each PR updates its docs (README, CLAUDE.md §3.7 / §8, BACKLOG) in the same
change (CLAUDE.md §7 rule 6).

---

## 16. Benchmarks and acceptance criteria

Measured on `vps_dev` after a full load (same host and Postgres settings as
prod). Re-measured on prod after step 7, read-only queries only. Each figure
is over ≥ 300 runs with random parameters, after one warm-up pass.

| Gate | Metric | Pass |
|---|---|---|
| Data | prepare rejects | < 0.1% (expected ≈ 0) |
| Data | duplicates | manifest `duplicates` = 29,942 for the 2026-10-02 dump (post-setup key, §1; not the raw-CSV 21,809); exactly one row per `contentHash` passes the gate (int query) |
| Data | content hash parity | TS `puzzleContentHash` = SQL backfill expression on the fixture set (int-spec) |
| Data | row counts | catalogue = manifest valid rows; `passesQualityGate` count equals the manifest |
| Data | spot check | 1,000 random materialisations: post-setup FEN equals chess.js after `moves[0]`; solution replays; mate-themed puzzles end in mate |
| Load | resource gate | no gate tripped longer than its limit; every pause logged. Wall time ≈ 15–30 min is a guideline only |
| Load | release record | `lichess_catalogue_releases` row has `loadCompletedAt`; counts equal the manifest |
| Load | API impact while loading | `/health/ready` p95 and a scripted `GET /puzzles/mine/:id` p95 within +20% of the same window on a quiet night |
| Load | resume | kill at band ~30, re-run: final row count and `md5(string_agg(id \|\| rating, ',' ORDER BY id))` identical to an uninterrupted run (on `vps_dev`) |
| SQL | walk, common theme | p50 < 3 ms, p95 < 10 ms, p99 < 20 ms |
| SQL | walk, rare theme (< 0.5%) | p50 < 15 ms, p95 < 50 ms, p99 < 100 ms |
| SQL | browse page | p95 < 50 ms; no plan contains `Seq Scan on lichess_puzzles` (asserted in an int-spec with `EXPLAIN`) |
| API | `POST /puzzles/training/next` | p50 < 60 ms, p95 < 150 ms, p99 < 300 ms (student with 2,000 attempts) |
| API | `GET /puzzles/catalog` | p50 < 40 ms, p95 < 100 ms |
| API | `GET /puzzles` (library, after PR 1) | p95 < 150 ms with 50k `puzzles` rows seeded on `vps_dev` |
| Backup | nightly dump size after load | within +10% of the pre-load size |
| Backup | restore drill | excluded-data dump restores; load repopulates; app works before and after |
| Correctness | unit specs | evaluation (alternative mate), rating maths (§9 table), policy (slots/fallbacks), prepare core (each reject reason), materialiser (transform table §3) |
| Correctness | int-specs (real Postgres) | `(source, sourceId)` uniqueness incl. soft-deleted; concurrent materialise ⇒ one row; upsert `IS DISTINCT FROM` writes nothing on an identical reload; retire / un-retire; walk order = index order |
| Correctness | e2e (opt-in) | solve an adopted puzzle: setup-move highlight, auto-reply, alternative mate accepted, 3-level hint; coach shares a catalogue puzzle in class; training next → solve → next (after D0) |

Not started until review: any production load, any PR beyond 1–4.

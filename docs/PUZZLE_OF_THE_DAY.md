# Puzzle of the Day

A daily puzzle for every student, at three levels, with a streak. Step 1 is
in the app; step 2 (later, needs Meta template approval and an opt-in) sends
it on WhatsApp. Feature 6 of [UNIQUE_FEATURES_PROPOSAL.md](UNIQUE_FEATURES_PROPOSAL.md).

**Status:** step 1 built 2026-11-21 on `dev` (API, student page and card, admin and coach schedule). Step 2 (WhatsApp) not started.

## Owner's calls (2026-11-21)

| Question | Answer |
|---|---|
| Who picks the puzzle | **Automatic**; an **admin** (whole academy) and a **coach** (their batch) can fully override any day and level, or **turn it off** |
| Levels | **Three a day**: Easy / Medium / Hard; a student gets the level of their training rating and may try the others |
| Streak | **Finishing** the day's puzzle keeps it, solved or not |
| When a day starts | Midnight in the **academy's** time zone (`Tenant.timezone`) |

## Rules

- **Levels** (`@nexa-chess/types` `daily-puzzle.ts`, `dailyPuzzleLevelFor`):
  Easy 800–1199, Medium 1200–1599, Hard 1600–1999 by puzzle rating. A
  student's level comes from `StudentProgress.puzzleRating` (1200 = Medium
  before their first rated puzzle).
- **Who gets it**: students with at least one batch that has puzzle training
  on (`Batch.puzzleTrainingEnabled`, the same switch as rated training) **and**
  the daily puzzle on (`Batch.dailyPuzzleEnabled`, default on), while the
  academy has it on (`DailyPuzzleSettings.enabled`, default on).
- **Which puzzle** (`resolveDailyPuzzleSource`), for a student, day and level:
  1. a coach override on the student's **home batch** — their first-enrolled
     batch that has the daily puzzle on (the same order `trainingBatches` uses);
  2. else the admin override for the academy;
  3. else the automatic pick: one quality-gated Lichess catalogue puzzle in
     the level's band, materialised through `PuzzleCatalogService`, never one
     the academy has had as a daily before (`contentHash`). Picked lazily on
     the first read of the day and stored, so everyone shares it.
  An override is a library puzzle the setter can see; a coach may pick GLOBAL
  or their own PRIVATE puzzles (students of their batch can open those).
- **Solving** reuses the attempt engine: the daily route opens a
  `PuzzleAttempt` with context `DAILY` (like training's `TRAINING`) and the
  student solves with the ordinary attempt routes, so rating, hints and the
  practice streak work unchanged. `submit` tells `DailyPuzzleService` when a
  `DAILY` attempt finishes.
- **Result and streak**: `DailyPuzzleEntry` (one per student, day and level;
  the attempt id) is written when the attempt opens and stamped when it
  finishes. The streak is **computed, never stored**: consecutive academy days
  up to today (or yesterday, while today is still open) with at least one
  finished entry (`computeDailyStreak`).
- **Off** means no card, no page content and a 403 on start, for that batch's
  students (if none of their batches has it on) or everyone (academy off).

## API (`apps/api/src/puzzle/daily-puzzle.*`, `API_ROUTES.dailyPuzzle`)

| Route | Who |
|---|---|
| `GET /daily-puzzle` | student: today's three puzzles (no solutions), their level, today's results, streak |
| `POST /daily-puzzle/start` `{ level }` | student: opens or resumes today's `DAILY` attempt at that level |
| `GET /daily-puzzle/schedule?batchId=&from=` | admin (academy, or a batch) / coach (own batch): 14 days × 3 levels, what each resolves to and from where |
| `PUT /daily-puzzle/overrides` `{ batchId?, day, level, puzzleId \| null }` | admin (academy or any batch) / coach (own batch): set or clear one |
| `PUT /daily-puzzle/settings` `{ enabled }` | admin: academy on/off |
| `PATCH /daily-puzzle/batches/:id` `{ enabled }` | admin / coach of the batch: batch on/off |

## Web

`features/daily-puzzle/`.

- **Student**: `/student/daily-puzzle` ("Puzzle of the Day" in the menu;
  `DailyPuzzleClient`): streak tiles, the three levels (their own marked),
  "Solve today's puzzle" opens the DAILY attempt and the ordinary solver
  (`usePuzzleAttempt`, which resumes it). A level finished earlier shows its
  result; one finished just now keeps the board with the solution. Dashboard
  side-rail card `DailyPuzzleDashboardCard` (hidden when off or empty).
- **Admin**: `/admin/daily-puzzle` (Learning): "Whole academy" or any active
  batch, the on/off switch, 14 days × 3 levels with their source (Automatic /
  Academy pick / Batch pick), Change (search the published library) and Reset.
- **Coach**: `/coach/daily-puzzle`, the same for each active batch they teach.
- A day that hasn't come yet with no override shows "Picked automatically on
  the day": the automatic pick happens on the first read of that day.

## Data

`DailyPuzzle` (academy or batch scope, day, level, puzzle, source AUTO / ADMIN
/ COACH, who set it), `DailyPuzzleEntry` (student, day, level, attempt,
finished, solved), `DailyPuzzleSettings` (one row per academy),
`Batch.dailyPuzzleEnabled`. Entries are the student's data: privacy export
section `dailyPuzzleEntries`.

## Step 2 — WhatsApp (not built)

Morning send through `MessagingDispatchService` with an approved template and
a board image; replies through the support webhook. Needs: Meta template
approval, per-message cost, an explicit opt-in, and a decision on sending to an
unverified parent number ([PARENT_REPORTS.md](PARENT_REPORTS.md)).

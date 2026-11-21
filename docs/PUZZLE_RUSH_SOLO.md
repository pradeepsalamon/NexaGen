# Solo Puzzle Storm and Puzzle Racer

The two Lichess timed modes from the live class ([LIVE_CLASS.md](LIVE_CLASS.md),
"Puzzle Storm / Puzzle Racer"), played alone from the student's own area, with a
leaderboard per batch. Added 2026-11-16 (night run, item 10 of
`NIGHT_RUN_2026-11-15.md`; the owner approved it).

## What a student sees

`/student/puzzle-rush` ("Storm and Racer" in the student menu):

- one card per mode with the rules, the student's best score and a Play button;
- a view toggle between **Individual Leaderboard** and **Batch Battles ⚔️**;
- an **individual leaderboard** for a batch the student is in (a batch picker when there is
  more than one), per mode, for **this week** or **all time**;
- a **Batch Battles / Clan Cup** academy leaderboard ranking all active batches by aggregate
  team score, active student solvers, average score per solver, and the batch's MVP contributor;
- a **My Batch Standing banner** showing the student's batch rank, total score, personal points
  contribution (and percentage of batch score), and gap to the #1 leader.

A run is the same board and rules as in class: the player's own screen checks
the moves (`features/live-class/lib/puzzleRushRun.ts`), the components
`ComboBar`, `FeedbackPop` and `RushSummary` are the live class's. A Racer run
has the 10-second countdown and 90 seconds; a Storm run has 3:00 from the first
move. There is no class rank on the result screen.

## Who may play

Students only (coaches and admins get 403). A student needs at least one batch
with `puzzleTrainingEnabled` on — the same switch as rated puzzle training
([PUZZLES.md](PUZZLES.md)) — so a coach or admin who switched training off for
a batch also switches this off for it. The leaderboard lists only batches the
student belongs to; any other batch id is a 404.

## API (`apps/api/src/puzzle-rush/solo-puzzle-rush.*`)

Routes in `API_ROUTES.puzzleRushSolo`, contract in `packages/types/src/puzzle-rush.ts` ("Solo play"):

| Route | |
|---|---|
| `GET /puzzle-rush/solo` | batches, personal bests (`bests` all time, `weekBests` the last 7 days), `enabled` |
| `POST /puzzle-rush/solo/runs` `{ mode }` | closes the student's unfinished run, freezes a new one |
| `PUT /puzzle-rush/solo/runs/:id/progress` | the running totals; the server clamps them |
| `GET /puzzle-rush/solo/leaderboard?batchId&mode&period` | `period` is `WEEK` or `ALL` |
| `GET /puzzle-rush/solo/battles?mode&period` | academy-wide batch / clan battles leaderboard (`period` is `WEEK` or `ALL`) |

Rules that must stay true:

- **The run is chosen by `selectPuzzleRushRun`** (`puzzle-rush-run.ts`), the one
  function the live class also uses: the StormSelector ladder from the Lichess
  catalogue. Without the catalogue (< 20 puzzles) a start is a 503.
- **Moves are checked in the browser; totals are clamped.** `clamp` in the
  service is the live class's rule: no more moves than the puzzles reached
  hold, Storm score = solved, Racer score ≤ moves + `maxComboBonus`, a Storm
  clock ≤ 3:00 + every bonus those moves could earn. Totals only move forward
  (`updateMany` with `moves` / `puzzleIndex` `lte`, `finishedAt: null`); a
  Racer report after `endsAt` + grace is a 409. A client that stops reporting
  just leaves an unfinished run, which never counts.
- **Only finished runs reach the leaderboard.** Each student's best run counts
  (score, then fewer errors, then earliest); ties on score and errors share a
  rank. The raw query carries `tenantFilter("r")` and is listed in
  `tenancy/raw-sql-review.spec.ts`. Names are **first name and last initial**
  ("Arjun K.", `leaderboardName`), because students are minors (owner's call
  left to the builder, 2026-11-16); at most 50 rows.
- **Batch battles aggregate each student's top run per batch.** Active batches with
  `puzzleTrainingEnabled: true` compete across the academy. The raw query applies
  `tenantFilter("b")` and `tenantFilter("r")` across CTEs, ranks ties together on
  `totalScore` and `activeStudents`, determines the batch MVP (anonymized via
  `leaderboardName`), and calculates the student's own batch standing and contribution.
- **A run is read through the student's own id**: another student's run id is a
  404 (`cross-user-access` rows "student reports into another student's solo
  Puzzle Storm run" and "…a batch leaderboard they are not in").

## Data

`SoloPuzzleRushRun` (`solo_puzzle_rush_runs`): student, mode, frozen `puzzles`
JSON, `startsAt`/`endsAt`, the clamped totals, `playedAt` (Storm: the first
move), `finishedAt`. **`puzzles` is emptied once the run is finished** (about
30 KB a run otherwise); the scores stay. Cascades with the student; not
soft-deletable, not Trash-registered, no financial link. Included in the
student's privacy export (`soloPuzzleRushRuns`, without the puzzle list). There
is no retention rule: a run is a few hundred bytes after it finishes and
the leaderboard's "all time" reads them.

## Web

`/student/puzzle-rush` (`features/puzzle-rush-solo/`). The leaderboard
refreshes itself every 45 s while it is on screen and the tab is visible
(`refetchInterval` + `refetchIntervalInBackground: false`, a poll like chat's,
no websocket), and at once after a finished run (the final report invalidates
every `soloRush` query). The student dashboard shows `SoloRushDashboardCard`
only when `enabled`: this week's best per mode (`weekBests`), or "Try Puzzle
Storm"; nothing while it loads or if it fails.

## Not done

- Live push of a leaderboard change (polled instead, above).
- Points or rating for solo runs; the runs are not part of the student's puzzle
  rating, Smart Revision or the activity history (unchanged on purpose,
  2026-11-16).

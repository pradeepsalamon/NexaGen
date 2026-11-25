# AI play review

One record of every board move a student plays, a nightly engine review of it
for every student, and optional outside-AI comments for students whose switch
is on. Built 2026-11-24 from [AI_PLAY_REVIEW_PLAN.md](AI_PLAY_REVIEW_PLAN.md)
(owner decisions in its §8).

| Part | Who | Switch |
|---|---|---|
| Play feed (recording) | every student | none: disclosed in the terms and privacy policy |
| Engine review (our Stockfish, our server) | every student | academy switch (on by default) + plan feature `aiPlayReview` |
| Outside-AI comments | students whose switch is on | academy switch (off by default) + plan feature + a configured provider + the student's current consent |

Student, their coach and admins see it (`assertCanViewStudent`, the same rule
as the progress pages).

## Where things are

| Piece | Path |
|---|---|
| Contract | `packages/types/src/ai-review.ts` (`PlayItem`, `outsideAiAllowed`, `AI_REVIEW_CONSENT_VERSION`, caps), routes `API_ROUTES.playReview` |
| API module | `apps/api/src/play-review/` (controller, `PlayReviewService`, `AiReviewConsentService`, `PlayItemLoader`, `play-feed.sql.ts`, `play-review.rules.ts`, `PlayReviewJob`) |
| Outside AI adapter | `apps/api/src/ai/outside/outside-ai.ts` (`pseudonymisePlay`, `OpenAiCompatibleProvider`) |
| Gap A (Storm/Racer moves) | `apps/api/src/puzzle-rush/rush-played.ts`; web `features/live-class/lib/puzzleRushRun.ts` (`played`, `tried`) |
| Gap B (class board credit) | `GameRecorderService.recordBoardCredits`; web `useBoardSync` → `creditMove` in `createBoardStore`, saved via `toLiveBoardState().moveCredits` |
| Web | `features/play-review/` (Board play tab on the student progress pages, `AiReviewConsentCard` on Profile and the staff student page, `AiPlayReviewSettingsCard` on `/admin/game-sync`) |
| Tables | `ai_review_consents`, `ai_play_review_settings`, `ai_play_reviews`, `ai_play_comments`, `live_class_board_moves`; `movesJson` on `solo_puzzle_rush_runs` and `live_class_puzzle_rush_entries` (migration `20261124202854_ai_play_review`) |

## 1. The play feed (read model, no copy)

`play-feed.sql.ts` unions one branch per source, each returning
`(source, source_id, student_id, played_at)` for **finished** play only; the
service then loads the page's rows through Prisma (`PlayItemLoader`) and
replays each line with `common/chess/chess` to get SAN and who moved
(`replaySegment`; a move that doesn't play ends the line, nothing is
invented).

| Source | Record | Finished when | Student's moves |
|---|---|---|---|
| `PUZZLE` | `puzzle_attempts` (every context) | SOLVED / FAILED, or ABANDONED after a move | the side to move in the puzzle; a FAILED attempt's last wrong move is added from `wrongMovesJson` |
| `ASSIGNMENT` | `student_assignment_attempts` (SOLVE_LINE, PLAY_VS_ENGINE) | `completedAt` | `assignment.studentColor` |
| `PLAYOUT` | `live_class_playout_games` | `finishedAt` | `by: "STUDENT"` |
| `POLL` | `live_class_move_poll_answers` | the poll is no longer OPEN | the one answer |
| `MATCH` / `SIMUL` / `TOURNAMENT` | `chess_games` (finished, as archived by `GameRecorderService`) | `COMPLETED` | the side they stood on (one row per student on either side) |
| `OWN_GAME` | `chess_games.ownerId` (uploads, Lichess / Chess.com sync) | always | the side they're named on |
| `RUSH` | `solo_puzzle_rush_runs` (`s-<id>`), `live_class_puzzle_rush_entries` (`c-<id>`) | `finishedAt` and moves on record | `by: "STUDENT"` per puzzle (one segment per puzzle) |
| `CLASS_BOARD` | `chess_games` LIVE_BOARD + `live_class_board_moves` | COMPLETED, or 6 h after its last save | the credited plies |

Out of scope: MCQ answers (no board), Game Library / analysis-board
exploring, demo-class guests.

Keyset-paged newest first on `(played_at, "SOURCE:id")`; the cursor is opaque
(`base64url` JSON); a bad one is a 400. Raw SQL: every branch filters its
driving table with `tenantFilter` (listed in `tenancy/raw-sql-review.spec.ts`).

### Gap A: Storm / Racer moves

A report may carry `played: [{ i, moves: [{ uci, skipped? }], solved }]` for
the puzzles the player **finished**. `mergeRushPlayed` keeps only entries for
`i < clamped puzzleIndex` that aren't stored yet, and `rebuildRushLine`
replays each against the run's **own** puzzle (setup move, the player's
moves, the puzzle's replies; the expected move or any mate is correct, a skip
only for the expected move). The server's verdict, not the client's, is
stored. `movesJson` only grows, in the same forward-only claimed update as
the totals; runs before this change stay totals-only. Older clients send
nothing and keep working.

### Gap B: class-board moves

Board control is per browser (LiveKit data packets), so only the coach's
window knows who moved. When it accepts a controlling student's move it calls
`creditMove({ fenBefore, uci, userId })` (user id = the LiveKit identity
without its `_<tab>` suffix); the credits ride in the saved board state
(`LiveBoardState.moveCredits`, never broadcast, reset per board game). On each
save `recordBoardCredits` matches them to the game's **mainline** by position
+ move, keeps only users who are STUDENTs of that class (its batch or its
attendance), and replaces the game's rows when they changed. Coach moves are
never credited; a taken-back move drops out.

## 2. Engine review (nightly)

`PlayReviewJob.nightly`, 21:30 UTC (03:00 India), one runner
(`JOB_LOCKS.playReviewNightly`), once per academy (`runForEachTenant`):

- skipped unless the plan has `aiPlayReview`, the academy's
  `engineReviewEnabled` is on (default) and Stockfish is available
  (`GAME_ANALYSIS_ENABLED`); `PLAY_REVIEW_JOB_ENABLED=false` turns the cron off;
- takes finished play of the last `PLAY_REVIEW_BACKFILL_DAYS` (90) with no
  review (or a FAILED one under 3 attempts), newest first, at most
  `PLAY_REVIEW_NIGHTLY_ITEM_CAP` (300) per academy, inside a shared
  `PLAY_REVIEW_NIGHTLY_BUDGET_MS` (90 min);
- **stops while any class (any academy) is live** — the CPU is shared;
- runs `GameAnalysisEngineService.analyzeGame` (QUICK preset, background lane)
  per segment with a student move (≤ 40 segments, ≤ 160 plies each), then the
  pure `buildPlayReview`: `classifyGame` (White-relative, versions stored) and
  `detectGameTactics`, judging **only the student's moves**;
- writes one `ai_play_reviews` row per item (DONE / SKIPPED / FAILED; unique
  per academy + student + source + id), with up to 8 findings worst first.

Reviews are derived and kept a year (`RETENTION_RULES`). The weekly roll-up
(`/rollup`) averages the last 7 days by source and counts finding themes.

## 3. Outside-AI comments

- **The one rule** `outsideAiAllowed` (`@nexa-chess/types`): academy
  `outsideAiEnabled` **and** plan `aiPlayReview` **and** a provider configured
  **and** `aiConsentIsCurrent` (latest consent row on, for the current
  `AI_REVIEW_CONSENT_VERSION`). Bump the version when the wording, the provider
  or the retention changes: everyone is asked again.
- **Consent** is append-only (`ai_review_consents`, latest row = state). The
  student switches it on in Profile after ticking "My parent or guardian
  agrees"; their coach or an admin can switch it on from the student page
  after a parent agreed (`changedByRole` records who). Switching **on** needs
  the plan feature (402); switching **off** always works, and deletes the
  student's comments in the same transaction. A comment whose request was
  still running is dropped (consent re-checked in the write transaction).
- **Provider**: any OpenAI-compatible chat API, from env
  (`AI_REVIEW_PROVIDER_URL`, `_API_KEY`, `_MODEL`, `_NAME`, `_TIMEOUT_MS`); all
  of URL/key/model unset = off. Not connected yet (no key): the owner picks a
  provider later. Free models compared: [ai/PROVIDER_EVAL.md](ai/PROVIDER_EVAL.md)
  (note: the comment call's `max_tokens: 400` is too small for thinking models). Free tiers may train on what they're sent; pick one whose
  terms the academy accepts, and **name it in the privacy policy before
  turning it on** (`features/legal/content.ts` says none is in use yet).
- **Pseudonymised payload** (`pseudonymisePlay`): source kind, start FENs,
  SAN moves (the student's marked `*`), results, accuracy and findings. Never a
  name, id, title, class, batch, academy or date (spec-checked). Only status
  codes are logged.
- The nightly comment pass writes at most `PLAY_REVIEW_NIGHTLY_COMMENT_CAP`
  (100) per academy, newest reviews first, past play included.

## 4. Routes

| Route | Who |
|---|---|
| `GET /play-review/me/feed`, `/me/items/:source/:sourceId`, `/me/rollup`, `GET/PUT /me/consent` | the student |
| `GET /play-review/students/:id/feed`, `/items/:source/:sourceId`, `/rollup`, `GET /consent` | the student, their coach, admins |
| `PUT /play-review/students/:id/consent` | their coach, admins |
| `GET/PATCH /admin/play-review/settings` | admins (`@RequireFeature("aiPlayReview", { allowReads: true })`) |

## 5. Privacy

Export sections: `aiReviewConsents` (without who changed it), `aiPlayReviews`,
`aiPlayComments`, `classBoardMoves`; Storm moves ride in the existing
`soloPuzzleRushRuns`. The policy (`features/legal/content.ts`, terms version
2026-11-24) states the recording, the engine review, who sees it, the outside
AI and its switch, and the one-year retention.

## 6. Tests

Unit: `play-review.rules.spec.ts`, `play-review.job.spec.ts`,
`ai-review-consent.service.spec.ts`, `outside-ai.spec.ts`,
`rush-played.spec.ts`, the class-board cases in `game-recorder.service.spec.ts`.
Integration: `play-review.int-spec.ts` (every source in one feed, paging,
Storm moves through the real route, the nightly to-do list per academy,
consent on/off, export) and rows in `access-cases.ts`.

## 7. Rolling back

The migration is additive (class A). To switch it off without a deploy: the
academy's switches (`/admin/game-sync`), or `PLAY_REVIEW_JOB_ENABLED=false`.
Reverting the code leaves the new tables and columns unused.

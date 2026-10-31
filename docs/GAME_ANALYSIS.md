# Game analysis — evaluation, move classification, accuracy

Status: **implemented, not yet deployed** (2026-10-17). Code:
`packages/types/src/game-analysis.ts` (evaluation, classification, accuracy),
`game-tactics.ts` + `apps/api/src/game-analysis/tactics/` (tactics),
`game-analysis-report.ts` (reports, phases, PGN helpers, insight thresholds),
`apps/api/src/stockfish/` (`searchLines`, priority lanes, per-game engine pass),
`apps/api/src/game-analysis/` (jobs, reports, insights, revision),
`apps/web/src/features/game-analysis/`. Game sources: [GAME_SOURCES.md](GAME_SOURCES.md).
Parent reports: deliberately deferred — [PARENT_REPORTS.md](PARENT_REPORTS.md).

NexaGen's labels and accuracy are **its own methodology**. They are not
calibrated against, and must never be presented as, Lichess or Chess.com
figures. A benchmark (Phase 8) is required before any comparison claim.

## 1. Evaluation convention (`white-relative-v1`)

- Every stored or compared `Evaluation` is **White-relative**: `{ kind: "cp", cp }`
  (integer centipawns, + is good for White) or
  `{ kind: "mate", winner, moves }` (`moves` ≥ 0; 0 = checkmated on the board).
- UCI engines print scores from the **side to move**. The only conversion is
  `normalizeUciScore(score, sideToMove)` (inverse: `toUciScore`). UCI
  `mate N` = side to move mates, `mate -N` = it is mated, `mate 0` = it is
  already mated.
- A player's view goes through `evaluationForSide` / `winPercent(e, side)` —
  never a hand-written sign flip.
- Mate is never a large centipawn number, so it cannot overflow, enter a cp
  average or change sign. Centipawns are clamped to ±10 000 (tablebase wins
  report ~20 000). Non-integer / NaN / infinite scores normalise to `null`
  ("no evaluation"), never to 0. `-0` is normalised to `0`.
- `evaluationFromEngineResult` reads the existing `StockfishAnalysisResult`
  (pawns, side to move) used by the analysis panel and assignments.

## 2. Expected score (win %)

`winPercent = 50 + 50 · (2 / (1 + e^(−k·cp)) − 1)`, `k = 0.00368208`, for the
given side; mate is exactly 100 / 0. The slope is the one Lichess publishes,
used as a starting prior; it is a named constant (`WIN_PERCENT_K`) so it can be
re-fitted on NexaGen data. Using win% (not raw centipawns) is what makes the
same engine swing matter less in a decided position than in a balanced one.

## 3. Move classification (`nexa-classify-v1`)

`classifyMove(evidence, policy)` — pure, deterministic, colour-symmetric (the
specs mirror every scenario). Rules in order:

1. **FORCED** — exactly one legal move. Needs no engine.
2. **UNCLASSIFIED** with a `limitedBy` reason when the evidence is not good
   enough — no top line before the move (`NO_EVALUATION_BEFORE`), no score for
   the played move (`NO_EVALUATION_AFTER`), a provisional bound score
   (`PROVISIONAL_SCORE`), or a search shallower than `minDepth`
   (`SHALLOW_SEARCH`; a terminal next position needs no depth). A label is
   never guessed.
3. **The played move's score**, fairest first: the engine's own move (same
   search, loss 0) → a matching MultiPV line (same search) → a root-move search
   (`go searchmoves <move>`, same position and config) → the next position's
   top line (already White-relative). A score above the best line is clamped:
   horizon noise is not a gain.
4. Engine top move → **BEST**. A MultiPV line within `bestMaxLoss` → BEST
   (`WITHIN_BEST_MARGIN`) — only from the same search; cross-search noise never
   earns BEST.
5. Mate transitions, decided by mate status:
   - the move walks into a mate in ≤ `mateAllowedMaxMoves` from a position that
     wasn't already being mated → **MATE_ALLOWED** (also tagged
     `HAD_FORCED_MATE` if the mover had one);
   - a mate in ≤ `missedMateMaxMoves` existed and is gone → **MISSED_MATE**;
   - still mating as fast as the best line → **BEST** (`WITHIN_BEST_MARGIN`;
     a next-position search counts one move fewer); just slower → GOOD
     (`KEPT_FORCED_MATE`);
   - already being mated, still mated → GOOD (`ALREADY_BEING_MATED`) — not a
     lesson worth flagging.
   Longer mates fall through to the win% rules.
6. **MISSED_DRAW** — top line |cp| ≤ `drawnMaxCp`, **the second line already
   losing** (≤ `losingWinPercent`, so the draw was the only resource) and the
   played move losing. Needs MultiPV ≥ 2; without it the move is judged by its
   win% loss only.
7. **MISSED_WIN** — mover was winning (≥ `winningWinPercent`), no longer is, and
   the loss is at least `mistakeLoss`.
8. Win% loss thresholds: ≥ `blunderLoss` BLUNDER, ≥ `mistakeLoss` MISTAKE,
   ≥ `inaccuracyLoss` INACCURACY, else GOOD.
9. Caps: while still winning after the move → at most `capWhileStillWinning`;
   in an already-lost position that stays lost → at most `capWhileAlreadyLost`
   (tags `CAPPED_*`).

`onlyMove` is set when the engine's move was played and the second line is
`onlyMoveGap` points worse (needs MultiPV ≥ 2).

| Policy field | Default | Why |
|---|---|---|
| `inaccuracyLoss` / `mistakeLoss` / `blunderLoss` | 5 / 10 / 15 win% | Common scale for expected-score loss; to be calibrated in Phase 8 |
| `bestMaxLoss` | 1 | Same-search ties only |
| `winningWinPercent` / `losingWinPercent` | 80 / 20 | ≈ ±3.8 pawns |
| `capWhileStillWinning` / `capWhileAlreadyLost` | INACCURACY | A decided result didn't change |
| `missedMateMaxMoves` / `mateAllowedMaxMoves` | 5 / 5 | A mate in 12 isn't reasonably "missed" by name |
| `drawnMaxCp` | 30 | Engine draws read 0.00; small margin for search noise |
| `onlyMoveGap` | 20 win% | Alternatives change the result |
| `minDepth` | 12 | Below it, scores swing too much to judge |

`assertValidClassificationPolicy` rejects contradictory thresholds.

## 4. Accuracy (`nexa-accuracy-v1`)

- **Per move**: `103.1668 · e^(−0.04354 · loss) − 3.1669`, clamped to 0–100,
  where `loss` is the classifier's win% loss (0 → 100, ~5 → 80, ~15 → 50).
  Mates are already 0/100 win%, so a mate allowed costs its full drop and a
  slower mate costs nothing — no special case can break the formula.
- **Per side, per game**: the mean of the arithmetic mean and the harmonic mean
  of per-move accuracies (each floored at 1 inside the harmonic mean). The
  arithmetic mean alone lets many easy moves hide a blunder; the harmonic mean
  alone is dominated by the worst move.
- **Excluded**: FORCED moves (no choice to judge) and UNCLASSIFIED moves.
- **Insufficient**: fewer than `minEligibleMoves` (5) eligible moves →
  `accuracy: null, TOO_FEW_MOVES`; eligible / (moves − forced) below
  `minCoverage` (0.8) → `null, LOW_COVERAGE`. Never a partial-looking number.
- White and Black are computed separately from the same rules.
- The version is stored with every result; scores of different versions must
  not be mixed in one chart. This is **not** puzzle accuracy, rating or
  long-term improvement — separate measures.

## 5. Engine: provisional scores, MultiPV, priority

- `parseUciInfoLine` reads `lowerbound` / `upperbound`. A bound score never
  replaces an exact one (nor its PV); it is kept, flagged, only when nothing
  exact exists. The panel's `StockfishAnalysisResult` now carries
  `scoreBound` only in that case. `info string` lines are ignored.
- `StockfishService.searchLines(fen, { movetimeMs, depth, multiPv, searchMoves,
  priority, signal })` returns White-relative `EngineLine`s with bound + depth
  per line. MultiPV is set per task and reset to 1 for the next one; existing
  callers never send `MultiPV` or `searchmoves`. `searchmoves` is written last
  on the `go` line (Stockfish reads every later token as a move). Not cached
  (a game would flush the panel's 500-entry cache); identical in-flight
  searches are shared.
- **Two lanes in the one existing pool**: `interactive` (panel, engine moves,
  simul, assignment grading — every existing caller) and `background`
  (per-game analysis). Interactive tasks are always taken first; background
  work may hold at most `poolSize − 1` engines (so one stays free for people),
  never starts an engine it can't use, and searches on one thread. An
  interactive caller joining a queued background search promotes it. A
  background search already running is not pre-empted: an interactive request
  arriving when every engine is busy waits for the next free engine (≤ one
  movetime).
- `GameAnalysisEngineService.analyzeGame({ startFen, movesUci }, { config,
  signal, onProgress })`: replays with the castling-safe chess wrapper (stops at
  the first illegal / malformed move → `truncated`), scores checkmate,
  stalemate and insufficient material by the rules, searches every other
  position with **one** configuration on the background lane, optionally
  root-searches played moves the lines don't cover, and marks what it couldn't
  finish (`FAILED`, `SKIPPED` on budget) instead of guessing. Abort cancels the
  rest. `classifyGame(result)` turns it into labels + accuracy.

Presets (`GAME_ANALYSIS_PRESETS`) — none is exhaustive; QUICK must be labelled
as a skim:

| Preset | movetime | depth cap | MultiPV | root-move | budget |
|---|---|---|---|---|---|
| QUICK | 250 ms | 14 | 1 | no | 60 s |
| STANDARD | 800 ms | 18 | 2 | no | 180 s |
| DEEP | 2000 ms | 22 | 3 | yes | 600 s |

Measured on the production box (Stockfish 17.1, 1 thread, MultiPV 2,
STANDARD limits; 33-ply game): **0.60 s per position**, average reported depth
16.9 — about 50 s of one core for a typical 80-ply game.

## 6. Tactics (`nexa-tactics-v1`)

`detectGameTactics(engine, classification)` (API, needs chess.js). A position is
a **tactical opportunity** only when all hold:

1. its top line is exact and at least `minDepth` deep;
2. the line forces mate in ≤ 5, **or** wins ≥ 2 pawns of material — measured
   after the opponent's reply (an even ply, so a recaptured piece counts as
   nothing) and against the material **before the opponent's last move** (so
   winning back what they just took is not a tactic);
3. the mover's expected score jumped ≥ 15 points since the previous position —
   the opponent's last move gave it away. This keeps a sound sacrifice, a
   recapture, or the middle of a combination already under way from being
   reported as a fresh tactic. Exception: a forced mate counts whenever the
   previous position wasn't already a forced mate for the same side (in a won
   position win% can't jump far, but a new mate is still new).

The motif is then read from the board — on the line's first move
(`CONFIRMED`) and on the side's second move of the line (`INFERRED`), plus the
sequence motifs (`INFERRED`). **A board pattern is only credited when the line
cashes it in**: for fork, double attack, pin, skewer and discovered attack, the
side's own moves later in the line must capture one of the pieces the pattern
targets (or, in a forced mate, the pattern's check drives the mate). A fork
that wins nothing it forks is not why the line works. Checks, captures and
promotions are their own evidence. A gain with no credited pattern is
`MATERIAL_GAIN` ("tactical opportunity"), never forced into a named motif.

| Motif | How | Rule |
|---|---|---|
| FORK | geometry | moved piece attacks ≥ 2 targets that are the king, worth more than it, or undefended (pawns only if worth more) |
| DOUBLE_ATTACK | geometry | the moved piece and a discovered line each newly threaten a target |
| PIN / SKEWER | geometry | a slider's ray: front enemy piece, rear enemy piece; pin = rear worth more (or king); skewer = front worth more (or king); front ≥ minor; only pins/skewers that did not exist before the move |
| DISCOVERED_ATTACK / DISCOVERED_CHECK | geometry | another slider's line through the move's from-square now hits a meaningful target / the king |
| DOUBLE_CHECK | geometry | ≥ 2 checkers after the move |
| HANGING_PIECE | geometry | capture of an undefended piece, or of one worth more than the capturer |
| BACK_RANK_MATE | geometry | the mated king on its own back rank, a checker on that rank, and **every** square in front of the king occupied by its own pieces (not attacked by the mating side) |
| MATE | engine | forced mate ≤ 5 in the line |
| PROMOTION | geometry | the line's move promotes |
| REMOVAL_OF_DEFENDER | sequence | line move 1 captures a piece that guarded an attacked target; line move 3 captures that target |
| INTERMEDIATE_MOVE | sequence | the opponent just captured, a recapture existed, the line plays something else first and recaptures within 2 moves |
| Deflection, decoy | **not detected** | the available evidence did not separate them from ordinary captures; they surface as MATERIAL_GAIN |

**Outcome** for the side that had it: `FOUND` (the engine's move was played,
or the only legal move), `ALTERNATIVE` (another move cost less than a mistake),
`MISSED` (≥ a mistake's loss), `UNKNOWN` (the move wasn't classified).
`allowedByPly` marks the opponent's move (≥ mistake) that handed it over — this
is how "hanging a piece" is counted for the side that hung it, without mixing
the two players' records.

## 7. Persistence and jobs

Migration `20261020100000_game_analysis` (additive only: new enums, tables,
nullable columns, enum values `PuzzleSource.GAME`, `RevisionItemSource.GAME`).

- `game_analyses` — one row per (game, mainline fingerprint, depth): status
  QUEUED → RUNNING → COMPLETED | PARTIAL | FAILED | CANCELLED, priority,
  attempts, config, engine id, every algorithm version, progress, heartbeat,
  `engineJson` (the search output — the expensive part, kept so classification
  can be recomputed without Stockfish) and `reportJson` (derived report cached
  for reads).
- `game_analysis_sides` — per-side summary (accuracy, counts, per-motif and
  per-phase stats, clock stats, rating, opening, result, playedAt, playerId)
  that insights read without re-parsing games.
- `chess_games` gains owner, contentHash, external provider/id/url/account,
  timeControl, ECO, opening, ratings; `external_chess_accounts` (GAME_SOURCES.md);
  `puzzles.ownerId`.

**The row is the job** (no Redis needed — the engine pool lives in the API
process anyway). `GameAnalysisWorker` claims with one
`UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED)` ordered by priority then
age, refreshes `heartbeatAt` every 5 s (reading `cancelRequestedAt` back in the
same statement), checkpoints partial engine output every 15 s (a retried job
**resumes**: positions already searched with the same config are reused), and
finishes only while the row still carries its own `claimedAt` (stored at
millisecond precision so it compares back exactly). Stale RUNNING rows
(no heartbeat for 5 min) go back to QUEUED, or FAILED after 3 attempts (cron,
job lock `game-analysis.stale-sweep`). Shutdown hands running jobs back to the
queue. A person's request has priority 10, background work (uploads,
`GAME_ANALYSIS_AUTO_LIVE_GAMES`) 0.

Requests: anyone who can see the game (Game Library visibility); a student only
for games they played or own; **only a finished game** — never mid-game
assistance; 20 per user per UTC day (`GAME_ANALYSIS_DAILY_LIMIT`, admins
exempt); a repeat request returns the existing job; a changed mainline is a new
fingerprint (the old report shows as stale).

## 8. Insights (aggregation)

`aggregateInsights` (`apps/api/src/game-analysis/insights.ts`, pure) over the
student's most recent 300 finished side rows, one analysis per game (deepest,
then newest), **current algorithm versions only** (older ones are counted as
excluded, never mixed). Thresholds are `INSIGHT_THRESHOLDS`:

| Statement | Needs |
|---|---|
| Any rate (errors per 100 judged moves, phase error rates) | ≥ 3 analysed games |
| A motif's miss rate | ≥ 5 opportunities **of that motif** |
| "Recurring weakness" | miss rate ≥ 50 % **and** ≥ 3 misses **in** ≥ 3 different games |
| "Strength" | ≥ 5 opportunities, found-or-equal ≥ 70 % |
| Accuracy trend | 5 recent + 5 earlier games with an accuracy; ±3 points = a change |
| Time pressure | per-move clocks on ≥ 80 % of the side's moves; rates from ≥ 3 such games |

Denominators are opportunities, not games or moves; "handed over" (tactics the
student's own move gave the opponent) is counted separately from tactics they
missed. Ratings are listed per source, never merged. Openings appear only when
the game record named one. Each motif carries up to 5 example positions
(`/games/:id?ply=N`).

## 9. Smart Revision

`POST /game-analyses/:id/tactics/:ply/revision` — the student whose tactic it
was, their coach, or an admin; never automatic. Only a `MISSED` tactic whose
answer is verifiable becomes a puzzle (`revisionEligibility`): a forced mate
(the whole line to mate — the solver accepts any mate) or a material tactic
whose second engine line is ≥ 20 points worse (a unique first move; the
puzzle is that one move). Otherwise it is refused with the reason. The puzzle is
`source: GAME`, PRIVATE + PUBLISHED, in the hidden system folder
`__game_analysis`, `ownerId` = the student, one per (analysis, ply) via the
unique `(source, sourceId)`; only that student can open it (PuzzleAttemptService
+ revision availability), and it never appears in anyone's puzzle list.
Scheduling, grading caps and Activity History are Smart Revision's own,
unchanged; the item's source is `GAME`.

## 10. Reports and UI

- `/games/:id` — the Engine analysis panel (request with depth, progress +
  cancel, accuracy per side, key moments, the selected move's classification,
  explanation, evaluation and engine line, tactics with "Add to Smart
  Revision"), a green arrow for the engine's move in the position on the board,
  `?ply=N` deep links. Reads the stored report; nothing is analysed in the
  browser. Interactive engine access (the analysis panel on the chess board) is
  unchanged: still staff only.
- `/student/insights` — upload PGNs, linked accounts (when enabled), insights.
- Coach/admin: the student's progress workspace → "Games" tab (same insights,
  scoped by `assertCanViewStudent`).

## 11. Benchmark

Script `apps/api/scripts/game-analysis-benchmark.cjs`; fixtures
`apps/api/benchmarks/lichess-puzzle-sample.json` (development, 272 puzzles,
`randKey` < 20M) and `lichess-puzzle-holdout.json` (held-out, 277,
`randKey` ≥ 20M, no overlap); summaries `apps/api/benchmarks/results-2026-10-17.json`.

**Dataset.** Lichess puzzles (CC0, database.lichess.org), sampled ~20 per theme
across fork, pin, skewer, discoveredAttack, doubleCheck, hangingPiece,
backRankMate, mateIn1, mateIn2, deflection, intermezzo, capturingDefender,
promotion and quietMove, plus 40 random. Each puzzle is a real game position:
its first move is the opponent's mistake; the next begins the winning line.

**Method.** The real pipeline (STANDARD preset, Stockfish 17.1, one thread,
background lane) runs twice per puzzle: playing the solution move, and playing
a seeded-random other legal move. Lichess's labels (that the setup move was a
mistake, the solution, the themes) are **reference signals, not ground
truth**: Lichess produced them with its own engine, depth and rules, and its
themes describe the whole solution and are not exhaustive, so motif precision
is a lower bound. Nothing was fitted to them.

**Honest history.** The first run on the development set exposed four
methodology problems, fixed before the final runs: a looser-than-standard
back-rank definition (precision 54%), patterns credited without being
exploited (pin precision 48%), only the line's first move inspected, and a new
forced mate in an already-won position being ignored. Because those changes
were informed by the development set, the **held-out set is the unbiased
estimate**. Searches are time-limited, so results vary slightly from run to
run (the same code moved a few motif counts between runs); treat single-digit
counts as noise.

| Measure | Development set (272) | Held-out set (277) |
|---|---|---|
| Puzzles (errors) | 272 (0) | 277 (0) |
| Setup move judged ≥ mistake | 94.1% | 92.4% |
| Setup move unclassified | 0% | 0% |
| Tactic detected after the setup move | 78.7% | 76.9% |
| Engine best move = Lichess solution move | 100% | 99.6% |
| Solution played → outcome FOUND | 100% | 99.5% |
| Random other move → judged ≥ mistake | 100% | 100% |
| Random other move → outcome MISSED | 100% | 100% |
| …of those, revision-eligible | 100% | 99.1% |
| Tactic claimed for the side about to blunder (ply 0) | 9.2% (25) | 13.7% (38) |
| Deflection puzzles: any tactic / only MATERIAL_GAIN | 21/23 / 11 | 18/22 / 8 |
| Time (s) / ms per search | 540 / 509 | 562 / 521 |

| Motif | Development set (272) precision · recall (TP/pred/labelled) | Held-out set (277) precision · recall (TP/pred/labelled) |
|---|---|---|
| BACK_RANK_MATE | 100% · 85% (17/17/20) | 100% · 80% (16/16/20) |
| DISCOVERED_ATTACK | 100% · 28.6% (6/6/21) | 100% · 42.9% (9/9/21) |
| DISCOVERED_CHECK | 88.2% · 38.5% (15/17/39) | 94.7% · 46.2% (18/19/39) |
| DOUBLE_CHECK | 100% · 60% (12/12/20) | 100% · 65% (13/13/20) |
| FORK | 69% · 80.6% (29/42/36) | 55.6% · 62.5% (20/36/32) |
| HANGING_PIECE | 66.7% · 85.7% (18/27/21) | 61.3% · 82.6% (19/31/23) |
| INTERMEDIATE_MOVE | 58.3% · 35% (7/12/20) | 91.7% · 52.4% (11/12/21) |
| MATE | 100% · 82.4% (70/70/85) | 100% · 75.6% (62/62/82) |
| PIN | 33.3% · 8.3% (2/6/24) | 57.1% · 16.7% (4/7/24) |
| PROMOTION | 83.3% · 25% (5/6/20) | 100% · 71.4% (15/15/21) |
| REMOVAL_OF_DEFENDER | 80% · 20% (4/5/20) | 54.5% · 30% (6/11/20) |
| SKEWER | 73.7% · 66.7% (14/19/21) | 78.6% · 55% (11/14/20) |

**Reading it.**
- The classifier and Lichess agree the setup move was an error in 92–94% of
  puzzles; most disagreements are forced setup moves (the only legal move) or
  positions already decided.
- When the solution is played it is FOUND; a random other move is always a
  mistake or worse and the tactic MISSED — the found/missed logic behaves.
- A tactic is detected after the setup move in about 77–79%: the detector is
  conservative by design (a concrete gain within 10 plies and a jump in
  expected score), so tactics in already-won positions are under-reported.
- Mate, back-rank mate, double check and discovered attack/check are
  high-precision. Fork and hanging piece are found often but over-labelled
  (55–69% precision): a fork or capture is often present on the board while
  Lichess names a different theme. Pin and removal of the defender have low
  recall: the detector only credits a pin the move *creates* and the line
  cashes in, while Lichess also tags exploiting an existing pin. Deflection is
  not named (it surfaces as a general tactical opportunity or another motif).
- "Tactic claimed for the side about to blunder" (9–14%) is an upper bound on
  false alarms, not a measured false-positive rate: the puzzle's first position
  has no game history, and in some the side to move really had a win.
- Speed: about 0.5 s per searched position, so a typical 80-ply game takes
  about 45 s of one core at STANDARD.

**Not measured:** agreement with Chess.com's labels or any site's accuracy
percentage (no legally usable reference data), quiet positional mistakes, and
missed draws (no labelled set). Accuracy and thresholds therefore remain
provisional.

## 12. Known limitations

- Positions are sent to the engine as a FEN, without move history, so it
  cannot see threefold repetition; a repetition draw can look like a non-zero
  score (reports say so).
- MISSED_DRAW and only-move need MultiPV ≥ 2 (not in QUICK); revision puzzles
  from material tactics need it too.
- Thresholds and the win% slope are uncalibrated priors; the benchmark (§11)
  measures agreement with Lichess's labels but nothing has been fitted to them.
- Tactic detection is deliberately conservative: it needs a concrete gain in
  the engine line and a jump in expected score, so tactics in already-decided
  positions (other than a new forced mate) and purely positional "tactics" are
  not reported. Deflection and decoy are not named.
- Tactical motifs are identified on the line's first and second own moves only.
- Time-pressure analysis exists only for games whose PGN carries `[%clk]`
  clocks (Lichess / Chess.com exports do; NexaGen's live-class games don't
  record per-move clocks).
- `AssignmentEvaluationService` (PLAY_VS_ENGINE accuracy) uses this module's
  `winPercent` and `moveAccuracyFromLoss` (`engineMoveAccuracy`) but still
  averages per-move values arithmetically, at a short movetime, without the
  classifier's FORCED/coverage rules. Its percentage is not a game report's
  `sideAccuracy`.
- No automatic background re-analysis when the classification version
  changes: old reports keep their version, and insights only combine the
  current version (the excluded count is shown).

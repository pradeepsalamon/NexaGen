# AI play review: student consent + one record of every board move (night-run plan)

Status: **built 2026-11-24 — see [AI_PLAY_REVIEW.md](AI_PLAY_REVIEW.md); on dev (31d1f930) and staging (migrated vps_dev_saas, browser-checked), not main** (owner decisions in §8). Anything the run finds
undecided is taken at a safe default and logged in `docs/BACKLOG.md`
§ "Questions for the owner (unattended runs)".

## 1. Goal

1. **One system that knows every move a student plays on any board** in the
   app (live class, puzzles, assignments, tournaments, everywhere), for every
   student, disclosed in the terms and privacy policy (no switch).
2. **Engine review for every student**, on our own server (Stockfish; the data
   never leaves the box).
3. **Outside-AI comments** (an LLM API the owner adds later, free tier) only
   for students who **switched it on**; once on, their past play is included.
4. Student, their coach and admins see the review.

## 2. What exists today (audit, 2026-11-24)

| Where the student plays | Stored today | Per-move? | Gap |
|---|---|---|---|
| Puzzles: practice, course, training, class, homework, Smart Revision, Puzzle of the Day (web + WhatsApp) | `puzzle_attempts` (`context`) | yes, `movesJson` + `wrongMovesJson` | none |
| Assignments (solve line, vs engine, analysis, replay) | `student_assignment_attempts` | yes, `movesJson` (+ `elapsedMs`) | none |
| Live class: Playout | `live_class_playout_games` | yes | none |
| Live class: move poll | `live_class_move_poll_answers` | one move | none |
| Live class: MCQ | `live_class_mcq_attempts` | not a board | out of scope |
| Live class: student match, simul | `chess_games` via `GameRecorderService` (`match:`, `simul:`) | yes (PGN) | none |
| Tournaments | `tournament_games` (+ `chess_games` `tournament:` on archive) | yes, + move times | none |
| Student's own games (PGN upload, Lichess/Chess.com sync) | `chess_games` (`ownerId`) | yes | none |
| **Puzzle Storm / Racer** (solo + live class) | `solo_puzzle_rush_runs`, `live_class_puzzle_rush_entries` | **no, totals only** | **gap A** |
| **Live-class main board while a student has control** | `chess_games` `board:` (one game per board) | moves stored, **not credited to the student** | **gap B** |
| Game Library / analysis board exploring | not play | — | out of scope |

`docs/STUDENT_ACTIVITY_HISTORY.md` already reads most of these rows at read
time (no tables of its own); the owner's earlier rule there was **reuse the
records the features already keep, never a parallel copy.**

## 3. Design

### 3.1 Consent for the outside AI only: `AiReviewConsent`
Recording and the engine review need no switch (education purpose, disclosed in
terms/privacy). The switch gates **only** sending play to the outside AI.
- Who switches it on (default, logged as an assumption): the student, in
  settings, after a plain-language dialog that includes a "my parent or
  guardian agrees" confirmation; an admin or the student's coach can also
  switch it on for the student after a parent agrees (recorded as such).
- New table (one row per student per change, append-only history):
  `studentId`, `allowed`, `version` (`AI_REVIEW_CONSENT_VERSION`), `changedById`,
  `changedByRole`, `createdAt`; current state = latest row. Same pattern as the
  coach transcript consent (`transcriptConsentIsCurrent` is the model): bump the
  version when the wording, the processor or retention changes, and the student
  is asked again.
- One rule `outsideAiAllowed(student, academy)` in `@nexa-chess/types`
  (`ai-review.ts`): academy switch on **and** plan feature **and** current
  consent **and** a provider configured.
- Academy switch (admin, off by default) + new plan feature `aiPlayReview`
  (route-required per the SaaS rule, added to Enterprise by migration).
- Web: a card on the student's profile/settings ("Let AI review my play"),
  plain-language consent dialog, withdraw any time; admin/coach see the state
  on the student page. Withdrawal stops sending at once and deletes the stored
  outside-AI comments (engine review stays).
- Privacy export section + `features/legal/content.ts` update: every board move
  is recorded and engine-reviewed for teaching; who sees it; retention; that the
  outside AI gets pseudonymised play only after the switch, and which provider.

### 3.2 One play record: `StudentPlayFeed` (read model + two gap fixes)
- **Read side (no copy):** `play-feed/` module, one service that turns every row
  in §2 into one shape, `PlayItem` (`@nexa-chess/types` `play-feed.ts`):
  `source` (PUZZLE / ASSIGNMENT / PLAYOUT / POLL / MATCH / SIMUL / TOURNAMENT /
  OWN_GAME / RUSH / CLASS_BOARD), `sourceId`, `studentId`, `side`, `startFen`,
  `moves[]` (uci, san, ply, byStudent, correct?, elapsedMs?), `result`,
  `playedAt`, context ids (class, batch, assignment, tournament). Keyset-paged
  newest first (`common/cursor-pagination.ts`), never a silent cap. Raw SQL only
  with `tenantFilter` + `raw-sql-review.spec.ts`.
- **Gap A, Storm/Racer:** store each puzzle's moves on the run/entry
  (additive `movesJson` column, written in the existing claimed update; old
  runs stay totals-only).
- **Gap B, class board:** record who made each move while a student holds
  control (additive per-move `byUserId` in the board game's move metadata, or a
  small `live_class_board_moves` table if the PGN path can't carry it; decided
  in-run from the code, the smaller additive option wins).
- Coach/admin/student see it as a new **"Board play"** tab on the existing
  student progress pages.

### 3.3 AI review (v1)
- **Engine review, every student:** a nightly
  job (`JobLockService.runExclusive`, `runInTenant`) takes their new
  `PlayItem`s, runs the existing Stockfish path (`normalizeUciScore`, White-
  relative) on the student's own moves only, and writes an `AiPlayReview` row
  per item: mistakes/blunders with the better move, missed tactics (reuse
  `game-analysis/tactics`), and a weekly roll-up (themes, accuracy by source).
  New play first; past play (last 90 days) backfilled under a per-night cap.
- Pure rules in `@nexa-chess/types`; versions stored with results (GAME_ANALYSIS
  rule); finished items only; queue is a nudge, the row is the truth.
- **Outside-AI comments:** a provider-neutral adapter (OpenAI-compatible
  chat API: base URL + key + model from env, all unset = off), placed where
  `docs/ai/architecture/` says AI calls go. Input is **pseudonymised**: FEN,
  moves, the engine's findings; never a name, id, batch or academy. Short
  coach-style comments on top of the engine review, stored as
  `AiPlayComment`, for students with the switch on (past play included).
  Tested with a mock provider; no real call in this run. Note for the owner:
  free tiers may use what they're sent to train their models; pick one whose
  terms you accept, and the provider is named in the privacy policy.

## 4. Phases (each = own commit, tests green before the next)

| # | Phase | Done when |
|---|---|---|
| 0 | Branch `feat/ai-play-review` off `dev` (`--no-track`); read API_DEVELOPMENT_RULES, SAAS_MULTI_TENANCY, PRIVACY rules | branch exists |
| 1 | Outside-AI switch: table + migration, `outsideAiAllowed`, plan feature, academy switch, API routes, student card + dialog, admin/coach view, privacy export, terms/privacy text for recording + engine review + outside AI | unit + access specs; cross-user row in `cross-user-access.int-spec.ts` |
| 2 | Play feed read side: `PlayItem` contract, service over all §2 sources, routes (mine / by student), "Board play" tab | specs per source; raw SQL reviewed; int test on `nexa_gen_int` |
| 3 | Gap A (Storm/Racer moves) | spec: moves land in the claimed update; old rows still read |
| 4 | Gap B (class board move credit) | spec: student-control moves carry the student, coach moves don't |
| 5 | Engine review job + `AiPlayReview` + student/coach/admin view | job spec (idempotent, finished items only, pauses while a class is live, nightly cap) |
| 5b | Outside-AI adapter + `AiPlayComment` + mock provider | spec: nothing sent without the switch or without a key; pseudonymised payload (no names/ids); withdraw deletes comments |
| 6 | Docs (`docs/AI_PLAY_REVIEW.md`, CLAUDE.md 1–3 lines, BACKLOG), typecheck, lint, unit, integration, web build in a worktree, responsive shots | all green |
| 7 | Staging (owner approved 2026-11-24): merge the branch into `dev`, push `origin/dev`, `nexa restart stage` (applies the migration to `vps_dev`, rebuilds), check `/health`, the student settings card and the Board play tab | staging up; summary written with what landed, what's open, how to roll back |

## 5. Rules the run must not break
- Students are minors: no AI processing without current consent; never send a
  student's name to a model (pseudonymise); Sentry only `user.id` + role.
- Additive migrations only (class A); new model → `PrismaService` getter,
  `tenantId`, privacy export section, retention rule if it grows.
- Never a web build in this checkout (staging serves it); a worktree for builds.
- Never push to `main`, never touch production. The only merge is phase 7's
  branch → `dev`, and only with every check green; otherwise stop at phase 6
  and say why.

## 6. Out of scope
A real outside-AI call (no key yet), parent accounts, MCQ answers, Game Library exploration,
demo-class guests, translating reviews.

## 7. Risks
- Stockfish CPU on the production box: the job runs off-hours with a per-night
  cap and pauses while any class is live (same guard as Phase 3).
- Consent from a minor (§8 Q1).

## 8. Owner decisions (2026-11-24)

| Q | Question | Answer |
|---|---|---|
| 1 | Track everyone or only with a switch | **Mixed**: record + engine-review every student (in terms/privacy, no switch); the outside-AI comments need the switch |
| 2 | What "AI review" means in v1 | **Both**: engine review + LLM comments; the owner adds the LLM API (free tier) later, so it ships off |
| 3 | Past play | **Included** once a student switches the outside AI on (engine review backfills 90 days for everyone, capped per night) |
| 4 | Who sees the review | **Student, their coach, admins** |
| 5 | Where the run may test | **`nexa_gen_int`, a private stack, and staging**: merge into `dev`, migrate `vps_dev`, restart staging at the end |
| — | Who flips the outside-AI switch | Not asked; default: the student with a "parent/guardian agrees" confirmation, or staff after a parent agrees (logged in BACKLOG) |

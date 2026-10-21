# Feedback, games, chat, reminders, revision, analysis, PDF import

> Moved out of [CLAUDE.md](../CLAUDE.md) on 2026-10-17 to keep that file
> under the context limit; the text is unchanged. `§` numbers refer to
> CLAUDE.md, which keeps a short summary under the same number.

## 3.6i Coach feedback & ratings

`apps/api/src/feedback/` + `apps/web/src/features/feedback/`, pages
`/admin/feedback` and `/coach/feedback`, routes `API_ROUTES.feedback.*` /
`.adminFeedback.*`. Admin-authored `FeedbackForm`s (questions as a JSON array of
`FeedbackQuestion` with stable ids) decide **when** a student is asked
(`trigger`: `AFTER_CLASS` every Nth attended class per coach / `RECURRING` every
N days per coach / `ONE_TIME`) and **where** (`placements`: `CLASS_END` on
`ClassSummary`, `DASHBOARD_POPUP`, `DASHBOARD_CARD` — both on `/student`).

- **Pending is computed, never stored.** `computePendingFeedback`
  (`feedback-pending.util.ts`, pure + unit-tested) derives open requests from
  live forms, the student's attended COMPLETED batch classes and existing
  responses. `contextKey` names what a response answers: `class:<id>`,
  `period:<n>`, `once`.
- **Submit/skip never trust the client's target** — `resolveOwnCandidate`
  recomputes pending and requires an exact match. The unique
  `(formId, studentId, coachId, contextKey)` is the double-submit guard (P2002 →
  409).
- `FeedbackAnswer` snapshots the question label/type at submit time;
  `FeedbackResponse.overallRating` is the mean of its RATING answers, and the
  coach rating is the mean of those. Coaches only see responses from
  `showToCoach` forms, with the student stripped (`toResponseDto(row, true)`).
- A form with responses cannot be deleted (FK is `Restrict`) — it is
  deactivated. None of these models are soft-deletable or Trash-registered.
- Shared types, labels and `averageRating` live in `@nexa-chess/types`
  (`feedback.ts`).

## 3.6k1 Move tree, variations & Game Library

`packages/types/src/move-tree.ts` (pure, chess-library-free; callers pass a
`MoveTreeChessFactory` — `apps/web/src/lib/moveTreeChess.ts` /
`apps/api/src/common/chess/move-tree-chess.ts`, both the castling-sanitised
wrapper) is the one branching tree: `children[0]` is the main line, a move that
differs from the existing continuation **adds a variation, never truncates**;
only `promoteToMainline` reorders, and it keeps every line. PGN with
variations/comments/NAGs round-trips via `moveTreeToPgn` /
`parsePgnToMoveTree` (`MAX_MOVE_TREE_NODES`).

- **Board store** (`createBoardStore.ts`) holds the tree + `treeLinePath` /
  `historyIndex` cursor + `gameId`. Live sync / board snapshot carry optional
  `treePgn` / `treeLinePath` / `gameId` / `savedAt`; old clients still read the
  current line from `pgn`. `MoveTreeView` + `MoveHistory` render it; promote /
  delete / comment are coach/staff only (AlertDialog confirm).
- **Game Library** (`apps/api/src/game-library/`, `features/game-library/`,
  pages `/games` + `/games/[id]`, routes `API_ROUTES.games.*`): `ChessGame`
  rows (`source` LIVE_BOARD / SIMUL / MATCH / IMPORT). `GameRecorderService`
  copies class games in fire-and-forget (match/simul moves, the board-state
  save, class end → `completeClassBoardGames`) — a library failure never fails
  a move. Idempotent on unique `sourceKey` (`match:<id>`, `simul:<id>`,
  `board:<session>:<gameId>`), ordered by `sourceRevision` so an older write
  can't overwrite newer moves. Visibility (`visibilityWhere`): admin all; coach
  own / their class / their batch / played; student own games + LIVE_BOARD games
  of classes they attended (not ABSENT). Saving analysis is coach/admin, only
  once COMPLETED, same start FEN, optimistic `version` (409 on a stale one).
  Only IMPORT games are deletable (importer or admin). Not soft-deletable.

## 3.6k1b Setup Position & set-up only positions

**Setup Position opens in place, not in a dialog.** While the board store's
`isSetupPositionOpen` is set, `SetupPositionWorkspace`
(`features/chessboard/components/layout/`) takes the main board's spot —
`BoardWorkspace` swaps it for the board column (phones also hide the sidebar),
`ClassroomBoard` (coach only) hides its board column (kept mounted so the
side-column `ResizeObserver` survives) and renders the workspace there. The
set-up board starts from the main board's FEN and orientation; nothing reaches
the board — or the class — until **Load Position** (`pushHistory`). Tabs: Setup
Position, Load Game (PGN), From PDF (live class only). Escape drops the selected
tool first, then closes. While open, `useBoardShortcuts`, the coach's Space
(engine move) and the puzzle share/load keys are off.

**`PositionEditor` tools** (every consumer: setup, puzzle form, assignment form,
PDF review): tap a spare piece to select it (`aria-pressed`, stays selected),
then tap — or drag across — squares to place it; **Remove** erases the same way;
**Move** (or tapping the selected piece again, or Escape) goes back to plain
dragging. Hold-and-drag from the tray (`dragNewPiece`, now on `pointerdown`) and
dragging pieces off the board still work. Board presses with a tool selected are
caught by native capture listeners before chessground sees them (`touchstart`
non-passive, so no scroll). `emit` updates `partsRef` synchronously so rapid taps
never build on a stale placement.

**Legality is not checked while setting up.** `readSetupFen` (`@nexa-chess/types`
`chess-fen.ts`, pure) rejects only notation that isn't a board (wrong rank
count/length, bad side/castling/en-passant/counters) and reports everything else
as `issues`: no king / several kings of a colour, a pawn on the first or last
rank, the side not to move in check. Web `inspectFen` (`lib/fen.ts`) adds
chess.js's own verdict, so "no issues" always loads into chess.js. The editor
shows the verdict under the FEN field. A position with issues loads as a
**set-up only** position: the board store keeps the FEN exactly (`fen` =
`tree.rootFen`, no moves) and sets `positionIssues`; `makeMove` /
`applyRemoteMove` refuse, chessground gets no movable colour or check marker,
Stockfish / Masterbase / the engine move stand down, and `SetupOnlyNotice` says
why. Normal games never see any of this (`positionIssues` is empty and every
legality check is unchanged). `moveTreeForFen` is the tolerant FEN → tree path
used by `pushHistory`, `setFen`, `syncFromRemote` and chapters, so students,
reloads and chapter restores accept the position too; an empty-move board is
not recorded in the Game Library. Load Game (PGN) stays strict — a game needs
legal moves. Tests: `apps/api/src/common/chess/setup-fen.spec.ts`,
`e2e/analysis-board.spec.ts`.

## 3.6k2 Persistent chat (outside live classes)

`apps/api/src/chat/`, `features/chat/`, page `/messages` (all roles), routes
`API_ROUTES.chat.*`, contract `packages/types/src/chat.ts`. Separate from the
in-class LiveKit chat (§3.7). `Conversation` (`BATCH` one per batch, created
lazily on first list / `DIRECT` keyed by sorted `directKey` / `GROUP`
coach-made) + `ConversationMember` (read state; `leftAt`) + `ChatMessage`.

- **`directChatAllowed` is the single rule**: never student ↔ student; coach ↔
  student only while they share a batch; staff ↔ anyone; no coach ↔ coach. The
  API, the contact picker and the tests share it.
- BATCH threads follow the live roster — a student sees history from their
  `enrolledAt`, a removed one loses access; a GROUP member sees from `joinedAt`.
  A DIRECT thread stays readable but `canSend: false` once the shared batch is
  gone. Groups are coach-created (students in the coach's batches only);
  owner or admin edits members, the owner can't be removed.
- **Sends are idempotent** on unique `(senderId, clientId)` — the web client
  generates the id once and reuses it on Retry.
- **No websocket**: the web polls (open thread 4s, list 15s, sidebar unread 30s;
  paused while the tab is hidden). The unread badge on the Messages nav link
  is `useChatNavBadge()` in all three sidebars.
- Not soft-deletable, not Trash-registered, not in `RETENTION_RULES` (chat is a
  business record — retention is a policy decision).

## 3.6k3 Assignment due-date reminders

`packages/types/src/assignment-reminders.ts` —
`resolveAssignmentDueStatus({ dueDate, completed }, now, timeZone)` is the one
rule (COMPLETED / OVERDUE / DUE_TODAY in the viewer's own calendar day /
DUE_SOON within `ASSIGNMENT_DUE_SOON_HOURS` / UPCOMING). `DueBadge` uses it too,
so finished work is never shown as overdue.

- `AssignmentReminderService` (read-only, nothing stored):
  `GET assignments.reminders` (student: own unfinished work, overdue up to
  `ASSIGNMENT_OVERVIEW_PAST_DAYS` back → due soon) and `GET
  assignments.overview` (coach: own batches; admin: all; due dates from
  30 days back to `ASSIGNMENT_OVERVIEW_AHEAD_DAYS` ahead; `batchId` /
  `dueStatus` filters; outstanding students per deployment). Both routes are
  declared before the `:id` routes in the controller.
- Web: `AssignmentReminderBanner` + `AssignmentReminderPopup` (once per tab
  session, `sessionStorage` `nexa-assignment-reminder-shown`, only for overdue
  / due today) on the student dashboard; the sidebar Assignments link shows the
  count (red while anything is overdue). Coach `/coach/assignments` and admin
  `/admin/assignments` have a "Due dates" tab (`AssignmentOverviewPanel`). The
  coach also gets the `ASSIGNMENT_OVERDUE_COACH` notification (§3.6e).

## 3.6k3b Smart Revision (spaced repetition)

`packages/types/src/revision.ts` (pure scheduler + contract), `apps/api/src/revision/`,
`features/revision/`, page `/student/revision`, dashboard card, and the **Revision**
tab of `StudentProgressWorkspace` (student / coach / admin), routes
`API_ROUTES.revision.*`. Full rules: [docs/SMART_REVISION.md](docs/SMART_REVISION.md).

- A `RevisionItem` (unique `(studentId, contentKey)`, `puzzle:<id>` / `topic:<id>`)
  **references** a puzzle or a folder, never copies one. A review is an ordinary
  `PuzzleAttempt` with `context: REVISION`, graded on the normal attempt routes —
  `RevisionService` only picks, opens (`next`) and schedules (`review`).
- `scheduleRevision` is the one schedule (Again 10 min, 2nd Again in a local day →
  tomorrow; Hard/Good/Easy 1/3/7 days, then ×1.2 / ×ease / ×ease×1.3; due dates
  snap to local midnight in `User.timezone`). **The grade is capped by the graded
  attempt** (`allowedRevisionGrades`: a miss is Again, a hint or wrong move caps at
  Hard) — the API refuses anything higher.
- MISTAKE items are seeded on read (`syncMistakes`) from attempts that show one
  (failed after trying, or solved with a wrong move — a hint alone is not), never
  from a homework set still open. Coach recommendations: `assertCanViewStudent`
  scope, the student must be able to open the puzzle and the coach to see it;
  only the recommending coach or an admin removes one.
- `next` opens under the item's row lock (`FOR UPDATE`), `review` claims with
  `updateMany where currentAttemptId = attemptId`, and `revision_reviews.attemptId`
  is unique — a double click or replay never opens or schedules twice. **A rating
  is never inferred**: a finished, unrated review stays open with
  `pendingRating` (server-computed allowed grades) until the student rates it.
- MISTAKE seeding is batched (`MISTAKE_BATCH` per call, all filters in SQL incl.
  "no item yet"), so a long history is covered across loads — never a full scan
  that drops older misses.
- Not soft-deletable, not Trash-registered (Cascade with the puzzle/folder/student).

## 3.6k3c Game analysis, tactics, game sources, game insights

Method: [docs/GAME_ANALYSIS.md](docs/GAME_ANALYSIS.md) (incl. the benchmark);
imports: [docs/GAME_SOURCES.md](docs/GAME_SOURCES.md); parents: deliberately
deferred — [docs/PARENT_REPORTS.md](docs/PARENT_REPORTS.md). Shared rules in
`packages/types/src/game-analysis*.ts`, `game-tactics.ts`, `game-sources.ts`;
API `apps/api/src/game-analysis/`, `game-sources/`, `stockfish/`; web
`features/game-analysis/`, page `/student/insights`, the Engine analysis panel on
`/games/:id`, the "Games" tab of the progress workspace. Routes
`API_ROUTES.gameAnalysis.*`, `.gameInsights.*`, `.gameSources.*`, `.games.importPgn`.

- **Evaluations are White-relative** (`Evaluation`: cp, or mate with a `winner`).
  UCI scores are side-to-move; convert only with `normalizeUciScore`, view a
  player's side only through `winPercent` / `evaluationForSide`. Mate is never a
  big cp number. `classifyMove` / `classifyGame` / `sideAccuracy` /
  `detectGameTactics` are the one implementation; their versions
  (`nexa-classify-v1`, `nexa-accuracy-v1`, `nexa-tactics-v1`) are stored with
  every result and insights never combine different versions. A provisional or
  shallow score is UNCLASSIFIED, never guessed. Never present these as
  Lichess / Chess.com figures.
- **Engine pool lanes**: every existing caller is `interactive`; per-game
  analysis is `background` (taken last, at most `poolSize − 1` engines, one
  thread). `searchLines` adds MultiPV and `searchmoves` (written last on the
  `go` line) and resets MultiPV to 1 afterwards.
- **The `game_analyses` row is the job** (no Redis): `GameAnalysisWorker` claims
  with `FOR UPDATE SKIP LOCKED`, heartbeats, checkpoints `engineJson` (a retry
  resumes), finishes only while `claimedAt` (ms precision) is still its own;
  stale runs are re-queued (job lock `game-analysis.stale-sweep`).
  `GAME_ANALYSIS_WORKER=false` only queues (the integration env sets it).
- **Only a finished game is analysed** — never assistance mid-game. A student
  may request analysis only of games they played or own; 20/day.
- **A tactic needs a concrete gain in the engine line** (mate ≤ 5 or ≥ 2 pawns
  over the pre-blunder baseline) and a jump in expected score, and a board
  pattern is only credited when the line cashes it in.
- **A student's game puzzle (`PuzzleSource.GAME`) opens for its `ownerId`
  only**: hidden system folder `__game_analysis`, excluded from every coach
  library / share / queue / chapter / homework path and from training. Created
  only on request, only from a MISSED tactic with a verifiable answer
  (`revisionEligibility`).
- Student uploads and linked-account imports set `ChessGame.ownerId`; a coach
  of the owner's batch sees them (Game Library visibility). Online import
  (`EXTERNAL_GAME_IMPORT_ENABLED`, off by default) stores a username only, needs
  a verified link (code in the public profile), and reads only the providers'
  public APIs.

## 3.6k4 PDF chess-diagram import

`@nexa-chess/types` `diagram-recognition.ts` (pure image processing on a
grayscale page: `detectDiagramBoards` → `recognizeDiagramBoard`, orientation /
side-to-move helpers) + `diagram-position.ts` (`validateDiagramPosition`:
errors block, warnings need the coach; takes a chess.js probe) +
`diagram-piece-templates.ts` (**generated** — `scripts/diagram-import/`); web
`features/diagram-import/`, pages `/coach|admin/puzzles/import-pdf`, and the
"From PDF" tab of `SetupPositionWorkspace` (only when `pdfImport` is passed —
`ClassroomBoard` does, for the coach; lazy-loaded).

- **The PDF never leaves the browser.** No upload route, no storage, nothing to
  clean up server-side. pdf.js loads from `public/vendor/pdfjs/` via a
  `webpackIgnore`'d `import()` (`apps/web/scripts/copy-pdfjs.mjs`, run on
  `predev`/`prebuild`) — **don't bundle it**: Next's webpack rewrites the
  `__webpack_require__` inside pdf.js's own build ("Object.defineProperty called
  on non-object"). Limits live in `PDF_IMPORT_LIMITS` (`lib/pdf.ts`).
- **A diagram is pieces only.** Side to move, castling, en passant and the move
  counters are never assumed: `CandidateReview` holds null/unaccepted until the
  coach answers (a caption like "White to move" or printed coordinates may
  pre-answer, and the UI says where it came from). Status is
  `DiagramCandidateStatus`; only `confirmed` positions reach any action, and any
  edit withdraws the confirmation.
- **Uses existing paths only**: analysis board = a private Game Library import
  (`games.import` accepts a set-up FEN with no moves); class board =
  `pushHistory` behind a replace confirmation; library = the New-puzzle form
  prefilled through a 10-minute `localStorage` handoff (`lib/handoff.ts`) — the
  coach adds solution/topic/difficulty and saves; duplicates are warned via the
  puzzle list's `placement` filter (inside the caller's visibility).
- Recognition is measured, not promised: see the spec header in
  `apps/api/src/common/chess/diagram-recognition.spec.ts`. Every misread on the
  fixtures is flagged for review; an unseen book font is less reliable.
  `PositionEditor` re-reads chessground's cached bounds on every drag start —
  content shifting above a mounted board otherwise drops pieces on the wrong
  square.

## 3.6l Privacy (personal data export)

`apps/api/src/privacy/` + `apps/web/src/features/privacy/`, Profile → "Your
data", route `API_ROUTES.privacy.dataExport` (throttled 3/min). Returns
`PersonalDataExport` (`@nexa-chess/types` `privacy.ts`, `format:
"nexa-personal-data/v1"`): the caller's account plus one array per kind of
record they own, dates as ISO strings. **Secrets never leave**: password hash,
MFA secret, session/reset token hashes, order idempotency keys and invoice
storage internals are omitted, and staff actions on other people's records are
out of scope. **A new model that stores personal data about a user gets a
section here.** The cross-user suite asserts an export names none of side B's
ids and no secret field.

**Account deletion requests** (`account-deletion.service.ts`, Profile → "Delete
account", admin page `/admin/privacy`, routes `API_ROUTES.privacy.deletionRequest`
/ `.withdrawDeletionRequest` / `API_ROUTES.adminPrivacy.*`): the user asks with
their password (400 if wrong, throttled 5/min); a hand-written partial unique
index allows one `PENDING` `AccountDeletionRequest` per user (P2002 → 409).
Admins (`ADMIN`/`SUPER_ADMIN`) complete or decline (a decline needs a note); both
are status-filtered `updateMany` claims, so a double click is a 409.
**Completing goes through `UserService.deleteAs`** — the same soft delete,
rank rules and no-self-delete check as Admin → Users — so the account is
restorable from Trash for 30 days and financial history is kept by the purge.
The row snapshots email/name/role and its `userId` is `SetNull`, so the record
that a deletion was honoured outlives the purged account. Admins are emailed
(`ADMIN_EMAILS`) on a new request and the user on the outcome, best-effort.
Not soft-deletable, not Trash-registered.

**`/privacy` and `/terms`** are public server pages built from one file,
`features/legal/content.ts`. Its factual sections (what is collected, who it
is shared with, retention) must stay true to the code — **a feature that
stores new personal data or adds a processor updates it**. Sections with
`pending` are placeholders for reviewed legal wording; while `LEGAL_DRAFT` is
true the pages show a draft banner and are `noindex`.

## SEO & AI search (GEO)

The public pages are `/` and `/academy` (the marketing site); everything signed-in
is disallowed in `robots.ts`.

- **One source of facts**: `apps/web/src/features/academy/content.ts` — name and
  alternate names, contacts, programs (also rendered by `ProgramsSection`), class
  formats, the FAQ and `ACADEMY_SOCIAL_PROFILES`. The visible FAQ (`FaqSection`),
  the JSON-LD and `/llms.txt` all read it. Only facts the site shows go here:
  structured data that doesn't match visible content breaks Google's spam policy,
  and AI answers quote it verbatim.
- **JSON-LD** (`lib/structuredData.ts`): `homeJsonLd()` on `/`, `academyJsonLd()`
  on `/academy` — `EducationalOrganization` (`#organization`, the same `@id`
  everywhere so there is one entity), `WebSite`, `WebPage`, one `Course` per
  program and an `FAQPage` matching the visible FAQ. `jsonLdScript()` escapes `<`.
  No review/rating markup: Google ignores self-serving reviews for organizations.
  Add the academy's official profiles to `ACADEMY_SOCIAL_PROFILES` → `sameAs`.
- **`/llms.txt`** (`app/llms.txt/route.ts`, static): the llmstxt.org markdown brief
  for AI assistants.
- **robots.txt** names the search / AI-answer crawlers (Googlebot, Bingbot,
  GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Applebot, Google-Extended …) as
  allowed, with the same private paths as `*`. Blocking any of them removes the
  site from that assistant's answers.
- **Sitemap**: `/academy`, `/`, `/register`, `/login`; `/privacy` and `/terms` join
  once `LEGAL_DRAFT` is false (they're `noindex` while drafts).
- **Titles**: keyword first, brand last, ≤ 60 chars; descriptions ≤ 155 chars.
  `/academy` uses `title.absolute` — the root template would add "| Nexa Chess".
- **Share images**: `app/opengraph-image.tsx` and `app/academy/opengraph-image.tsx`
  (1200×630, `lib/ogImage.tsx`, rendered at build from the logo).
- **One host**: `next.config.mjs` 308-redirects `www.<site>` to the apex derived
  from `NEXT_PUBLIC_SITE_URL` (nginx passes `Host`).
- **Verification**: `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` /
  `NEXT_PUBLIC_BING_SITE_VERIFICATION` (build-time) render the meta tags.


# Puzzles, puzzle-set homework & student progress

> Moved out of [CLAUDE.md](../CLAUDE.md) on 2026-10-17 to keep that file
> under the context limit; the text is unchanged. `§` numbers refer to
> CLAUDE.md, which keeps a short summary under the same number.

## Puzzle Library (from §3.7)

- **Puzzle Library** (`apps/api/src/puzzle/`, `apps/web/src/features/puzzles/`, routes `API_ROUTES.puzzles.*`): a standalone catalogue of reusable chess-training objects (position + solution line + topic + type + difficulty + ownership + lifecycle). `PuzzleTopic` (admin-authored only) → many `Puzzle`; both are soft-deletable and registered in the Trash module. **Topics are nested folders** (`parentId`, max `MAX_PUZZLE_TOPIC_DEPTH`): use the shared tree helpers in `packages/types/src/puzzle.ts` (`buildPuzzleTopicTree`, `collectPuzzleTopicSubtreeIds`, `puzzleTopicPath`); a `topicId` list filter includes subfolders unless `topicScope=direct`; archive/reassign act on the whole subtree (`TrashRepository.softDeleteGroup`, one `deleteGroupId`, so restoring any folder brings the group back); a topic whose parent is gone renders at the top level. **Copy** (`API_ROUTES.puzzles.copyTopic`, admin, `PuzzleTopicService.copy`) deep-copies a folder's subtree and live puzzles under a new parent, keeping author/visibility/status (a Lichess puzzle's copy becomes `NEXA`, sourceId cleared); the library's Folders tab offers Copy / Cut / Paste, and folders there start collapsed. `Puzzle.visibility` is `GLOBAL` (admin-authored, every coach sees it) or `PRIVATE` (coach-authored, author + admins only) — the service **forces coaches to PRIVATE** and admins to `GLOBAL` by default; a coach can never publish `GLOBAL` and `canManage` blocks a coach editing an admin puzzle. Lifecycle `status` is `DRAFT`/`PUBLISHED`/`ARCHIVED` (reversible toggles), distinct from the Trash soft delete. **Server move evaluation reuses `AssignmentEvaluationService`** (`normalizeSolution`, `evaluateSolveLine`, `solveLineFeedback`) — exported from `AssignmentModule`, injected into `PuzzleService` / `PuzzleAttemptService` — so there is exactly one SOLVE_LINE engine. **Any mate wins** on a line that itself ends in mate: `isAcceptedMateAlternative` (assignment-evaluation.service.ts) is the only place that decides it, mirrored in `puzzleSolverEngine.ts` — both run `SOLVE_LINE_MATE_FIXTURES` from `@nexa-chess/types`, so change them together. `puzzles.title` carries the ICU `natural_sort` collation (migration only — Prisma can't express it), so a title `orderBy` is natural order in SQL; don't reintroduce an in-memory sort. **Content identity**: `Puzzle.contentHash` = `puzzleContentHash(fen, solution)` (`puzzle/puzzle-content-hash.ts`, key from `puzzleContentKey` in `@nexa-chess/types`) — every write path that sets `fen` or the solution must set it (create, update, duplicate, seed, later materialise); the migration's SQL backfill builds the same key and `puzzle-content-hash.int-spec.ts` keeps the two equal. Indexed, never unique. **Origin**: `source` (`NEXA` / `LICHESS`) + `sourceId`, unique across soft-deleted rows; a `LICHESS` puzzle's position and line can't be edited (duplicate it — the copy is `NEXA`). `PuzzleAttempt.context` (`DIRECT` / `LIVE_CLASS` / `TRAINING`) is set by the server at `start`. The Lichess catalogue itself is `LichessPuzzle` / `LichessCatalogueRelease` (source data, written only by `scripts/lichess-puzzles-load.sh` from a release built off-box by `npm run puzzles:prepare -w apps/api` — README § "Lichess Puzzle Catalogue"; no FKs, excluded from backups) with its theme vocabulary in `LICHESS_THEMES` — see `docs/PUZZLE_CATALOGUE_IMPLEMENTATION_SPEC.md`; `Batch.puzzleTrainingEnabled` is the per-batch training switch (on by default, BatchForm → "Puzzle Training"). **Catalogue routes** (`puzzle-catalog.service.ts`, `API_ROUTES.puzzles.catalog*`, staff + coach): browse (keyset, no totals, **never a solution** — only `catalogPreview` returns one), `catalogMaterialise` (copy into the hidden system folder, slug `LICHESS_FOLDER_SLUG`) and `catalogAdopt` (admin, into a curated folder). Every copy goes through `PuzzleCatalogService.materialise` — one row per Lichess id, ever. `PuzzleService.list` hides the system folder unless it is the `topicId` asked for. Catalogue SQL runs in a transaction with `SET LOCAL statement_timeout` **and** `plan_cache_mode = force_custom_plan` (Prisma's prepared statements otherwise drift onto a generic plan); keep both on any new catalogue query. Web: `features/puzzles/components/catalog/CatalogBrowser` — the library's "Lichess catalogue" tab (admin selects + "Add to folder"; "Create homework" fetches the preview and prefills `AssignmentFormDialog` via `initialSolutionMoves`) and, as `variant="compact"`, the share dialog's "Lichess catalogue" tab (materialise, then the ordinary assign; it never moves the Ask / Load next cursor). Folder pickers drop the system folder with `isLichessFolder`; `PuzzleForm` hides the position/solution editors for a `LICHESS` copy. Auth is the token-string pattern via `puzzle-auth.helper.ts` (`authenticateUser` / `assertAdmin` / `assertStaffOrCoach` / `assertStudent`), no guards. **There is no student puzzle library page** (`/student/puzzles` redirects to `/student/practice`) — puzzles reach a student when a coach shares one in class, through a course module (`/student/puzzles/[id]`), or through **rated training** (`/student/training`, `PuzzleTrainingService`, `API_ROUTES.puzzles.training` / `.trainingNext`): the server picks one puzzle at a time near the student's rating with the pure policy in `@nexa-chess/types` `puzzle-training.ts` (slot cycle WEAK/EXPLORE/MIXED/REVIEW, form-adjusted target, per-slot rating offset), walks the Lichess catalogue (unseen by `contentHash`, through `materialise`) and falls back to the visible library, then opens a `TRAINING` attempt that `PuzzleAttemptService.start` resumes — solving uses the ordinary attempt routes, so rating/streak need nothing new. Skipping an unfinished training puzzle closes it as a rated miss. Spec §12. The API still scopes what a student may open: students see `PUBLISHED` `GLOBAL` puzzles plus `PUBLISHED` `PRIVATE` puzzles whose author coaches one of their batches; `PuzzleAttempt` rows are server-scored. Web: `PuzzleForm` (position via `PositionEditor`, solution via the shared `SolutionEditor`), `PuzzleSolver` (built on `PracticeBoard`, client-side prefix-match for the coach preview, server-backed for student attempts). **Multi-game PGN import**: library → "Import PGN" (`PuzzleImportDialog`) turns every game into a puzzle via `POST /puzzles/import` (`API_ROUTES.puzzles.import`, max `MAX_PUZZLE_IMPORT`, per-item failures reported, not fatal). Parsing is `parsePgnGames` in `features/assignments/lib/importLine.ts` — it splits games, strips the BOM, and repairs ChessBase's `0 0` FEN counters (chess.js rejects a fullmove of 0); a game with no moves imports as a DRAFT.

## 3.6i2 Puzzle-set assignments (multi-puzzle homework)

`activityType: PUZZLE_SET` on the existing `Assignment` (README § Features has
the routes). The set is ordered `AssignmentPuzzle` rows that **reference**
library puzzles (Cascade on a Trash purge, like `PuzzleAttempt`), each with its
resolved `PuzzleScoring` frozen at save. Students solve through ordinary
`PuzzleAttempt`s (`context: ASSIGNMENT`, `studentAssignmentId`), so
`PuzzleAttemptService` stays the only puzzle attempt engine — it calls
`AssignmentPuzzleSetService.startContext` / `refreshRollup` /
`assertHintsAllowed` for those attempts, and an assignment admits its puzzles
without the library visibility check.

- **Points are never stored.** `computePuzzleSetResults`
  (`assignment/puzzle-set-results.util.ts`, pure + specced) takes each puzzle's
  best finished try (ABANDONED never counts), sums them, ranks, and
  `studentLeaderboardView` applies the set's leaderboard options server-side.
  `refreshRollup` *recomputes* the `StudentAssignment` columns — never
  increments — so a replayed submit can't double-count.
- Authoring rules (`resolvePuzzles`): published only; an admin set (a shared
  library item) holds GLOBAL puzzles only; a coach may add GLOBAL or their own
  PRIVATE ones.
- One open attempt per (studentAssignmentId, puzzleId) is a hand-written partial
  unique index (migration `20261011100000`), and `submit` claims the attempt
  with `updateMany where status = IN_PROGRESS` (409 on a second submit).
- Web: `features/assignments/components/puzzle-set/*` — `PuzzleSetEditor`
  (form), `PuzzleSetResults` (coach dialog), `StudentPuzzleSet` +
  `AssignmentPuzzleSolver` (reuses `usePuzzleAttempt` with the set's start
  route) + `PuzzleSetLeaderboard`.
- **Assigning from the library is a PUZZLE_SET** — one puzzle or many, it is
  the same referenced set (never a copied SOLVE_LINE). Two doors, one dialog:
  "New assignment" opens on a source choice (Academy Library puzzles vs. build
  an activity), and the Puzzle Library has row checkboxes (selection kept
  across tabs/pages, in pick order) + a per-row and bulk "Assign" that open
  `AssignmentFormDialog` with `initialPuzzles` (assign-now on, title/difficulty
  prefilled). `assignBlocker` in `PuzzleLibraryClient` mirrors the API rule:
  published only, and an admin's set global only. `PuzzleQuickPreviewDialog`
  (board + stepped solution + tags) serves both. Targets are still batches
  only — there is no per-student or group deployment.
- **Homework-approved folders** (Super Admin only, academy-wide): approval is
  `PuzzleTopic.homeworkApprovedAt/ById` — on the folder, never per coach, so a
  coach who joins later is covered and adding coaches resets nothing. Routes
  `API_ROUTES.puzzles.topicHomework` (GET set / PUT approve / DELETE revoke;
  `PuzzleTopicService` → `AssignmentPuzzleSetService.folderHomework`). One rule,
  `folderHomeworkBlocker` in `@nexa-chess/types`: approved, not a system folder,
  no live subfolders, 1–`MAX_ASSIGNMENT_PUZZLES` live PUBLISHED GLOBAL puzzles
  filed directly in it. The API applies it on approve, on `create` with
  `sourceTopicId` (the server takes the puzzles — a client `puzzleIds` beside it
  is a 400) and on **every `deploy`** of a set with `Assignment.sourceTopicId`
  (403 once revoked). Editing such a set's puzzle list detaches it (sets
  `sourceTopicId` null). Web: the Homework column in `TopicManager` (Super Admin
  approve/revoke, on `/admin/puzzles` — `/coach/*` is COACH-only) and
  `AssignFolderDialog` in `PuzzleLibraryClient` (coach, `/coach/puzzles` Topics
  tab) → `AssignmentFormDialog` with `sourceFolder`.

## Student progress (from §3.7)

- **Student progress** (`apps/api/src/progress/`, `features/progress/`, routes `API_ROUTES.progress.*`, page `/student/progress`, coach → Students → progress icon): a puzzle rating (Elo against the puzzle's own `rating`, else a fixed rating per difficulty via `puzzleOpponentRating`, maths in `@nexa-chess/types` `progress.ts`) and a daily practice streak. `ProgressRecorderService` is called fire-and-forget from `PuzzleAttemptService.submit` and `AssignmentAttemptService.submit` and never throws. Only the **first finished attempt at each puzzle** is rated (unique `(studentId, puzzleId)` on `puzzle_rating_changes`), so retries can't farm rating; a clean solve scores 1; hints *or* exactly one wrong move ½; hints plus a wrong move, or two or more wrong moves, 0 (D1, softened 2026-10-04 — `PuzzleAttempt.wrongMoves`, server-counted). History is never recalculated. The streak day is the student's own `User.timezone` day; `lastActiveDay` is `@db.Date` and the shown streak drops to 0 once a day is missed (`liveStreak`). A coach only sees students in a batch they coach. **Activity history + summary** (`API_ROUTES.progress.history`/`.summary`, `…Mine`; pages `/coach/students/[studentId]`, `/admin/students/[studentId]`, tabs on `/student/progress`) is a read model over existing attempt/answer rows — no table of its own: `activity-history.sql.ts` groups retries per (setting, puzzle) so a queue-run or re-shared class puzzle is one entry, accuracy is per graded attempt, a student never sees an unrevealed question's result. Definitions: `docs/STUDENT_ACTIVITY_HISTORY.md`.

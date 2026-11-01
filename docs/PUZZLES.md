# Puzzles, puzzle-set homework & student progress

> Moved out of [CLAUDE.md](../CLAUDE.md) on 2026-10-17 to keep that file
> under the context limit; the text is unchanged. `§` numbers refer to
> CLAUDE.md, which keeps a short summary under the same number.

## Puzzle Library (from §3.7)

MCQs and Playouts share this library's folders, list and queue: [PUZZLE_ACTIVITIES.md](PUZZLE_ACTIVITIES.md).

- **Puzzle Library** (`apps/api/src/puzzle/`, `apps/web/src/features/puzzles/`, routes `API_ROUTES.puzzles.*`): a standalone catalogue of reusable chess-training objects (position + solution line + topic + type + difficulty + ownership + lifecycle). `PuzzleTopic` (admin-authored only) → many `Puzzle`; both are soft-deletable and registered in the Trash module. **Topics are nested folders** (`parentId`, max `MAX_PUZZLE_TOPIC_DEPTH`): use the shared tree helpers in `packages/types/src/puzzle.ts` (`buildPuzzleTopicTree`, `collectPuzzleTopicSubtreeIds`, `puzzleTopicPath`); a `topicId` list filter includes subfolders unless `topicScope=direct`; archive/reassign act on the whole subtree (`TrashRepository.softDeleteGroup`, one `deleteGroupId`, so restoring any folder brings the group back); a topic whose parent is gone renders at the top level. **Delete** (`DELETE API_ROUTES.puzzles.topic(id)`, admin, `PuzzleTopicService.remove`) takes the folder *with* everything in it: the subtree's folders (`softDeleteGroup`) and every live puzzle they hold (`TrashRepository.softDeleteManyIntoGroup`, one `updateMany`) share one `deleteGroupId`, so a Super Admin restoring any row from Trash brings the whole folder back; the daily trash sweep purges them after the retention period (`TRASH_RETENTION_DAYS`, 30), puzzles before folders (`TrashService.deleteOrder` puts `PuzzleTopic` last — `puzzles.topicId` is RESTRICT), and a puzzle still referenced elsewhere (an assignment, a course module) is skipped and retried like any trash row. A subtree containing a system folder is refused. Web: the red Delete button on a folder row → `DeleteFolderDialog` (names the subfolder and puzzle counts; no undo toast — Trash is the undo). Tests: `puzzle-topic.service.spec.ts`, `puzzle-folder-delete.int-spec.ts`. **Copy** (`API_ROUTES.puzzles.copyTopic`, admin, `PuzzleTopicService.copy`) deep-copies a folder's subtree and live puzzles under a new parent, keeping author/visibility/status (a Lichess puzzle's copy becomes `NEXA`, sourceId cleared); the library's Folders tab offers Copy / Cut / Paste, and folders there start collapsed. `Puzzle.visibility` is `GLOBAL` (admin-authored, every coach sees it) or `PRIVATE` (coach-authored, author + admins only) — the service **forces coaches to PRIVATE** and admins to `GLOBAL` by default; a coach can never publish `GLOBAL` and `canManage` blocks a coach editing an admin puzzle. Lifecycle `status` is `DRAFT`/`PUBLISHED`/`ARCHIVED` (reversible toggles), distinct from the Trash soft delete. **Server move evaluation reuses `AssignmentEvaluationService`** (`normalizeSolution`, `evaluateSolveLine`, `solveLineFeedback`) — exported from `AssignmentModule`, injected into `PuzzleService` / `PuzzleAttemptService` — so there is exactly one SOLVE_LINE engine. **Any mate wins** on a line that itself ends in mate: `isAcceptedMateAlternative` (assignment-evaluation.service.ts) is the only place that decides it, mirrored in `puzzleSolverEngine.ts` — both run `SOLVE_LINE_MATE_FIXTURES` from `@nexa-chess/types`, so change them together. `puzzles.title` carries the ICU `natural_sort` collation (migration only — Prisma can't express it), so a title `orderBy` is natural order in SQL; don't reintroduce an in-memory sort. **Content identity**: `Puzzle.contentHash` = `puzzleContentHash(fen, solution)` (`puzzle/puzzle-content-hash.ts`, key from `puzzleContentKey` in `@nexa-chess/types`) — every write path that sets `fen` or the solution must set it (create, update, duplicate, seed, later materialise); the migration's SQL backfill builds the same key and `puzzle-content-hash.int-spec.ts` keeps the two equal. Indexed, never unique. **Origin**: `source` (`NEXA` / `LICHESS`) + `sourceId`, unique across soft-deleted rows; a `LICHESS` puzzle's position and line can't be edited (duplicate it — the copy is `NEXA`). `PuzzleAttempt.context` (`DIRECT` / `LIVE_CLASS` / `TRAINING`) is set by the server at `start`. The Lichess catalogue itself is `LichessPuzzle` / `LichessCatalogueRelease` (source data, written only by `scripts/lichess-puzzles-load.sh` from a release built off-box by `npm run puzzles:prepare -w apps/api` — README § "Lichess Puzzle Catalogue"; no FKs, excluded from backups) with its theme vocabulary in `LICHESS_THEMES` — see `docs/PUZZLE_CATALOGUE_IMPLEMENTATION_SPEC.md`; `Batch.puzzleTrainingEnabled` is the per-batch training switch (on by default, BatchForm → "Puzzle Training"). **Catalogue routes** (`puzzle-catalog.service.ts`, `API_ROUTES.puzzles.catalog*`, staff + coach): browse (keyset, no totals, **never a solution** — only `catalogPreview` returns one), `catalogMaterialise` (copy into the hidden system folder, slug `LICHESS_FOLDER_SLUG`) and `catalogAdopt` (admin, into a curated folder). Every copy goes through `PuzzleCatalogService.materialise` — one row per Lichess id, ever. `PuzzleService.list` hides the system folder unless it is the `topicId` asked for. Catalogue SQL runs in a transaction with `SET LOCAL statement_timeout` **and** `plan_cache_mode = force_custom_plan` (Prisma's prepared statements otherwise drift onto a generic plan); keep both on any new catalogue query. Web: `features/puzzles/components/catalog/CatalogBrowser` — the library's "Lichess catalogue" tab (admin selects + "Add to folder"; "Create homework" fetches the preview and prefills `AssignmentFormDialog` via `initialSolutionMoves`) and, as `variant="compact"`, the share dialog's "Lichess catalogue" tab (materialise, then the ordinary assign; it never moves the Ask / Load next cursor). Folder pickers drop the system folder with `isLichessFolder`; `PuzzleForm` hides the position/solution editors for a `LICHESS` copy. Auth is the token-string pattern via `puzzle-auth.helper.ts` (`authenticateUser` / `assertAdmin` / `assertStaffOrCoach` / `assertStudent`), no guards. **There is no student puzzle library page** (`/student/puzzles` redirects to `/student/practice`) — puzzles reach a student when a coach shares one in class, through a course module (`/student/puzzles/[id]`), or through **rated training** (`/student/training`, `PuzzleTrainingService`, `API_ROUTES.puzzles.training` / `.trainingNext`): the server picks one puzzle at a time near the student's rating with the pure policy in `@nexa-chess/types` `puzzle-training.ts` (slot cycle WEAK/EXPLORE/MIXED/REVIEW, form-adjusted target, per-slot rating offset), walks the Lichess catalogue (unseen by `contentHash`, through `materialise`) and falls back to the visible library, then opens a `TRAINING` attempt that `PuzzleAttemptService.start` resumes — solving uses the ordinary attempt routes, so rating/streak need nothing new. Skipping an unfinished training puzzle closes it as a rated miss. Spec §12. The API still scopes what a student may open: students see `PUBLISHED` `GLOBAL` puzzles plus `PUBLISHED` `PRIVATE` puzzles whose author coaches one of their batches; `PuzzleAttempt` rows are server-scored. Web: `PuzzleForm` (position via `PositionEditor`, solution via the shared `SolutionEditor`), `PuzzleSolver` (built on `PracticeBoard`, client-side prefix-match for the coach preview, server-backed for student attempts). **Multi-game PGN import**: library → "Import PGN" (`PuzzleImportDialog`) turns every game into a puzzle via `POST /puzzles/import` (`API_ROUTES.puzzles.import`, max `MAX_PUZZLE_IMPORT`, per-item failures reported, not fatal). Parsing is `parsePgnGames` in `features/assignments/lib/importLine.ts` — it splits games, strips the BOM, and repairs ChessBase's `0 0` FEN counters (chess.js rejects a fullmove of 0); a game with no moves imports as a DRAFT.

- **Folder view, bulk preview & bulk edit** (Topics tab; admins land on it, coaches still land on their puzzle list). A folder's direct puzzle count is a button that opens `features/puzzles/components/folder/FolderPuzzlesPanel` in place of the tree (the tree's expanded state survives Back). It lists only puzzles filed **directly** in that folder (`getFolderPuzzles`: `topicScope=direct`, sorted by title, up to `MAX_BULK_PUZZLE_UPDATE` = 500), so a folder that has both subfolders and puzzles shows its own and leaves the subfolders in the tree; a folder with no direct puzzles has no button. **Preview** is `PuzzleQuickPreviewDialog` with `sequence` (Previous / Next puzzle, "Puzzle 3 of 21", solution, hints and explanation hidden until "Show solution"). It previews the selection when there is one, otherwise the whole folder, and is read-only. **Bulk edit** (`BulkEditPuzzlesDialog` → `POST /puzzles/bulk-update`, `API_ROUTES.puzzles.bulkUpdate`, `PuzzleService.bulkUpdate`): tick the fields to change (move to folder, difficulty, type, status, add / remove tags, find & replace in titles), review, confirm. Only the ticked fields are sent and written. Each puzzle is all-or-nothing and the response lists `skipped` with a reason: not visible, not `canManage`, no longer in `fromTopicId` (stale selection), publishing with no solution, more than `MAX_PUZZLE_TAGS`, or an empty / too-long title. The target can't be a system folder. Status changes follow the single publish/archive routes, and an unchanged status keeps its dates. The selection is limited to the open folder, and ids that leave it on a refetch drop out. No undo toast (policy: confirmed up front, then `BulkResultDialog`). The older `POST /puzzles/bulk` (publish/archive/delete actions) still has no web caller. Tests: `puzzle.service.spec.ts` "bulkUpdate", `puzzle-bulk-update.int-spec.ts`.

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

## Lichess Puzzle Catalogue (import tooling)

The ~6M-puzzle Lichess dump (CC0) loads into `lichess_puzzles` in two stages.
The app only reads it through the catalogue routes below; see
[PUZZLE_CATALOGUE_IMPLEMENTATION_SPEC.md](PUZZLE_CATALOGUE_IMPLEMENTATION_SPEC.md) §13–§14.

**1. Prepare — off the production box** (about 1.75 CPU-hours of chess.js
validation; it runs in parallel worker threads). Needs `zstd` and GNU `sort`.

```bash
curl -fLO https://database.lichess.org/lichess_db_puzzle.csv.zst
npm run puzzles:prepare -w apps/api -- --in lichess_db_puzzle.csv.zst --out ./lichess-release \
  --dump-date 2026-10-01          # optional: --workers N, --sort-mem 2G
```

It writes `./lichess-release/<preparedSha256>/{catalogue.tsv.zst, manifest.json, rejects.tsv}`
and prints the counts. `preparedSha256` is the sha256 of the uncompressed,
sorted TSV and is the release's identity. Every row is validated (§F.3 of the
architecture doc), duplicate content keeps only its most-played row in the
quality gate, and the file is sorted in walk-index order. It exits 1 if more
than 0.1% of rows are rejected; don't load that release. The core logic is
`apps/api/src/puzzle/catalogue/lichess-prepare.core.ts` (unit-tested).

**2. Store the release** (write-once — it is the recovery artifact, because
backups skip the catalogue rows):

```bash
oci os object bulk-upload -ns "$OCI_NAMESPACE" -bn "$OCI_BUCKET_NAME" --no-overwrite \
  --src-dir ./lichess-release/<sha> --object-prefix lichess/<sha>/
```

**3. Load — on the box, off-peak** (about 15–30 min for a full release):

```bash
oci os object bulk-download -ns "$OCI_NAMESPACE" -bn "$OCI_BUCKET_NAME" --prefix lichess/<sha>/ --dest-dir /tmp/lr
scripts/lichess-puzzles-load.sh /tmp/lr/lichess/<sha>/manifest.json
```

The load checks both checksums and that the migration is deployed. It refuses
to start inside the 19:30–21:30 UTC backup window. Before each rating band it
pauses while a class is live, the load average is ≥ 1.5, memory is short or
`/health/ready` is twice its baseline latency. It aborts if the API stays slow
for 15 minutes or the disk runs short. Each band is its own transaction, and an
identical row is never rewritten, so **resume = re-run the same command**. Ids
missing from a newer release are retired (`retiredAt`), and re-appear if a
later release has them again. The run's report is appended to
`lichess-load.log`. Thresholds and the target database are environment
variables documented at the top of the script. To undo: `TRUNCATE
lichess_puzzles` — no `puzzles` row, attempt or rating references it.

**Using it** (`PuzzleCatalogService`, `API_ROUTES.puzzles.catalog*`, admin and
coach only — never students):

- `GET /puzzles/catalog` browses by rating window / themes / opening, in
  walk-index order from a random `seed`, with a keyset cursor and no totals
  ("Load more"). Rows carry **no solution**. Every query runs in a transaction
  with `statement_timeout = 3s` (a timeout is `timedOut: true`, "narrow the
  filters") and `plan_cache_mode = force_custom_plan` — Prisma prepares every
  statement, and the generic plan Postgres switches to after five runs can't
  see the band bounds. Below-gate rows are admin-only (`includeBelowGate`).
- `GET /puzzles/catalog/:sourceId/preview` is the only route that returns the
  solution line.
- `POST /puzzles/catalog/materialise` (a coach sharing in class) copies the
  puzzle into the system **Lichess** folder (slug `__lichess`, created lazily).
  That folder is the hidden training cache: the library, the share dialog and
  the course picker leave it out unless it is opened directly, and stats count
  it as `trainingCache`.
- `POST /puzzles/catalog/adopt` (admin) copies into — or moves out of the
  Lichess folder into — a curated folder, with a per-item outcome. A copy
  already in another curated folder is never moved.

There is at most one `puzzles` row per Lichess id (unique `(source, sourceId)`
across soft-deleted rows; a concurrent create re-reads the winner). A copy is a
frozen snapshot — position after the setup move, line, rating, themes as tags —
whose position and line can't be edited (duplicate it instead), and whose author
shows as "Lichess". Adopt and PGN import warn, without blocking, when the same
position + line (`contentHash`) is already in the library.

In the app: Puzzle Library → **Lichess catalogue** tab (admins select puzzles and
"Add to folder"; anyone can preview with the solution or "Create homework",
which opens the assignment form with the position and line filled in), and the
live-class share dialog's **Lichess catalogue** tab, which shares a puzzle
straight from the catalogue.

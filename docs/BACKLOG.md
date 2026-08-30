# Backlog — known gaps

**Agents: read this file (especially § "Root causes") before implementing any
new feature, and update the relevant entry in the same change.** CLAUDE.md § 3.0
points here.

The 2026-08-29 codebase audit (all Critical/High/Medium/Low findings remediated;
`AUDIT.md` removed once complete) left these non-finding, feature-sized gaps.
None is a correctness bug; each is net-new work.

## Root causes — read this before picking up a gap

Patterns observed while remediating this backlog (2026-08-29). Future agents:
expect the *cause*, not just the symptom.

- **One-sided "speculative" features.** Several backend endpoints + `packages/types`
  shapes + service auth were built with no frontend caller ever added
  (`attendance.studentById`/`coachById` — since wired; `attendance.classLive`;
  `batches.get`; `upload/pgn`). Cause: API and types were landed as a unit and the
  UI half was deferred and forgotten. When you touch one of these, grep
  `API_ROUTES.<name>` across `apps/web` first — the route, request/response type,
  and service authorization already exist; you are almost always only adding the
  client `*Api.ts` + hook + a component, not new contract.
- **Orphaned package/app code from the `.ai/` autonomous manager.** The
  `.ai/` task runner (see `.ai/manager/`, `.ai/tasks/`) merged tasks
  NEXA-0001/0015/0034 that added helpers to `packages/utils` and a `getDevStatus`
  method to `AdminService`. A later "make apps/ identical to dev" sync commit
  (`5de4407`) reverted the `apps/` side but not `packages/`, leaving
  `@nexa-chess/utils` as an importer-less shell (since deleted). Cause:
  partially-reverted autonomous output. If you find code with no consumer and an
  `NEXA-####` commit, check whether its counterpart was reverted before "fixing"
  it — deletion is often correct.
- **God components grew at page/feature boundaries.** `ProfileForm`,
  `MeetingVideoGrid`, `MeetingChat`, `DemoClassesClient`, and the
  `completed-classes/[id]` page each accreted every sub-view inline because the
  first version was small and no split happened as features were added. Cause: no
  size budget enforced. When adding to a feature component over ~300 lines,
  extract the new piece into a sibling folder rather than appending.

## Runtime open question — LiveKit webhooks

**Wired 2026-08-30.** livekit-server config is now passed inline as
`LIVEKIT_CONFIG` in `docker-compose.yml` (the old `livekit.yaml` file and the
ineffective `LIVEKIT_WEBHOOK_*` env vars are gone). Compose interpolates
`${LIVEKIT_API_KEY}` into the `webhook.api_key`, so the block references a real
key in `LIVEKIT_KEYS`:

```yaml
webhook:
  api_key: ${LIVEKIT_API_KEY}
  urls:
    - http://api:3001/webhooks/livekit
```

**Verify after deploy** — check API logs for `LiveKit webhook: event=…` during a
real class. Until this was wired, no leave/disconnect events were recorded,
coach/board durations were always 0, `room_finished` never fired, and the
`TOKEN_REQUEST` join in `getToken` was the only thing creating attendance rows.

## Feature gaps

| Item | Notes |
|---|---|
| **Course / CourseModule / Announcement authoring** | Models are queried by the student dashboard but there is no API or admin UI to create them — "Continue Learning / Announcements" are permanently empty outside seed data. (**PGN assignments now have full authoring** — see the `assignment` module; the legacy `Practice` / `StudentPractice` tables remain seed-only and unused.) |
| **Waiting room / lobby** | The "coach hasn't joined" gate implies one; currently just a polling screen. |
| **Live-monitoring screen** | `GET /attendance/class/:id/live` (`classLive`) and `getLiveClassMonitoring` are fully implemented and unused — no frontend. Same one-sided-feature cause as the (now-wired) admin drill-downs: reuse the `StudentAttendanceView` / dialog pattern in `features/attendance/components/`. |

## Resolved (2026-08-30)

- **Phantom "Absent with a join time" in the post-class report.** `getToken`
  opens a `ClassAttendance` row (`recordJoinEvent`, `source: "TOKEN_REQUEST"`)
  the moment a student requests a LiveKit token. A student who loaded the class
  page but never connected (tab closed, connection failed, coach ended the class
  immediately) kept that row: `finalizeClassAttendance` scored it to 0s / ABSENT
  but left `joinedAt` stamped — the summary table then showed "Absent · joined
  07:24 PM" (the class end time, because the open session clamps there). Finalize
  now nulls `joinedAt`/`leftAt` whenever a row scores to `totalDuration === 0`,
  so it reads identically to a true no-show. The `Joined`/`Left` columns were
  also removed from `ClassStudentTable` and the summary header collapsed to one
  line. (Token-request join is kept, not removed — see the LiveKit-webhooks open
  question above; it is the only attendance source if webhooks are not firing.)

- **Board control is now multi-student; PDF tab removed.** The Live Class board
  sidebar's "Board Control" panel and the Participants-panel Crown toggle went
  from single-select (`boardControlStudentId: string | null`) to a granted set
  (`boardControlStudentIds: string[]` with grant/revoke/toggle/clear in
  `LiveClassProvider`). `createBoardStore` now holds `selectedStudentIds: string[]`,
  `senderMayMutateBoard` checks `.includes`, and `UPDATE_PERMISSIONS` carries
  `selectedStudentIds`. The sidebar panel lists every meeting participant (coaches
  shown as "full control", students get a Grant/Revoke button). Separately, the
  **PDF tab was removed entirely**: `PdfPanel`, the `pdf` tab, `pdfUrl`
  store/sync fields, `SET_UI_STATE.pdfUrl`, the `uploadPdf` client helper, and the
  API `POST /upload/pdf` route + `UploadService.uploadPdf`.

- **Post-class summary screen.** The "class ended" state was a dead-end
  `<RoomEnded />`. Now `GET /attendance/class/:id/summary`
  (`API_ROUTES.attendance.classSummary`, `AttendanceService.getClassSummary`)
  returns a role-aware payload — coaches/admins get the full `ClassDetailReport`,
  students get their own attendance row — plus a `finalized` flag the client
  (`useClassSummary`) polls on. `LiveSession.attendanceFinalizedAt` marks
  finalization; the endpoint lazy-re-runs the idempotent `finalizeClassAttendance`
  if the class ended without the marker set. `ClassSummary` renders inside the
  room's `ended` state and the `/live-class/[roomId]` ended branch; "Return to
  Dashboard" is always available. Also fixed the coach-presence check in
  `getToken` / `sweepStaleClasses` to tolerate the `_<clientId>` identity suffix
  (students were stuck in the waiting room), and the meeting timer now counts
  from `liveSession.startedAt` rather than the scheduled start.

- **Meeting countdown ignored a late start (2026-08-30).** Elapsed time already
  ran from `liveSession.startedAt`, but the timer's default countdown mode still
  targeted the scheduled `endsAt`, so a class started late silently lost the
  late-start minutes (18:00–19:00 class begun at 18:15 showed 40 min left, not
  55). `useLiveClass` now derives the countdown target as
  `startedAt + (scheduledEnd − scheduledStart)` once the session is live, so the
  class always gets its full planned duration from when it actually began. Falls
  back to the scheduled end before the class starts or on bad schedule data.

## Resolved (2026-08-29)

- **Board workspace — engine analysis, Load Game, Setup Position.**
  `POST /stockfish/analyze` was dead: `AnalyzePositionDto` had no
  `class-validator` decorators, so the global `ValidationPipe({ whitelist: true })`
  stripped `fen` and the endpoint always returned `{ error }` with HTTP 200 — the
  Engine panel rendered "MNaN". Fixed: shared `stockfishAnalyzeRequestSchema` +
  `StockfishAnalysisResult` types + `API_ROUTES.stockfish`, a decorated DTO,
  proper 400/403/503 responses (no more 200-with-error-body), UCI→SAN conversion
  server-side, and configurable `STOCKFISH_MOVETIME` (default 800ms, was 150).
  `apiFetch` now rethrows aborted requests without the network toast. "Load
  Games / Positions" dialog gained a **Load Game** tab (PGN textarea + `.pgn`
  upload) alongside the position editor; `loadPgnIntoBoard` (`lib/loadPgn.ts`) is
  the single PGN-load path. Coverage: `stockfish.controller.spec.ts`,
  `stockfish.service.spec.ts`, `upload.controller.spec.ts`, and opt-in
  `e2e/analysis-board.spec.ts`.

- **Setup Position tab — blank board + broken palette (2026-08-30).** The Setup
  Position board rendered as an empty rectangle: the spare-piece palette used
  `<div class="pawn white">` which never matches the cburnett `.cg-wrap
  piece.<role>.<color>` rules (needs a real `<piece>` element), and the board's
  chessground instance initialised against a flex item that got stretched
  non-square with no stable size / `overflow` containment, so squares and pieces
  (sized as `12.5%`) collapsed and chessground DOM spilled over the castling
  controls. Fixed by extracting a reusable, LiveKit-free
  `features/chessboard/components/board/PositionEditor.tsx` (+ pure
  `lib/fen.ts`): a controlled `{ value, onChange }` FEN editor with a
  block-level `aspect-square` `overflow-hidden` board (the working
  `PgnBoardViewer` pattern), a real `<piece>` palette, and themed side-to-move /
  castling / en-passant / move-number / FEN controls. `SetupPositionDialog` is
  now a thin consumer; the Load Game (PGN) tab is untouched. Admin Assignment
  Creation can reuse `<PositionEditor>` directly. Coverage extended in
  `e2e/analysis-board.spec.ts`.

- **Coach live-class chessboard — sync fixes + clock + detach.** Fixed: a
  student granted board control could move locally but the move was dropped by
  every other client (all board-mutating messages were blanket coach-only);
  three different participant-identity formats were used for "who has control"
  so grants from the participants panel never matched `canMove`; the coach's
  in-meeting board (`LiveChessboardPanel`) was built but never rendered, leaving
  the coach dependent on a popup window. Now: the receiver runs
  `senderMayMutateBoard` (`lib/boardSyncRules.ts`) keyed by the full LiveKit
  participant identity; one sync engine (`LiveBoardSyncBridge` → `BoardSyncContext`)
  instead of one per `RequestControlButton`. (Superseded 2026-08-30: the
  in-meeting `LiveChessboardPanel` is removed — the coach's board is the
  dedicated `/live-class/:id/board` tab only; the meeting screen stays a
  meeting. Students still see a synced inline board tile in `MeetingVideoGrid`.)
  Added: a shared chess clock (`ClockState` in `createBoardStore`, `lib/clock.ts`,
  `ChessClock`, `SET_CLOCK` message, coach-authoritative) and per-student board
  detach / "resync to coach" (`isDetached` + `detachBoard`/`resyncBoard`).
  Coverage: `e2e/live-board-sync.spec.ts` (opt-in, two real LiveKit participants).

- **PGN assignments** — new `assignment` API module + `features/assignments` web
  feature. Admins author shared library items; coaches author private ones and
  deploy any item to their batches with a due date (fans out a per-student
  completion row per batch member). Students replay the PGN on a read-only board
  and mark it complete with an optional note; the PGN string is also uploaded to
  Cloudinary for download. Fills the previously-404 `/student/practice` route
  that the sidebar + dashboard "Assignments & Practice" card already linked to.

- **`packages/ui` / `packages/utils`** — deleted. Empty shells with no importer in
  `apps/**`; the `.ai/`-manager helpers they held had already been reverted on the
  app side. Lockfile pruned, workspace listings updated.
- **Admin attendance drill-downs** — wired. `attendance.studentById` /
  `coachById` now open from `StudentAttendanceDialog` / `CoachAttendanceDialog`
  (`features/attendance/components/`) off the admin coach report and class-detail
  student table. Backend was already complete + authorized; only the UI was added.
- **God-component splits** — `ProfileForm`, `MeetingVideoGrid`, `MeetingChat`,
  `DemoClassesClient`, and `completed-classes/[id]/page.tsx` each broken into a
  sibling folder of memoized children + a `*.utils` file. Entry paths/exports
  unchanged.

## Other deferred

- Email verification is commented out in `auth.service.ts` (two places) by design for now.
- `GET /batches/:id` (`batches.get`) has no frontend caller — the list response is reused.
- `POST /upload/pgn` has no direct frontend caller (the `assignment` service
  calls `UploadService.uploadPgn` server-side); the controller route itself is
  still unused. Size is capped at 512KB in the controller and the shared
  `createAssignmentRequestSchema`.

# Nexa Chess — Codebase Audit

**Date:** 2026-08-29
**Scope:** `apps/web`, `apps/api`, `packages/*`, `e2e/`, deployment scripts
**Method:** Static reading of the full monorepo. No code was modified. No runtime testing was performed.

> **How to read severity**
> - **Critical** — exploitable security hole, data loss risk, or a feature that is provably 100% broken in production.
> - **High** — wrong results shown to users, broken flows, React correctness violations, or authorization gaps behind a login.
> - **Medium** — degraded correctness, missing validation, performance cliffs, duplicated/dead logic.
> - **Low** — polish, consistency, maintainability.

**Headline counts:** 7 Critical · 26 High · 31 Medium · 12 Low

**Remediation progress:** Critical 7/7 · High 26/26 · Medium 31/31 · Low 4/12.

## Remediation status

| Fixed | Item |
|---|---|
| ✅ | **C1** — upload endpoints now require an active session; delete scoped to owner/admin; PGN size-capped |
| ✅ | **C2** — forged LiveKit webhooks rejected; unverified payloads only accepted outside production |
| ✅ | **C3** — duplicate checks now read through `prisma.withDeleted`, returning 409 instead of an unhandled 500. *Decision: emails of deleted users stay permanently reserved; partial unique indexes were rejected because Prisma cannot express them in `schema.prisma`* |
| ✅ | **C4** — board attendance logs write a valid `coachId`; FK violation resolved |
| ✅ | **C5** — `GET /attendance/policy` requires auth; lazy row creation removed from the anonymous path |
| ✅ | **H1** — SUPER_ADMIN-only nav items and the backup panel are hidden from ADMIN. *Decision: the backend is correct; the frontend was wrong* |
| ✅ | **H19** — real DTOs on the policy and both demo-class endpoints, using the previously-unused Zod schemas, with field-level errors and a descending-threshold check |
| ✅ | **C6** — object keys validated against an allow-listed prefix; archive integrity checked *before* the wipe; a pre-restore safety dump is taken and auto-rolled-back if the restore fails; `psql -v ON_ERROR_STOP=1` |
| ✅ | **C7** — board data channel now honours state-mutating messages only from the coach. Also revoked `canUpdateOwnMetadata` for students, which had allowed forging `role: COACH` in chat badges and the video grid too |
| ✅ | **H2** — `startClass`/`internalEndClass` no longer overwrite `startsAt`/`endsAt`; actuals already live on `LiveSession`. Attendance is now scored against the actual session length, falling back to the schedule |
| ✅ | **H3** — duplicate-join guard on both the student and coach webhook paths, killing the phantom "Ghost drop" and `reconnectCount` inflation. *Kept the token-request join as a fallback rather than removing it — see the LiveKit webhook caveat below* |
| ✅ | **H4** — all 5 table components now pass real `columns`/`data`; every `setOptions()`-during-render call removed. `useDataTable` gained optional controlled `rowSelection`/`pagination`/`sorting` and `manualPagination`/`manualSorting`/`pageCount` to break the hook↔handlers↔columns cycle |
| ✅ | *(new)* — the two `admin/*.spec.ts` stub specs had been failing on `main`; fixed, so `npm test` is green again |
| ✅ | **H13** — `getAttendanceLogs` now rejects a coach who does not own the class; `getStudentAttendance` requires the coach to share a batch with (or teach a class for) the target student |
| ✅ | **H12** — `getChatHistory`/`saveChatMessage` now go through a shared `getAccessibleLiveSession` helper (owning coach / enrolled student / admin), which also replaces the duplicated check in `getParticipants` |
| ✅ | **H10** — `StudentService.getAttendance` and `GET /student/attendance` deleted (the web page already called `/attendance/student`); the dashboard's inline PRESENT-only percentage now comes from `AttendanceService.getStudentAttendance`, so both screens agree |
| ✅ | **H11** — the student dashboard returns ISO-8601 only; the web formats every date via `lib/datetime.ts` + `useUserTimeZone()`, which finally reads the `User.timezone` column (browser timezone as fallback) |
| ✅ | **H9** — coach self-registration is now an application: `status: PENDING`, no session issued, and `login()` refuses any coach whose `approvalStatus` is not ACTIVE. Admin-created coaches are auto-approved, demo-class scheduling requires an ACTIVE coach, and a migration grandfathers existing active coaches so the new gate cannot lock them out |
| ✅ | **H15** — `longestStreak` gets its own run counter that resets on a miss, so a longer streak earlier in the history is no longer invisible |
| ✅ | **H17** — the admin's overlap + past-date checks moved into a shared `class-scheduling.util.ts` (`assertNoSchedulingConflict`, `assertNotInPast`), used by both `AdminService` (demo classes) and `CoachService` (batch classes), closing the gap where a coach could double-book or schedule into the past |
| ✅ | **H8** — "Go to start"/"Go to end" now call `jumpToStart`/`jumpToEnd` instead of `reset`; `reset` stays only on "New game", now behind a `ConfirmationModal` since it wipes the game |
| ✅ | **H7** — `createBoardStore` (per-room, ephemeral) now seeds `boardTheme`/`pieceTheme`/`showCoordinates` from `boardStore.ts` (app-wide, persisted) and writes through to it on every change, so board settings survive a reload instead of resetting every room |
| ✅ | **H20** — `syncFromRemote` now bumps a `remoteSyncId` counter atomically inside its own `set()` call; the `useBoardSync` subscriber compares it against the previous state instead of a `setTimeout`-cleared ref, removing the race where a stale timer could clear the suppression flag before a second remote message's store update landed |
| ✅ | **H6** — `handleIncomingSync`'s MOVE case now forwards `msg.payload.moveType` into `syncFromRemote`, so a remote move's sound cue actually reaches the store's `if (moveType)` branch instead of being silently dropped. (Still silent in practice until H5's `playSound()` is implemented — see below.) |
| ✅ | **H14** — `getToken` now throws a structured `{ message, code: "COACH_NOT_JOINED" }` instead of a plain string; `apiFetch` carries `code` through on a new `ApiError`; the web app branches on it into a dedicated `WaitingForCoach` screen that silently retries the token fetch every 5s (via a new `retry()` on `useLiveClass`, no page reload) instead of falling through to a dead-end "Connection Lost" screen |
| ✅ | **H18** — `CoachService.updateClass`/`cancelClass` now reject a class that is not `SCHEDULED`: no more retroactively rewriting `startsAt`/`endsAt` on a `COMPLETED` class (which would corrupt every attendance percentage computed against it), and cancel is a no-op-turned-409 once the class already ran or is already cancelled |
| ✅ | *(new)* — `deploy-production.sh` applies migrations from the new image *before* replacing the running API, so a failed migration aborts the deploy with no downtime instead of surfacing as a health-check timeout after the swap |
| ✅ | **H5** — `sounds.ts` is now a real WebAudio implementation (lazy `AudioContext`, decoded-buffer cache, `preloadSounds()` on board mount) honouring the persisted `soundEnabled` preference; four short placeholder WAV cues added under `apps/web/public/sounds/` (`move`/`capture`/`check`/`gameEnd`) |
| ✅ | **H16** — `hasJoined` is persisted per-tab in `sessionStorage`, so a mid-class refresh / reconnect-reload drops straight back into the meeting instead of PreJoin; LiveKit's own reconnection is surfaced as a toast (`ReconnectToaster`) rather than tearing the room down, and the joined flag is cleared on an intentional leave / `ROOM_DELETED` |
| ✅ | **H21** — the board store keeps a `fullPgn` (complete mainline, independent of the viewed ply); broadcasts send `fullPgn` + `historyIndex`, and `syncFromRemote` loads the full line then steps back to the sender's ply, so stepping through move history no longer snaps every student to the end of the game |
| ✅ | **H22** — `ForceOpenBoard`'s `setIsChessboardOpen(true)` moved out of the render body into a `useEffect` |
| ✅ | **H23** — chat history carries `senderId`; `isOwn` is resolved in the `chatMessages` memo by comparing it to the current user id, so your own past messages render as yours after a refresh |
| ✅ | **H24** — added `getRecordingDownloadUrl()` to `api/live-class.ts` (via `API_ROUTES.liveClass.downloadRecording`); both `BatchClassesClient` and `CoachHistoryClient` use it and report failure with `toast.error` instead of a hardcoded path + `alert()` |
| ✅ | **H25** — CSV export escapes embedded quotes, quotes every field, uses RFC-4180 `\r\n` rows, and prefixes formula-leading values (`= + - @` / tab / CR) with `'` to neutralise spreadsheet formula injection |
| ✅ | **H26** — `users.list`, `batches.list`, `admin.listDemoClasses`, `admin.listBatchClasses` are now server-paginated: shared `resolvePagination`/`paginationMeta`/`resolveOrderBy` helpers (`apps/api/src/common/pagination.ts`), `?page/pageSize/search/sort/order/status` query params, allow-listed sort columns, `count` + `skip`/`take`, and a `pagination` meta block in the response. The four admin tables use a shared `useServerTable` hook (debounced server search, `manualPagination`/`manualSorting`, page clamp on shrink) instead of fetching every row and filtering in memory |
| ✅ | **M4** — one shared `tallyAttendance()` helper for both class-report endpoints; `absentCount` = batch students with no PRESENT/LATE/PARTIAL record, clamped at 0 (was two formulas, could go negative) |
| ✅ | **M5** — admin dashboard 6-month trend: 2 range queries + in-memory bucketing instead of 18 sequential `COUNT`s |
| ✅ | **M6** — coach teaching report: `coachClass.groupBy` + one `coachAttendance` query for all coaches instead of 3 queries per coach |
| ✅ | **M15** — `updateCoachStatus` with `DELETED` routes through `TrashRepository.softDelete` (real soft delete + audit log) instead of a `status: 'DELETED'` zombie |
| ✅ | **M16** — a STUDENT↔COACH role switch soft-deletes the profile for the old role and reactivates (un-deletes) the profile for the new role, so the user never holds both |
| ✅ | **M17** — `UserService.toAuthUser` now returns `username` |
| ✅ | **M18** — guest demo identities use `crypto.randomUUID()` (was a ~4-char `Math.random()` slug that could collide and evict an earlier guest) |
| ✅ | **M25** — `livekitMessages` is `useMemo`'d on `rawChatMessages`, so the `chatMessages` memo and unread-count effect stop re-running every render |
| ✅ | **M26** — chat DB persistence retries once, then surfaces a `toast.error` instead of silently dropping the message |
| ✅ | **M27** — `saveChatMessage` passes a plain object (axios serialises it) instead of a pre-stringified body; also added a 2000-char server-side length limit and an empty-message guard |
| ✅ | **M28** — `useBoardSync` reads board state via `store.getState()` inside its callbacks instead of subscribing to ~10 reactive fields, so a move no longer re-renders the hook or re-registers the LiveKit data channel |
| ✅ | **M29** — removed `DrawingToolbar`'s explicit `broadcastAnnotations()` (the store subscription already broadcasts every annotation change) |
| ✅ | **M30** — shared `ZodBodyPipe` (`apps/api/src/common/zod-body.pipe.ts`) maps `error.issues` to `path: message`; coach controller uses it instead of a bare "Validation failed" |
| ✅ | **M31** — `getCompletedClasses` / `exportAttendanceReport` / `getAdminCoachTeachingReport` validate `dateFrom`/`dateTo` via `parseDateFilter()` → 400 instead of `Invalid Date` → Prisma 500 |
| ✅ | **L1** — deleted the dead `useChessLogic.ts` |
| ✅ | **L3** — `queryKeys.auth.session` corrected to `["auth","me"]` and used by `SessionBootstrap` / `AuthLayout` |
| ✅ | **L4** — deleted the `/test-board` dev scratch page |
| ✅ | **L11** — chat sender name built with a null-safe join (no more "Jane null") |
| ✅ | **M1** — LiveKit webhook deliveries are deduped via a `processed_webhook_events` table (new migration), so a retried event can't add duplicate RECONNECT logs or inflate durations |
| ✅ | **M2 / M3** — `finalizeClassAttendance` clamps every still-open session log to the class end time before summing (`closeOpenAttendanceLogs`, raw JSONB-free SQL) and `calculateTotalDuration` takes an explicit end instant, so it's idempotent and a late `participant_left` after `room_finished` can't leave a session open |
| ✅ | **M7** — "today" windows in the student/coach dashboards and admin dashboard use `zonedDayBounds(user.timezone)` (real calendar day) instead of a rolling `now-4h … now+20h` |
| ✅ | **M10** — `bulkPermanentDelete` sorts the selection child-entities-first (`deleteOrder`) so a parent's cascade can't abort the transaction; missing rows are skipped |
| ✅ | **M11** — `emptyTrash` / `cleanupExpiredTrash` purge in bounded ~500-row transactions (`hardDeleteInChunks`); the nightly job holds a session-scoped advisory lock across all chunks |
| ✅ | **M12** — `deleteExternalAssets` deletes a permanently-deleted user's Cloudinary avatar (was a no-op stub) |
| ✅ | **M19** — guest demo joins append to `metadata.participants` with one atomic `jsonb_set` update instead of a read-modify-write race |
| ✅ | **M20** — `recordingUrl` is set only from the `egress_ended` webhook on success (`handleEgressEnded`); `startRecording` records `recordingStatus` instead, so a failed egress no longer shows a Download button that 404s |
| ✅ | **M21** — `handleStaleClasses` holds a Postgres advisory lock (one instance per tick) and `internalEndClass` is idempotent (`updateMany` LIVE→ENDED guard) |
| ✅ | **M22** — `LiveKitService.listParticipants` only swallows a genuine room-not-found; any other failure propagates and `getToken` returns a `LIVEKIT_UNAVAILABLE` 503 instead of a misleading "coach hasn't joined" |
| ✅ | **M23** — `useLiveClass` falls back to a stable per-tab `clientId` (`sessionStorage`), so two tabs of the same user don't collide on the LiveKit identity |
| ✅ | **M24** — chat rows store LiveKit's `clientMessageId` (new column/migration); history reconciliation dedupes on it instead of senderName+text+±2s |
| ✅ | **M13** — cascading soft-delete groups: a new `deleteGroupId` column (migration `20260829160000_trash_delete_groups`) tags a parent and its children retired in the same operation; `TrashRepository.restore` on any group member `updateMany`-restores the whole group. Deleting a `Batch` now cascades to its `BatchCoach`/`BatchStudent` rows; deleting a `User` cascades to its profile — and restoring brings them back together. |
| ✅ | **M14** — `UserService.delete`, `AdminService.updateCoachStatus` (DELETED) and `BatchService.delete` route through the new `TrashRepository.cascadeSoftDelete`, which soft-deletes the child profiles / assignments alongside the parent, so those Trash filters populate. Role-switch (M16) deletes stay standalone (no group) so a later user restore doesn't resurrect a profile for the wrong role. |
| ✅ | **M8** — each entity's page is now ordered in SQL by the *requested* sort column (`title` → title field, `deletedBy` → `deletedBy.email`, else `deletedAt`) before the in-memory merge, so the merged result is the true global top-N instead of the top-N by `deletedAt` re-sorted. |
| ✅ | **M9** — the per-entity offset scan is capped at `MAX_TRASH_SCAN` (500) rows, so a deep page can no longer fan out to `page × pageSize × 6` row reads. Sorting/paging is exact within the newest 500 deleted rows per entity (well inside the retention window at realistic volume); deeper offsets are documented as unsupported rather than a true keyset. |

Verified after changes: `typecheck` 6/6 tasks · `lint` 0 errors · `test` 19/19 suites, 134/134 tests · `build -w apps/web` compiles successfully.

### ⚠️ Open question found during H3: LiveKit webhooks may never fire

`livekit.yaml` has **no `webhook:` section**. `docker-compose.yml:74-75` sets
`LIVEKIT_WEBHOOK_API_KEY` / `LIVEKIT_WEBHOOK_URLS`, but those are not documented
LiveKit env vars — webhook config belongs in the YAML:

```yaml
webhook:
  api_key: <LIVEKIT_API_KEY>
  urls:
    - http://api:3001/webhooks/livekit
```

If webhooks genuinely are not firing, then in production today: no leave/disconnect
events are recorded, durations are never computed from logs, `room_finished` never
fires, and the `TOKEN_REQUEST` join in `getToken` is the *only* thing creating
attendance rows. **This is why H3 kept that fallback instead of removing it.**
Needs runtime confirmation — check the API logs for `LiveKit webhook: event=…`
lines during a real class.

Everything else below is **outstanding**.

> **Note on CI:** `.husky/pre-commit` runs only `typecheck` and `lint` — not `test`. That is why two suites sat broken on `main` unnoticed. Consider adding `npm run test` to the hook or to a CI job.

---

## Section A — Prioritized findings

### 🔴 CRITICAL

| # | Finding | Location | One-line fix |
|---|---|---|---|
| C1 | **All four upload endpoints are completely unauthenticated.** No cookie check, no role check. Anyone on the internet can upload images/PDFs to your Cloudinary account and — worse — `DELETE /upload/image` takes an arbitrary `url` in the body and deletes it. Every user avatar is deletable by an anonymous request. | [upload.controller.ts:5-58](apps/api/src/upload/upload.controller.ts#L5-L58) | Add the `getAccessToken`/`getAuthenticatedUser` pattern to every route; scope delete to assets the caller owns. |
| C2 | **LiveKit webhook signature verification is bypassed on failure.** When `webhookReceiver.receive()` throws (bad/forged signature), the code logs a warning and falls through to `JSON.parse(body)`, then processes the event anyway. Anyone can POST forged `participant_joined` / `room_finished` events and rewrite attendance records for any class. | [attendance-webhook.controller.ts:55-60](apps/api/src/attendance/attendance-webhook.controller.ts#L55-L60) | Delete the fallback — on verification failure, log and return 200 without processing. |
| C3 | **No partial unique indexes exist anywhere, despite the documented rule requiring them.** `users_email_key` and `users_username_key` are plain uniques. The pre-check `findUnique({where:{email}})` is filtered by the soft-delete extension and returns `null` for a soft-deleted user, so `create` proceeds and Prisma throws P2002 → **unhandled 500**. Soft-deleting a user permanently burns their email address. | [schema.prisma:78-79](apps/api/prisma/schema.prisma#L78-L79), [migration.sql:174,177](apps/api/prisma/migrations/20260705155652_init/migration.sql#L174), [README.md:155-159](README.md#L155) | Add `CREATE UNIQUE INDEX ... WHERE "isDeleted" = false` migrations for `users.email`, `users.username`, `batch_coaches`, `batch_students`; drop the plain uniques. |
| C4 | **Board attendance logging always throws a foreign-key violation.** `recordBoardJoinEvent`/`recordBoardLeaveEvent` write `userId: \`${coachId}_board\`` into `CoachAttendanceLog.userId`, which is an FK to `users.id`. That row does not exist → P2003 on every insert. `boardDuration` is therefore permanently null and the "Board Duration" column in admin reports is always empty. | [attendance.service.ts:386](apps/api/src/attendance/attendance.service.ts#L386), [:430](apps/api/src/attendance/attendance.service.ts#L430), [schema.prisma:527-528](apps/api/prisma/schema.prisma#L527-L528) | Use the real `coachId` for `userId` and rely on `eventType: BOARD_JOIN/BOARD_LEAVE` to distinguish. |
| C5 | **`GET /attendance/policy` has no authentication and performs a write.** `getPolicy()` takes no token, and `getActivePolicy()` will `create` a policy row if none exists. Unauthenticated read of your grading thresholds plus an unauthenticated insert. | [attendance.controller.ts:194-197](apps/api/src/attendance/attendance.controller.ts#L194-L197), [attendance.service.ts:1574-1596](apps/api/src/attendance/attendance.service.ts#L1574) | Require an authenticated admin; move the default-policy seeding out of the read path (seed it in migration/seed). |
| C6 | **`restoreBackup` runs `DROP SCHEMA public CASCADE` with an unvalidated key and no safety net.** The `key` query param is passed straight to S3 with no check it lives under `database/`. If the subsequent `psql` restore fails for any reason (corrupt gzip, wrong object, network), the `catch` just logs and **the database is left empty**. No pre-restore snapshot, no confirmation token, no app quiescing. | [backup.service.ts:185-233](apps/api/src/backup/backup.service.ts#L185-L233), esp. [:216](apps/api/src/backup/backup.service.ts#L216) | Validate `key.startsWith('database/')`; take a pre-restore dump; restore into a temp schema and swap only on success. |
| C7 | **The shared chessboard data channel has no sender authorization.** `handleIncomingSync` acts on `UPDATE_PERMISSIONS`, `FORCE_SYNC` and `MOVE` from *any* participant, and students are granted `canPublishData: true`. A student can broadcast `{type:"UPDATE_PERMISSIONS", payload:{mode:"EVERYONE"}}` to grant everyone control, or push arbitrary FENs to the whole class. | [useBoardSync.ts:90-178](apps/web/src/features/chessboard/hooks/useBoardSync.ts#L90-L178), [livekit.service.ts:106](apps/api/src/live-class/livekit.service.ts#L106) | Check `msg.from.identity === coachId` (or the LiveKit participant metadata `role === 'COACH'`) before applying any authoritative message type. |

---

### 🟠 HIGH

| # | Finding | Location | One-line fix |
|---|---|---|---|
| H1 | **`ADMIN` role users are locked out of the entire admin area.** `AdminController.getAdminId` and `BackupController.getAdminId` require `role === 'SUPER_ADMIN'`, but `middleware.ts` and `getRoleDashboardHref` send both ADMIN and SUPER_ADMIN to `/admin`. An ADMIN sees 401s on pending coaches, demo classes, batch classes, and backups. | [admin.controller.ts:29](apps/api/src/admin/admin.controller.ts#L29), [backup.controller.ts:27](apps/api/src/backup/backup.controller.ts#L27), [authStore.ts:50-52](apps/web/src/stores/authStore.ts#L50) | Accept `ADMIN` where intended, or hide those pages from ADMIN in the sidebar. Decide the intent first. |
| H2 | **`startClass` destroys the scheduled time.** It overwrites `startsAt = now` and `endsAt = now + duration`; `internalEndClass` then sets `endsAt = now`. Consequences: the original schedule is unrecoverable; `scheduledDuration` used for attendance % becomes the *actual* duration; and `lateStarts` (which compares `joinedAt` to `class.startsAt`) can never exceed 5 min → **always 0**. | [live-class.service.ts:122-129](apps/api/src/live-class/live-class.service.ts#L122-L129), [:249-255](apps/api/src/live-class/live-class.service.ts#L249), [attendance.service.ts:1293-1297](apps/api/src/attendance/attendance.service.ts#L1293) | Add `actualStartsAt`/`actualEndsAt` columns; never mutate `startsAt`/`endsAt`. |
| H3 | **Every student join produces a phantom disconnect.** `getToken` calls `recordJoinEvent` (source `TOKEN_REQUEST`), then the LiveKit `participant_joined` webhook sees an existing record with a `JOIN` log and records a `LEAVE` ("Ghost drop") + `RECONNECT`. Every student shows `reconnectCount ≥ 1` and a fake interruption. | [live-class.service.ts:199-209](apps/api/src/live-class/live-class.service.ts#L199-L209) vs [attendance-webhook.controller.ts:151-161](apps/api/src/attendance/attendance-webhook.controller.ts#L151-L161) | Drop the `TOKEN_REQUEST` join — let the webhook be the single source of truth. |
| H4 | **`table.setOptions()` is called during render in 5 components.** All pass `columns: []` to `useDataTable`, then mutate the table instance mid-render. This is a side effect during render — non-idempotent under React 18 concurrent/StrictMode, and the first render has no columns. | [BatchManagementClient.tsx:406](apps/web/src/features/batches/components/BatchManagementClient.tsx#L406), [UserManagementClient.tsx:370](apps/web/src/features/users/components/UserManagementClient.tsx#L370), [TrashManagementClient.tsx:315](apps/web/src/features/trash/components/TrashManagementClient.tsx#L315), [DemoClassesClient.tsx:343](apps/web/src/features/admin/components/DemoClassesClient.tsx#L343), [BatchClassesClient.tsx:225](apps/web/src/features/admin/components/BatchClassesClient.tsx#L225) | Pass real `columns` and `data` into `useDataTable` and delete every `setOptions` call. |
| H5 | **Move sounds never play, anywhere.** `playSound` and `setSoundEnabled` are empty function bodies. The entire plumbing chain above them (compute `moveType` → persist → broadcast → `syncFromRemote`) is dead. No audio assets exist in `public/`. | [sounds.ts:3-5](apps/web/src/features/chessboard/audio/sounds.ts#L3-L5) | Implement with an `AudioContext` buffer cache + add the four sound files; honour `soundEnabled`. |
| H6 | **Remote moves would not play a sound even if sounds worked.** `handleIncomingSync` builds the `syncFromRemote` payload without `moveType`, so the `if (payload.moveType)` branch in the store is unreachable. | [useBoardSync.ts:99-106](apps/web/src/features/chessboard/hooks/useBoardSync.ts#L99-L106) vs [createBoardStore.ts:361-363](apps/web/src/features/chessboard/store/createBoardStore.ts#L361) | Add `moveType: msg.payload.moveType` to the `syncFromRemote` call. |
| H7 | **Board settings never persist.** `BoardSettingsDialog` and `ChessgroundBoard` read `boardTheme`/`pieceTheme`/`showCoordinates` from the **context** store (`createBoardStore`), but the `persist` middleware with the matching `partialize` lives on the **other**, unused store (`boardStore.ts`). Every reload resets theme and coordinates. | [BoardSettingsDialog.tsx:13](apps/web/src/features/chessboard/components/dialogs/BoardSettingsDialog.tsx#L13), [boardStore.ts:148-156](apps/web/src/features/chessboard/store/boardStore.ts#L148) | Move preferences into a single persisted preferences store and read it from `BoardProvider`. |
| H8 | **Three board-navigation buttons all call `reset()`.** The buttons labelled "Reset", **"Go to end"** and "New game" invoke the same `reset`. `jumpToStart`/`jumpToEnd`/`jumpToPly` exist in the store but are unwired here — so "Go to end" wipes the game. | [LiveChessboardPanel.tsx:69,98,119](apps/web/src/features/live-class/components/meeting/LiveChessboardPanel.tsx#L98) | Wire `jumpToStart` and `jumpToEnd`; keep `reset` only on "New game" behind a confirm. |
| H9 | **Coach self-registration bypasses the approval workflow entirely.** `registerCoach` sets `status: ACTIVE` and `isEmailVerified: true`; `coachProfile.approvalStatus` defaults to `PENDING`. The coach can log in and teach immediately. The admin "Pending Coaches" screen is decorative. | [auth.service.ts:199-213](apps/api/src/auth/auth.service.ts#L199-L213) | Set `status: PENDING` on coach self-registration and gate login on `approvalStatus === ACTIVE`. |
| H10 | **Two divergent attendance-percentage implementations.** `StudentService` counts only `PRESENT`; `AttendanceService` counts `PRESENT + LATE + PARTIAL`. `/student` and `/student/attendance` show different numbers for the same student. | [student.service.ts:114-123](apps/api/src/student/student.service.ts#L114-L123), [:206](apps/api/src/student/student.service.ts#L206) vs [attendance.service.ts:602-611](apps/api/src/attendance/attendance.service.ts#L602) | Delete `StudentService.getAttendance` and the dashboard's inline calc; call `AttendanceService`. |
| H11 | **All student-facing dates/times are formatted in the server's timezone.** `toLocaleTimeString()`/`toLocaleDateString()` run on the Node server with no locale/tz argument. The `User.timezone` column (default `Asia/Kolkata`) is never read anywhere in the codebase. | [student.service.ts:137,143-144,154,160,167,174,180](apps/api/src/student/student.service.ts#L137) | Return ISO strings and format client-side with `Intl` using the user's timezone. |
| H12 | **`getChatHistory` authenticates but does not authorize.** The comment says "Just to verify access" — any logged-in user can read any class's full chat history by guessing a classId. `saveChatMessage` likewise lets any authenticated user post into any live session. | [live-class.service.ts:456-472](apps/api/src/live-class/live-class.service.ts#L456-L472), [:430-454](apps/api/src/live-class/live-class.service.ts#L430) | Reuse the `isCoach || isStudent-in-batch || isAdmin` check from `getParticipants`. |
| H13 | **Any coach can read any student's attendance logs and history.** `getAttendanceLogs` only blocks students from viewing others; there is no check that the coach owns the class. `getStudentAttendance` lets any COACH pass any `targetStudentId`. | [attendance.service.ts:716-721](apps/api/src/attendance/attendance.service.ts#L716-L721), [:561-568](apps/api/src/attendance/attendance.service.ts#L561) | Verify the class belongs to the coach / the student is in one of the coach's batches. |
| H14 | **The most common student error renders as "Connection lost".** `getToken` throws "Coach has not joined the meeting yet. Please wait." — the page's substring matching has no branch for it, so it falls through to `<ConnectionLost>`. There is also no retry/poll: the student must manually reload until the coach joins. | [live-class/[roomId]/page.tsx:40-84](apps/web/src/app/live-class/[roomId]/page.tsx#L40-L84), [useLiveClass.ts:14-73](apps/web/src/features/live-class/hooks/useLiveClass.ts#L14) | Return typed error codes from the API; add a "waiting for coach" state that polls every ~5s. |
| H15 | **`longestStreak` is computed incorrectly.** Iterating newest-first, `currentStreak` is never reset when `streakBroken` flips, so `longestStreak` can only ever equal the most recent streak. Any longer streak earlier in the history is invisible. | [attendance.service.ts:613-620](apps/api/src/attendance/attendance.service.ts#L613-L620) | Track `runLength`, reset it on a miss, and `longestStreak = max(longestStreak, runLength)`. |
| H16 | **Mid-class refresh / disconnect forces a full re-join.** `onDisconnected` for a network drop sets an error whose only recovery is `window.location.reload()`, which resets `hasJoined` → the student lands back on the PreJoin screen. LiveKit's own reconnection is bypassed, and the round-trip generates another ghost-drop attendance pair. | [MeetingRoom.tsx:61-76](apps/web/src/features/live-class/components/room/MeetingRoom.tsx#L61-L76) | Let LiveKit auto-reconnect; only surface a terminal error after its retries are exhausted; persist `hasJoined` in `sessionStorage`. |
| H17 | **Coach class scheduling has no overlap detection.** `AdminService.createDemoClass`/`updateDemoClass` carefully check for conflicts; `CoachService.createClass`/`updateClass` do not. A coach can double-book, and can schedule classes in the past. | [coach.service.ts:172-199](apps/api/src/coach/coach.service.ts#L172-L199), [:258-294](apps/api/src/coach/coach.service.ts#L258) vs [admin.service.ts:99-117](apps/api/src/admin/admin.service.ts#L99) | Extract the admin conflict check into a shared helper and call it from both; add a future-date guard. |
| H18 | **`updateClass`/`cancelClass` have no status guard.** A `COMPLETED` class can be edited — changing `startsAt`/`endsAt` retroactively rewrites every attendance percentage — or flipped to `CANCELLED`. | [coach.service.ts:258-317](apps/api/src/coach/coach.service.ts#L258-L317) | Reject edits when `status` is `LIVE`/`COMPLETED`/`CANCELLED`. |
| H19 | **`@Body() body: any` on three write endpoints; the Zod schemas exist but are never used.** `updatePolicy` passes the raw body into `prisma.update({data})` (mass assignment on `id`, `isActive`, `name`); `createDemoClass`/`updateDemoClass` accept anything — `new Date(undefined)` → Invalid Date → Prisma throws → 500. The code comment on line 56 admits the gap. | [attendance.controller.ts:200](apps/api/src/attendance/attendance.controller.ts#L200), [admin.controller.ts:56,66](apps/api/src/admin/admin.controller.ts#L56), unused: [types/index.ts:722-729,855-880](packages/types/src/index.ts#L722) | Apply `updateAttendancePolicySchema` / `createDemoClassRequestSchema` via a `ZodValidationPipe`. |
| H20 | **`markRemoteUpdate` echo suppression is timing-dependent.** The flag is cleared in `setTimeout(…, 0)`. When two remote messages land in the same tick, the first timer can clear the flag before the second store update lands, so the receiver re-broadcasts a remote change — an echo loop between two clients. | [useBoardSync.ts:83-88](apps/web/src/features/chessboard/hooks/useBoardSync.ts#L83-L88), [:194-197](apps/web/src/features/chessboard/hooks/useBoardSync.ts#L194) | Stamp each message with an origin id and skip broadcasting when the store update carries a remote origin, instead of a timed flag. |
| H21 | **Navigating move history desyncs every student to the end of the game.** `syncFromRemote` loads the FEN, then calls `loadPgn(payload.pgn)`, which overrides the position. When the coach steps back to ply 3 of a 10-move game, students jump to ply 10. | [createBoardStore.ts:344-357](apps/web/src/features/chessboard/store/createBoardStore.ts#L344-L357) | Send `historyIndex` alongside the PGN and replay to that ply after `loadPgn`. |
| H22 | **`ForceOpenBoard` calls `setState` during render.** `if (!isChessboardOpen && isCoach) setIsChessboardOpen(true)` sits in the render body — React logs "Cannot update a component while rendering a different component" and it can loop. | [live-class/[roomId]/board/page.tsx:29-34](apps/web/src/app/live-class/[roomId]/board/page.tsx#L29-L34) | Move it into a `useEffect`. |
| H23 | **`isOwn` is hardcoded `false` for all chat history.** After a refresh every one of your own past messages renders as someone else's. | [ChatProvider.tsx:50](apps/web/src/features/live-class/providers/ChatProvider.tsx#L50) | Compare `msg.senderId` against the current user id (return `senderId` from the API). |
| H24 | **Recording download is duplicated, hardcodes the URL, and uses `alert()`.** Two components contain a byte-identical `handleDownload` with a literal `/live-class/${classId}/recording/download`, bypassing `API_ROUTES` and `api/live-class.ts`, and reporting failure with a browser `alert` instead of the project toast. | [BatchClassesClient.tsx:47-57](apps/web/src/features/admin/components/BatchClassesClient.tsx#L47-L57), [CoachHistoryClient.tsx:25-35](apps/web/src/features/coach/components/CoachHistoryClient.tsx#L25-L35) | Add `downloadRecording()` to `api/live-class.ts` using `API_ROUTES.liveClass.downloadRecording`; use `toast.error`. |
| H25 | **CSV export is unescaped and formula-injectable.** Values are wrapped as `"${v}"` with no doubling of embedded quotes — one student name containing `"` corrupts the file. No `=`/`+`/`-`/`@` prefix neutralisation either. | [attendance.service.ts:1713-1717](apps/api/src/attendance/attendance.service.ts#L1713-L1717) | Escape with `v.replace(/"/g,'""')` and prefix formula-leading values with `'`. |
| H26 | ✅ **Fixed** — `users.list`, `batches.list`, `admin.listBatchClasses`, `admin.listDemoClasses` are server-paginated (`?page/pageSize/search/sort/order/status`, allow-listed sort, `count` + `skip`/`take`, `pagination` meta). Web tables use a shared `useServerTable` hook (debounced server search, `manualPagination`/`manualSorting`). | [pagination.ts](apps/api/src/common/pagination.ts), [useServerTable.ts](apps/web/src/hooks/useServerTable.ts) | — |

---

### 🟡 MEDIUM

| # | Finding | Location | One-line fix |
|---|---|---|---|
| M1 ✅ | Webhook events are not idempotent — LiveKit retries produce duplicate RECONNECT logs and inflated `reconnectCount`/durations. | [attendance-webhook.controller.ts:87-206](apps/api/src/attendance/attendance-webhook.controller.ts#L87) | Store LiveKit's event id and skip already-processed ids. |
| M2 ✅ | `room_finished` may arrive before the last `participant_left`; totals computed at finalize are never recomputed when the late event lands. | [attendance-webhook.controller.ts:199-201](apps/api/src/attendance/attendance-webhook.controller.ts#L199) | Close all open sessions inside `finalizeClassAttendance` and make it re-runnable. |
| M3 ✅ | `finalizeClassAttendance` is not idempotent — open sessions are measured against `new Date()` and never closed, so a second run inflates durations. | [attendance.service.ts:453-546](apps/api/src/attendance/attendance.service.ts#L453), [:1725-1752](apps/api/src/attendance/attendance.service.ts#L1725) | Close open logs with `sessionEnd = classEndTime` before summing. |
| M4 ✅ | `absentCount` uses two different formulas in two reports (`total - presentCount` vs `total - attendances.length`), and can go negative when an attendee is no longer in the batch. | [attendance.service.ts:840](apps/api/src/attendance/attendance.service.ts#L840) vs [:1143](apps/api/src/attendance/attendance.service.ts#L1143) | Extract one shared tally helper and clamp at 0. |
| M5 ✅ | N+1: the admin dashboard's 6-month trend issues 18 sequential queries in a `for` loop. | [attendance.service.ts:1428-1473](apps/api/src/attendance/attendance.service.ts#L1428) | Replace with a single `groupBy` over the 6-month range. |
| M6 ✅ | N+1: the coach teaching report issues 3 queries per coach inside `Promise.all` (150 queries at 50 coaches). | [attendance.service.ts:1021-1048](apps/api/src/attendance/attendance.service.ts#L1021) | Aggregate with `groupBy({ by: ['coachId'] })`. |
| M7 ✅ | The "today" window is a rolling `now-4h … now+20h`, not a real day, in four places. At 11pm a class at 9am tomorrow counts as today. | [attendance.service.ts:1380-1381](apps/api/src/attendance/attendance.service.ts#L1380), [coach.service.ts:49-50,121-122](apps/api/src/coach/coach.service.ts#L49), [student.service.ts:25-26](apps/api/src/student/student.service.ts#L25) | Compute day bounds in the viewer's timezone. |
| M8 ✅ | Trash sorting by `title`/`entity`/`deletedBy` was wrong: each entity was fetched ordered by `deletedAt` and only re-sorted in memory. | [trash.repository.ts](apps/api/src/trash/trash.repository.ts), [trash.service.ts](apps/api/src/trash/trash.service.ts) | Per-entity SQL `orderBy` now matches the merge key. |
| M9 ✅ | Trash deep pagination was O(page × pageSize × 6). | [trash.service.ts](apps/api/src/trash/trash.service.ts) | Per-entity scan capped at `MAX_TRASH_SCAN` (500); deeper offsets documented as unsupported. |
| M10 ✅ | `bulkPermanentDelete` fails wholesale if the selection contains both a User and a row that cascades from it — the second delete throws and the whole transaction rolls back. | [trash.service.ts:99-119](apps/api/src/trash/trash.service.ts#L99) | Sort deletions parent-last, or tolerate `P2025` per item. |
| M11 ✅ | `emptyTrash` / nightly cleanup delete every expired row in one long transaction — lock contention and timeout risk at volume. | [trash.service.ts:121-168](apps/api/src/trash/trash.service.ts#L121) | Batch in chunks of ~500 with the advisory lock held per chunk. |
| M12 ✅ | `deleteExternalAssets` is a no-op stub — Cloudinary avatars and OCI recordings are never removed on permanent delete. | [trash.service.ts:199-201](apps/api/src/trash/trash.service.ts#L199) | Implement, or remove the stub and document the retention gap. |
| M13 ✅ | Trash restore did not cascade: restoring a `Batch` left its `BatchStudent` rows deleted; restoring a `User` did not restore their profile. | [trash.repository.ts](apps/api/src/trash/trash.repository.ts) | `deleteGroupId` column groups a cascading delete; `restore` brings the whole group back. |
| M14 ✅ | `StudentProfile`/`CoachProfile` were registered as trash entities but nothing soft-deleted them on a user delete. | [trash.repository.ts](apps/api/src/trash/trash.repository.ts), [user.service.ts](apps/api/src/user/user.service.ts) | `cascadeSoftDelete` retires child profiles/assignments with the parent. |
| M15 ✅ | `updateCoachStatus` sets `user.status = 'DELETED'` without soft-deleting — a zombie that still appears in user lists but cannot log in. | [admin.service.ts:63-70](apps/api/src/admin/admin.service.ts#L63) | Route through `TrashRepository.softDelete`. |
| M16 ✅ | Changing a user's role STUDENT↔COACH creates the new profile but leaves the old one; the user ends up with both. | [user.service.ts:175-184](apps/api/src/user/user.service.ts#L175) | Soft-delete the obsolete profile in the same transaction. |
| M17 ✅ | `UserService.toAuthUser` omits `username` (the auth-service version includes it) — usernames never render in the admin user list. | [user.service.ts:371-407](apps/api/src/user/user.service.ts#L371) | Add `username: user.username`. |
| M18 ✅ | Guest demo identities use `Math.random().toString(36).substring(7)` ≈ 4 characters — collisions are likely, and a collision makes LiveKit evict the earlier guest. | [live-class.service.ts:402](apps/api/src/live-class/live-class.service.ts#L402) | Use `crypto.randomUUID()`. |
| M19 ✅ | Guest participant metadata is a read-modify-write on a JSON column — concurrent joins lose entries. | [live-class.service.ts:414-425](apps/api/src/live-class/live-class.service.ts#L414) | Move guests to a real table, or update with a JSONB append in raw SQL. |
| M20 ✅ | `stopRecording` never records the final artifact state; `recordingUrl` is set at *start*, so a failed egress still shows a Download button that 404s. | [live-class.service.ts:501-509](apps/api/src/live-class/live-class.service.ts#L501) | Set `recordingUrl` from the `egress_ended` webhook, not at start. |
| M21 ✅ | `handleStaleClasses` runs every minute across all instances with no advisory lock, and `internalEndClass` is not idempotent. | [live-class.service.ts:265-301](apps/api/src/live-class/live-class.service.ts#L265) | Wrap in `pg_try_advisory_xact_lock` like the trash cleanup does. |
| M22 ✅ | Any `listParticipants` failure is reported to students as "Coach has not joined the meeting yet", masking real LiveKit outages. | [live-class.service.ts:181-185](apps/api/src/live-class/live-class.service.ts#L181) | Distinguish "room empty" from "LiveKit unreachable". |
| M23 ✅ | The `clientId` multi-device feature is half-built: only the board tab passes one, so a user opening the meeting in two tabs is evicted for duplicate identity. | [useLiveClass.ts:4](apps/web/src/features/live-class/hooks/useLiveClass.ts#L4), [live-class/[roomId]/page.tsx:21](apps/web/src/app/live-class/[roomId]/page.tsx#L21) | Always generate a stable per-tab `clientId`. |
| M24 ✅ | Chat dedup matches on `senderName + message + ±2s` — a user legitimately sending the same short message twice loses the second. | [ChatProvider.tsx:88-102](apps/web/src/features/live-class/providers/ChatProvider.tsx#L88) | Deduplicate on a client-generated message id. |
| M25 ✅ | `livekitMessages` is rebuilt on every render, so the `chatMessages` `useMemo` never memoizes and the unread-count effect re-runs constantly. | [ChatProvider.tsx:62-82](apps/web/src/features/live-class/providers/ChatProvider.tsx#L62) | Wrap the map in `useMemo` keyed on `rawChatMessages`. |
| M26 ✅ | Chat persistence is fire-and-forget (`.catch(console.error)`) — a failed write silently loses the message on the next reload. | [ChatProvider.tsx:122-129](apps/web/src/features/live-class/providers/ChatProvider.tsx#L122) | Surface a toast and retry once. |
| M27 ✅ | `saveChatMessage` double-encodes: it passes `JSON.stringify({message})` as `body`, which axios then sends as a raw string. It works by accident and is inconsistent with every other call. | [api/live-class.ts:30-35](apps/web/src/features/live-class/api/live-class.ts#L30) | Pass the plain object. |
| M28 ✅ | `useBoardSync` subscribes to nine store fields, so it re-renders on every board change and re-registers the data-channel callback each time. | [useBoardSync.ts:21-25](apps/web/src/features/chessboard/hooks/useBoardSync.ts#L21) | Use selector subscriptions / `getState()` inside callbacks. |
| M29 ✅ | Board permissions are broadcast twice — once by the store subscription and once explicitly by `useLiveBoardSync`. | [useBoardSync.ts:184-228](apps/web/src/features/chessboard/hooks/useBoardSync.ts#L184), [useLiveBoardSync.ts:36-39](apps/web/src/features/live-class/hooks/useLiveBoardSync.ts#L36) | Keep one path. |
| M30 ✅ | `ZodPipe` swallows the Zod error and returns a bare "Validation failed" — users never learn which field is wrong. | [coach.controller.ts:17-26](apps/api/src/coach/coach.controller.ts#L17-L26) | Map `error.issues` into the `BadRequestException` message. |
| M31 ✅ | `getCompletedClasses` / `exportAttendanceReport` build `where: any` from unvalidated query strings; a malformed date yields `Invalid Date` → Prisma throws → 500. | [attendance.service.ts:912-923](apps/api/src/attendance/attendance.service.ts#L912), [:1647-1674](apps/api/src/attendance/attendance.service.ts#L1647) | Validate query params with a Zod DTO. |

---

### 🟢 LOW

| # | Finding | Location | One-line fix |
|---|---|---|---|
| L1 ✅ | `useChessLogic.ts` is 75 lines of dead, broken duplicate move logic — zero importers, and it writes to the wrong store. | [useChessLogic.ts](apps/web/src/features/chessboard/hooks/useChessLogic.ts) | Delete it. |
| L2 | `boardStore.ts`'s `undo/redo/pushHistory/reset/syncFromRemote` are dead (only `lastMoveType` + prefs are used); its `undo` even carries a TODO admitting it is incomplete. | [boardStore.ts:94-125](apps/web/src/features/chessboard/store/boardStore.ts#L94) | Reduce it to a preferences store. |
| L3 ✅ | `queryKeys.auth.session` is defined but never used; everything hardcodes `["auth","me"]`, so invalidating the documented key is a no-op. | [queryKeys.ts:4-6](apps/web/src/lib/queryKeys.ts#L4), [SessionBootstrap.tsx:17](apps/web/src/providers/SessionBootstrap.tsx#L17), [AuthLayout.tsx:26](apps/web/src/features/auth/components/AuthLayout.tsx#L26) | Use the factory. |
| L4 ✅ | `/test-board` is a dev scratch page shipped to production with `token="test-token"`, and it is not in the middleware matcher. | [app/test-board/page.tsx](apps/web/src/app/test-board/page.tsx) | Delete or gate behind `NODE_ENV !== 'production'`. |
| L5 | `SessionBootstrap` calls `/auth/me` on every page including public ones, so anonymous visitors always burn a 401 + a failed refresh. | [SessionBootstrap.tsx:15-19](apps/web/src/providers/SessionBootstrap.tsx#L15) | Skip when no auth cookie is present. |
| L6 | `MeetingRoom.homeHref` and `useBoardSync.isCoach` handle `SUPER_ADMIN` but omit `ADMIN`, so admins are treated as students. | [MeetingRoom.tsx:67](apps/web/src/features/live-class/components/room/MeetingRoom.tsx#L67), [useBoardSync.ts:15](apps/web/src/features/chessboard/hooks/useBoardSync.ts#L15) | Centralise a `isStaff(role)` helper. |
| L7 | `isIgnorableRoomError` matches any message containing "disconnect", swallowing genuine errors. | [MeetingRoom.tsx:27-33](apps/web/src/features/live-class/components/room/MeetingRoom.tsx#L27) | Match on `DisconnectReason` enum values. |
| L8 | `getClassDetails` falls back to `class.createdAt` as a participant's `joinedAt` — a meaningless timestamp. | [coach.service.ts:243](apps/api/src/coach/coach.service.ts#L243), [admin.service.ts:373](apps/api/src/admin/admin.service.ts#L373) | Return `null`. |
| L9 | `getDashboard` fetches full `BatchStudent` rows just to `.length` them. | [coach.service.ts:56-59](apps/api/src/coach/coach.service.ts#L56) | Use `groupBy`/`count` with `distinct`. |
| L10 | `AdminController.getAdminId`'s own `UnauthorizedException('Only Super Admins…')` is caught by its own `catch`, so the specific message never reaches the client. | [admin.controller.ts:29-35](apps/api/src/admin/admin.controller.ts#L29) | Move the role check outside the `try`. |
| L11 ✅ | `saveChatMessage` builds the display name as `${firstName} ${lastName}` without a null guard — renders "Jane null". | [live-class.service.ts:441-443](apps/api/src/live-class/live-class.service.ts#L441) | Use the `.trim()` pattern used elsewhere. |
| L12 | `LiveChessboardPanel`'s close button calls `window.close()` inside a `try{}catch{}` — a silent no-op in the embedded panel. | [LiveChessboardPanel.tsx:158-163](apps/web/src/features/live-class/components/meeting/LiveChessboardPanel.tsx#L158) | Only call it in the popped-out board tab. |

---

## Section B — Feature gaps by role

### Super Admin
| Area | State | Note |
|---|---|---|
| User management | ✅ Working | Server-paginated + search + sort (H26). No `username` field (M17). |
| Batch management | ✅ Working | Server-paginated + search + sort (H26). |
| Trash | ✅ Working | Cross-entity sort (M8) and cascade delete/restore via `deleteGroupId` (M13/M14) fixed; deep-offset scan bounded (M9). External assets cleaned on permanent delete (M12). |
| Backups | ⚠️ Risky | Restore is a one-shot `DROP SCHEMA` with no rollback (C6). Long-running sync request will 504 behind Nginx. |
| Demo classes | ✅ Working | No request validation (H19). |
| Batch class oversight | ✅ Working | Server-paginated + search + sort (H26). |
| Attendance dashboard | ⚠️ Partial | 18 sequential queries (M5); "today" is a rolling window (M7); `earlyExits` is hardcoded `0`. |
| Attendance policy | ⚠️ Broken | GET unauthenticated (C5); PUT unvalidated + mass-assignable (H19); no ordering check that present > late > partial. |
| Coach approval | ❌ Non-functional | The screen exists but self-registered coaches are already ACTIVE (H9). |

### Admin
| Area | State | Note |
|---|---|---|
| **Everything under `/admin`** | ❌ **Blocked** | Every admin/backup endpoint requires `SUPER_ADMIN` (H1). An ADMIN can log in, is routed to `/admin`, and gets 401s. |
| User/batch management | ✅ Working | These live on `UserService`/`BatchService`, which do accept ADMIN. |

### Coach
| Area | State | Note |
|---|---|---|
| Dashboard / batches / students | ✅ Working | Rolling-window "today" (M7); N+1-ish student count (L9). |
| Class scheduling | ✅ Fixed (H17, H18) | Overlap + past-date checks now shared with admin; edits/cancels blocked once a class leaves `SCHEDULED`. Validation errors still opaque (M30). |
| Start / run live class | ⚠️ Partial | Destroys the schedule (H2); no lock on auto-end (M21). |
| Recording | ⚠️ Partial | Download works, but `recordingUrl` is set optimistically so failed recordings show a broken button (M20). |
| Teaching stats | ⚠️ Partial | `lateStarts` always 0 (H2), `earlyExits` hardcoded 0, `boardDuration` always 0 (C4). |
| Attendance review | ⚠️ Partial | Can view *any* student's logs, not just their own (H13). |
| Class history | ✅ Working | Capped at 50 rows, no pagination. |

### Student
| Area | State | Note |
|---|---|---|
| Dashboard | ⚠️ Partial | Times formatted in server tz (H11); attendance % disagrees with the attendance page (H10). |
| **Continue Learning / Practice / Announcements** | ❌ **Permanently empty** | `Course`, `CourseModule`, `Practice`, `StudentPractice`, `StudentActivity`, `Announcement` are queried but **no API or admin UI exists to create any of them**. Seed data only. | 
| Attendance page | ⚠️ Partial | Duplicate implementation of the same feature (H10). |
| Join live class | ✅ Fixed | Coach-not-joined shows a polling "waiting" screen (H14); refresh / reconnect resumes the meeting (H16); phantom disconnects removed (H3). |
| Chessboard participation | ✅ Fixed | Control is coach-granted only (C7); move sounds implemented (H5). |
| Recordings | ✅ Working | Authorized via batch membership. |

### Chessboard — confirmed state vs missing
| Feature | State |
|---|---|
| Move validation, legal dests, promotion dialog | ✅ Implemented (chess.js + chessground) |
| Arrows / square highlights / drawing toolbar | ✅ Implemented and synced |
| Orientation flip, FEN/PGN setup, move list | ✅ Implemented |
| Stockfish panel, PDF panel, masterbase panel | ✅ Implemented |
| Coach→student board sync | ✅ Fixed — sender-authorized (C7), echo-race fixed (H20), history navigation stays in sync via `fullPgn` + `historyIndex` (H21) |
| **Sound** | ✅ Fixed (H5, H6) — WebAudio buffer cache + placeholder WAV cues; remote moves forward `moveType` |
| **Clock / timer** | ❌ **Not present at all** — no clock state in either store, no increment, no flag-fall |
| **Practice detach / resync** | ❌ **Not present** — one shared store per room; no per-student local board, no "resync to coach" action |
| Board settings persistence | ❌ Wired to the wrong store (H7) |
| Jump-to-start / jump-to-end | ✅ Fixed (H8) — buttons wired to `jumpToStart`/`jumpToEnd`; `reset` behind a confirm |
| Board attendance duration | ❌ FK violation on every write (C4) |
| Variations / annotations (NAG, comments) | ❌ Not present (`moveHistory` is a flat line) |

### Live class / LiveKit — half-finished steps
- **Webhook verification fallback** makes signing pointless (C2).
- **No egress lifecycle handling** — `egress_ended` is not consumed, so recording state is optimistic (M20).
- **`clientId` multi-device** is implemented server-side and used only by the board tab (M23).
- **`participant_left` reason mapping** hardcodes LiveKit enum indices as strings — brittle across SDK versions ([attendance-webhook.controller.ts:172-181](apps/api/src/attendance/attendance-webhook.controller.ts#L172)).
- **No "class ended" screen** — `ROOM_DELETED` silently redirects students home ([MeetingRoom.tsx:61-69](apps/web/src/features/live-class/components/room/MeetingRoom.tsx#L61)).
- **No waiting room / lobby** despite the "coach hasn't joined" gate needing one.

### API ↔ frontend wiring mismatches
| Endpoint | Status |
|---|---|
| `GET /batches/:id` (`batches.get`) | **No frontend caller** — the list response is reused instead. |
| `GET /attendance/class/:id/live` (`classLive`) | **No frontend caller** — `getLiveClassMonitoring` is fully implemented and unused; there is no live-monitoring screen. |
| `GET /attendance/student/:id` (`studentById`) | **No frontend caller** — admins cannot drill into one student's attendance. |
| `GET /attendance/coach/:id` (`coachById`) | **No frontend caller** — admin coach drill-down missing. |
| `GET /live-class/:id/recording/download` | Called, but **bypasses `API_ROUTES`** via a hardcoded string in two components (H24). |
| `POST /upload/pgn` | No frontend caller found. |
| `packages/ui`, `packages/utils` | Empty shells — declared as workspaces, export nothing. |

---

## Section C — Failure points

| Scenario | Current behaviour | Risk |
|---|---|---|
| **API unreachable** | `apiFetch` shows a global "Connection Error" toast and rejects. Most `useQuery` callers render a generic empty table rather than an error state. | Medium — user sees "No results." and assumes there is no data. |
| **Access token expires mid-session** | Interceptor queues requests, calls `/auth/refresh`, retries. Works. On refresh failure it clears the session, toasts, and dispatches `auth:logout`. | Low — this path is well built. |
| **Refresh token reuse / rotation race** | Two tabs refreshing simultaneously: the first rotates and revokes the session; the second presents the now-revoked token, `refresh` revokes and throws → **both tabs log out**. | High — multi-tab users get logged out randomly. `auth.service.ts:335-338`. |
| **LiveKit disconnects mid-class** | ✅ Fixed — LiveKit auto-reconnects (toast only); a reload resumes into the meeting via the persisted `hasJoined` flag (H16). Ghost-drop pair removed (H3). | Low. |
| **Coach refreshes mid-class** | Same re-join flow; the class stays LIVE so it recovers, but `coachAttendance` gains a spurious LEAVE/RECONNECT pair. | Medium. |
| **Coach closes the tab without ending the class** | The per-minute cron only auto-ends *after* `endsAt` has passed. Between those points the room stays LIVE and students can still join. | Medium — `live-class.service.ts:265-301`. |
| **Two coaches / admin + coach in one room** | Both are `isCoach` for the board; both answer `REQUEST_SYNC`; both can move. Last write wins. | Medium — no single-authority model. |
| **Concurrent edits to the same batch** | `batch.update` soft-deletes all assignments then upserts. Two admins saving at once → last write wins silently, no optimistic concurrency. | Medium — `batch.service.ts:205-251`. |
| **Concurrent `recordJoinEvent`** | `upsert` on `classId_studentId` can throw P2002 under race; not caught. | Medium — `attendance.service.ts:42-56`. |
| **Backup restore fails halfway** | Schema already dropped → **empty database**, error only in logs. | Critical (C6). |
| **Malformed date in any admin filter** | `new Date("junk")` → Invalid Date → Prisma throws → **500 with a stack trace shape** to the client. | Medium (M31). |
| **Soft-deleted email reused** | P2002 → **unhandled 500** instead of a 409. | Critical (C3). |
| **Board tab opened** | FK violation swallowed by the webhook's catch-all; user sees nothing, data silently missing. | Critical (C4). |

### Missing validation inventory
| Endpoint / form | Missing |
|---|---|
| `PUT /attendance/policy` | No DTO at all (`any`); `updateAttendancePolicySchema` unused. |
| `POST /admin/demo-classes`, `PATCH /admin/demo-classes/:id` | No DTO (`any`); Zod schemas unused. |
| `GET /attendance/admin/completed-classes`, `/admin/export`, `/admin/coach-report` | ✅ `dateFrom`/`dateTo` validated → 400 not 500 (M31). |
| `POST /live-class/:id/chat` | ✅ 2000-char limit + empty-message guard (M27). |
| `POST /upload/pgn` | No size limit on the PGN string. |
| `GET/POST/DELETE /admin/backups/*` | `key` unvalidated (no prefix check). |
| `PATCH /admin/coaches/:id/status` | `UpdateCoachStatusRequest` is a bare type, not a validated DTO. |
| Attendance policy thresholds | No check that `present > late > partial`, or that they are 0–100. |
| `CreateClassRequest` | No future-date or duration bounds. |

### Where a 500 or unhandled rejection can reach the user
1. Re-creating a soft-deleted email/username (C3).
2. Any malformed date/number in an admin filter (M31).
3. `createDemoClass` with a missing/invalid `startsAt` (H19).
4. `recordBoardJoinEvent` FK violation — swallowed by the webhook catch, so it silently corrupts data rather than erroring (C4).
5. Concurrent `classAttendance.upsert` P2002 (see table above).
6. `LiveKitService.onModuleInit` throws if LiveKit env vars are missing — **the whole API fails to boot**, not just the live-class module ([livekit.service.ts:24-27](apps/api/src/live-class/livekit.service.ts#L24)).
7. `backup.service` `execAsync` failures surface as a generic 500 after the schema has already been dropped (C6).

---

## Section D — Optimization opportunities

**Rendering**
- `table.setOptions` during render in 5 components (H4) — the single biggest correctness+perf issue on the frontend.
- `ChatProvider` rebuilds `livekitMessages` every render, defeating the `chatMessages` memo and re-running the unread effect (M25).
- `useBoardSync` destructures 9 store fields, so it re-renders and re-registers the LiveKit data-channel handler on every board change (M28).
- ✅ Server-side filtering/sorting/pagination on users, batches, batch classes, and demo classes (H26).
- `ProfileForm.tsx` (642 lines) and `MeetingVideoGrid.tsx` (592 lines) are the two largest components and are not split or memoized.

**Database**
- Missing partial unique indexes (C3).
- N+1 in the admin dashboard trend (M5) and coach teaching report (M6).
- ✅ Pagination added to the 4 list endpoints (H26).
- ✅ Trash list per-entity scan bounded at 500 rows (M9) — still an in-memory merge, not a keyset.
- `coach.getDashboard` materializes rows to count them (L9).
- No index on `CoachClass.isDemo` despite `where: { isDemo: true/false }` being the primary filter for two admin lists.
- `AttendanceLog` has no composite index on `(attendanceId, eventType, sessionEnd)` — the "find open session" query runs on every join/leave.

**God components / duplicated logic** (beyond the three you flagged)
| Component | Lines | Note |
|---|---|---|
| `ProfileForm.tsx` | 642 | Largest component in the app; handles student + coach + shared fields inline. |
| `MeetingVideoGrid.tsx` | 592 | Layout, pinning, screenshare, and track filtering in one file. |
| `DemoClassesClient.tsx` | 484 | Same `columns:[]` + `setOptions` pattern as the three you flagged. |
| `BatchClassesClient.tsx` | 324 | Same pattern; plus the duplicated `handleDownload`. |
| `completed-classes/[id]/page.tsx` | 483 | A page component doing full report rendering. |
| `MeetingChat.tsx` | 421 | — |
| **Duplicated logic** | | `handleDownload` ×2 (H24); `getAuthenticatedUser` ×8 across services (candidate for a shared guard); attendance % ×2 (H10); board move logic ×2 (`useChessLogic` dead, L1); two board stores (L2); `fmt(date)` conflict-message helper ×3 in `admin.service.ts`. |

---

## Section E — Verification checklist

Legend: **Read-verifiable** = I can assert the behaviour from the code alone. **Needs runtime** = requires running the app/DB/LiveKit to confirm.

| Feature | Verifiable by reading? | Why |
|---|---|---|
| **Auth — login/register/refresh/logout** | ✅ Mostly | Token flow, rotation, hashing, and cookie flags are fully traceable. **Needs runtime** for the multi-tab refresh race (I can see the revoke-then-issue ordering but not the real interleaving) and for actual cookie behaviour under HTTPS + cross-origin. |
| **Auth — password reset / email verification** | ⚠️ Partial | Reset is complete and traceable. **Email verification is commented out** in two places (`auth.service.ts:215-227, 572-584`) — reading proves it's disabled, but confirming SMTP delivery needs runtime. |
| **Coach approval flow** | ✅ Yes | Reading proves `registerCoach` sets ACTIVE while `approvalStatus` defaults to PENDING, and nothing gates on it. Definitively broken. |
| **Batch management (CRUD, assign, archive)** | ✅ Yes | Full path is traceable. The P2002-on-reuse failure (C3) is provable from the schema + migrations. |
| **User management** | ✅ Yes | Same. The ADMIN lockout (H1) is provable from the role checks. |
| **Trash — soft delete, restore, empty, retention** | ⚠️ Partial | Delete/restore/cleanup logic is fully readable. **Needs runtime** to confirm the advisory-lock behaviour under concurrent instances and the real cost of the over-fetch pagination. |
| **Trash — sorting/filtering** | ✅ Yes | The per-entity-order-then-merge flaw is provable from the code. |
| **Live class — start / token / join** | ⚠️ Partial | Authorization and the coach-presence gate are readable. **Needs runtime** to confirm LiveKit identity matching, real webhook ordering, and whether the coach-presence check races with the coach's own connection. |
| **Live class — attendance recording** | ❌ Needs runtime | Depends entirely on LiveKit webhook ordering, retries, and timing. I can prove C4 (FK violation) and H3 (ghost drop) from code, but the resulting *numbers* need a real session to validate. |
| **Live class — recording (egress)** | ❌ Needs runtime | Requires a configured OCI bucket and a real egress; the failure mode (M20) is inferred, not observed. |
| **Chessboard — local play** | ✅ Yes | chess.js integration, legal moves, promotion, history are all traceable. |
| **Chessboard — sound** | ✅ Yes | Empty function bodies. Definitively 0%. |
| **Chessboard — clock / practice detach** | ✅ Yes | Absent from both stores and all components. Definitively not implemented. |
| **Chessboard — coach↔student sync** | ⚠️ Partial | Message types and handlers are readable; C7 (no auth) and H21 (PGN override) are provable. **Needs runtime** for H20 (the echo race is timing-dependent) and for real-world latency behaviour. |
| **Chessboard — settings persistence** | ✅ Yes | Provable: the dialog reads the context store, `persist` is on the other store. |
| **Stockfish panel** | ❌ Needs runtime | Requires the `stockfish` binary at `STOCKFISH_PATH` and a process pool; I did not read the engine lifecycle deeply. Flagged as untested. |
| **Attendance calculations** | ⚠️ Partial | `attendance-calculations.spec.ts` covers the pure helpers. H15 (streak) and M3/M4 (idempotency, absent counts) are provable by reading. End-to-end numbers need runtime. |
| **Attendance reports / CSV export** | ✅ Yes | Query shape and the CSV escaping bug (H25) are provable. |
| **Filters & data tables (all screens)** | ⚠️ Partial | The `setOptions`-during-render defect is provable. **Needs runtime** to see whether it manifests as visible bugs (React 18 StrictMode double-render in dev should surface it immediately). |
| **Backups — list / trigger / download** | ❌ Needs runtime | Requires OCI credentials and `pg_dump` in the container. |
| **Backups — restore** | ❌ Needs runtime, and **should be tested only against a throwaway database** | It drops the public schema first. |
| **Deployment pipeline** | ❌ Needs runtime | Path filters and the SSH script are readable, but only a real push proves the service-selection logic. |
| **E2E coverage** | ⚠️ Thin | Only `e2e/attendance-flow.spec.ts` exists (480 lines). No E2E for auth, batches, trash, chessboard, or the meeting room. |

---

## Suggested fix order

1. **C1** (unauthenticated uploads + arbitrary delete) — smallest fix, largest exposure.
2. **C2** (webhook verification bypass) — delete four lines.
3. **C3** (partial unique indexes) — one migration; unblocks a whole class of 500s.
4. **C5** (unauthenticated policy endpoint) + **H19** (missing DTOs) — same sitting.
5. **C4** (board attendance FK) — one-line data fix, restores a dead feature.
6. **H1** (ADMIN lockout) — decide the role model, then fix once.
7. **C6** (backup restore safety) — before anyone uses it in anger.
8. **C7 / H20 / H21** (board sync authority + races) — one focused pass on `useBoardSync`.
9. **H4** (`setOptions` during render) — one shared refactor across 5 components.
10. **H2 / H3** (schedule mutation + phantom disconnects) — these two poison every attendance number; fix together and consider a data backfill.

---

*No code was changed in producing this report.*

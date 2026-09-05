# P0 Classroom Reliability — Design (Phase 0 audit)

Status: **design doc, no application code changed in this phase.**
Scope per CLAUDE.md §3.0: this repo's live-class/attendance stack is *already
substantially built*. This doc inventories what exists (with file:line
references) against the P0 reliability spec, so the follow-up phases build the
missing 20% instead of re-deriving the 80% that's already correct and tested.

Read alongside: `docs/BACKLOG.md` (esp. the LiveKit-webhooks and
"Resolved 2026-08-30" sections, which cover most of the ground this spec asks
for), `.agents/AGENTS.md`, `CLAUDE.md` §3.7.

---

## 1. Executive summary

The platform already has a **server-authoritative class/session state machine**,
**idempotent webhook processing**, **join/leave/reconnect attendance logging**,
**coach teaching-hour + board-usage calculation**, **an admin/coach live
monitoring view**, **multi-tab-safe LiveKit identities**, and **chessboard/chat
state that survives a reconnect at the transport level**. This was built and
hardened over the 2026-08-29/08-30 remediation (see BACKLOG.md).

What is genuinely missing, and is the actual net-new work for this initiative:

1. **No heartbeat/presence channel independent of LiveKit webhooks.** Liveness
   is 100% inferred from `participant_joined`/`participant_left` webhook
   deliveries. If a webhook is lost (not retried, or LiveKit↔API network
   partition), the system has no fallback signal. `AttendanceService
   .recordDisconnectEvent` exists but **is dead code — never called** — it
   reads like a heartbeat-timeout path that was stubbed and never wired.
2. **No first-class reconnect grace period.** There's a 2-minute
   `DUPLICATE_JOIN_WINDOW_MS` that retroactively folds a fast rejoin back into
   the same session, but nothing surfaces "this participant is in their grace
   window" as live state — a drop writes `LEAVE` immediately.
3. **`getLiveClassMonitoring`'s `isOnline` has no staleness check** — it
   trusts the last log's `eventType` with no timeout, so a lost `LEAVE`
   webhook leaves a gone student shown "online" until `finalizeClassAttendance`
   runs at class end.
4. **Two parallel, loosely-coupled status fields** — `CoachClass.status`
   (`ClassStatus` enum) and `LiveSession.status` (plain `String`, not an enum)
   — with no single documented owner of "what state is this class really in."
5. **No frontend session/connection coordinator.** Reconnect/presence/identity
   logic is spread across five files with no shared abstraction — this is
   what the spec's `ClassroomSessionManager` / `ConnectionStateManager` need to
   consolidate.
6. **No cross-class admin reliability view** — only the existing per-class
   `LiveClassMonitor` (10s poll, coach/admin, one class at a time).
7. **Chat does not reconcile on reconnect** — history is fetched once on
   mount; unlike the board (`REQUEST_SYNC`/`FORCE_SYNC`), nothing re-fetches
   `getChatHistory` after a `Reconnecting → Connected` transition.

Everything else in the spec (server-authoritative lifecycle, participant
tracking, webhook idempotency, attendance/coach-hour reconciliation, board
recovery, admin visibility) has a real, tested implementation already — see
§2 for the inventory and §4 for exactly what to add on top of it.

---

## 2. Existing implementation inventory

Status legend: **EXISTS** (built + tested, reuse as-is) · **PARTIAL** (built,
missing the reliability layer the spec asks for) · **NET-NEW** (not present).

### 2.1 Class / session lifecycle — PARTIAL

| Piece | File | Notes |
|---|---|---|
| `ClassStatus` enum | `apps/api/prisma/schema.prisma:56` | `SCHEDULED\|LIVE\|COMPLETED\|CANCELLED\|IN_PROGRESS`. Confirmed via repo-wide grep: **no backend code ever writes `IN_PROGRESS`** (`live-class.service.ts` only ever sets `LIVE`) — but ~8 frontend call sites still defensively treat it as a live-alias (`status === "IN_PROGRESS" \|\| status === "LIVE"`, e.g. `ClassStatusBadge.tsx:14`, `BatchClassesClient.tsx:179`, `classes/[id]/page.tsx`). So it's write-dead in current code but not safely droppable without first confirming no historical prod rows carry it — a `SELECT count(*) FROM classes WHERE status = 'IN_PROGRESS'` against `vps_dev`/prod before any cleanup migration, not a same-change deletion. |
| `LiveSession.status` | `schema.prisma:649` | Plain `String @default("SCHEDULED")`, values `SCHEDULED\|WAITING\|LIVE\|ENDED\|CANCELLED` — a *different* vocabulary than `ClassStatus`, not a Prisma enum, so nothing stops a typo'd value at the DB layer. |
| `startClass` | `live-class.service.ts:106` | Coach-only, creates-or-resumes `LiveSession`, flips `CoachClass.status → LIVE`. Rejects if already `LIVE` (`ConflictException`). |
| `getToken` (join) | `live-class.service.ts:176` | Validates class is `LIVE`, checks coach-presence for students via `listParticipants` (not a DB read — a live LiveKit call), issues token, auto-opens `ClassAttendance` via `recordJoinEvent(..., { source: "TOKEN_REQUEST" })`. |
| `endClass` / `internalEndClass` | `live-class.service.ts:270,294` | **Idempotent by construction**: `updateMany({ where: { status: LIVE } })` — only the caller that actually flips `LIVE→ENDED` proceeds to delete the LiveKit room and finalize attendance. Safe against the cron sweep racing a manual end. |
| Stale-class sweep | `live-class.service.ts:331,354` (`@Cron(EVERY_MINUTE)`) | Postgres advisory lock (`pg_try_advisory_lock`) so only one API instance sweeps. Finds `LIVE` sessions past `class.endsAt` with no coach participant in the LiveKit room, auto-ends them. **This is the only existing "is this class actually still happening" reliability check**, and it only fires after the scheduled end — a class abandoned mid-session (coach disconnects at minute 10 of a 60-minute slot) is not caught until the scheduled end passes. |

**Design implication:** rather than adding a third status field, Phase 1
should (a) confirm `IN_PROGRESS` is truly dead and drop it in the same
migration that touches this enum, and (b) treat `LiveSession.status` as the
authoritative *session* state and `CoachClass.status` as the authoritative
*schedule* state, documenting the mapping explicitly instead of introducing a
new enum. Converting `LiveSession.status` to a real Prisma enum
(`LiveSessionStatus`) is a low-risk additive-migration cleanup worth bundling
in.

**Phase 1 update (2026-09-05):** `LiveSession.status` is now `LiveSessionStatus`
(real Prisma enum, additive migration
`20260904200047_p0_reliability_enum_values`). `ClassStatus.IN_PROGRESS` row
count on `vps_dev` (`coachClass.groupBy(["status"])`): **0** — only
`SCHEDULED`/`COMPLETED` rows exist in this environment. That confirms it's
safe to drop *here*, but `vps_dev` is this box's dev database, not the
production database backing the real VPS deployment — the same check still
needs to run there before actually dropping the enum value. Left as-is (not
dropped) pending that; `IN_PROGRESS` remains defined but unused.

### 2.2 Webhook handling & idempotency — EXISTS

`apps/api/src/attendance/attendance-webhook.controller.ts` (334 lines, no
separate `webhooks` module — it's the endpoint at `API_ROUTES.attendance.webhook`
= `/webhooks/livekit`, registered on `AttendanceWebhookController`):

- Signature verification via `livekit-server-sdk`'s `WebhookReceiver`; rejects
  in production if credentials are missing (dev-only unverified fallback).
- **Delivery-level idempotency**: `ProcessedWebhookEvent` (`schema.prisma:703`)
  — `event.id` as PK, insert-or-skip-on-P2002. Handles LiveKit's own webhook
  retries.
- **Semantic idempotency**: `isSameJoin()` (`:178`) — a `participant_joined`
  arriving within `DUPLICATE_JOIN_WINDOW_MS` (2 min) of an already-open
  session is treated as the same join, not a reconnect. This absorbs the
  `TOKEN_REQUEST`-then-`LiveKit-connect` race.
- **Ghost-drop reconciliation**: if a new `participant_joined` arrives while
  the last log is still `JOIN`/`RECONNECT` with no `LEAVE` (client crashed
  without a clean disconnect event), it synthesizes a `LEAVE` before recording
  the new join, so durations don't run forever.
- Routes `participant_joined`/`left` to student (`recordJoinEvent`/
  `recordReconnectEvent`/`recordLeaveEvent`), coach (`recordCoach*Event`), or
  board-tab (`recordBoardJoinEvent`/`recordBoardLeaveEvent`, identified by an
  `_board` identity suffix) paths.
- `room_finished` → `finalizeClassAttendance`. `egress_*` → recording lifecycle
  (`handleEgressEnded`).

This already satisfies "webhook idempotency" from the spec end-to-end. **No
changes needed here** except wiring a heartbeat-timeout path in (§4.1), which
is additive.

### 2.3 Participant / attendance tracking — EXISTS (student + coach + board)

| Model | File | Purpose |
|---|---|---|
| `ClassAttendance` + `AttendanceLog` | `schema.prisma:491,520` | Per-student, per-class row + an append-only join/leave/disconnect/reconnect log (`AttendanceEventType` enum, `schema.prisma:71`). `AttendanceLog` has a composite index (`attendanceId, eventType, sessionEnd`) specifically to make "find the still-open session" O(1) on every webhook. |
| `CoachAttendance` + `CoachAttendanceLog` | `schema.prisma:552,580` | Same shape for the coach, plus `boardDuration` and free-text `eventType` (`JOIN/LEAVE/DISCONNECT/RECONNECT/BOARD_JOIN/BOARD_LEAVE`) — **not a shared enum with `AttendanceLog`**, see §4.4. |
| `AttendancePolicy` | `schema.prisma:610` | `presentThreshold/lateThreshold/partialThreshold`, `gracePeriodMinutes`, `minDurationMinutes`, `reconnectTolerance` — **the grace-period concept already has a policy field** (`gracePeriodMinutes`); it is not currently read by any reconnect-timing logic (grep confirms only scoring code reads the policy, not the webhook/reconnect path) — reuse this field for Phase 1 rather than adding a new one. |

`AttendanceService` (2161 lines) has the full read/write surface: per-event
recorders (`recordJoinEvent`, `recordLeaveEvent`, `recordReconnectEvent`,
`recordCoachJoinEvent`, `recordCoachReconnectEvent`, `recordCoachLeaveEvent`,
`recordBoardJoinEvent`, `recordBoardLeaveEvent` — all `:55-493`), idempotent
`finalizeClassAttendance` (`:494`, re-runnable, compare-and-set on
`attendanceFinalizedAt`), and every report/query endpoint listed in §2.5.

`recordDisconnectEvent` (`:186`) is the one exception — **defined, fully
implemented, never called from anywhere in `apps/api/src`.** Confirmed via
repo-wide grep. This is exactly the shape of function a heartbeat-timeout
sweep needs; wire it in rather than writing a new one (§4.1).

**Phase 1 update (2026-09-05):** `recordDisconnectEvent` is now called from
`AttendanceService.sweepStaleHeartbeats` (`@Cron(EVERY_30_SECONDS)`,
`handleStaleHeartbeats`, same advisory-lock pattern as `handleStaleClasses`,
distinct lock id `73002003`). A new symmetric `recordCoachDisconnectEvent` was
added alongside it — the spec named only the student-side function, but since
`CoachAttendance.lastHeartbeatAt` also went in this phase (below), leaving the
coach side unswept would make half the new column dead weight. Both recorders
require the participant's last open `JOIN`/`RECONNECT` log to still be
unclosed, which is what keeps the sweep from re-firing every tick on an
already-disconnected row.

### 2.4 Coach teaching-hour calc & reconciliation — EXISTS

`finalizeClassAttendance` (`attendance.service.ts:494-644`) is the
reconciliation engine:

- Scores against **actual** session duration (`LiveSession.startedAt/endedAt`),
  falling back to the scheduled window only if the session never properly
  started/ended.
- `closeOpenAttendanceLogs` (`:2100`) clamps any log still open at finalize
  time to `classEndTime`, so a dropped final webhook can't leave a session
  "open" forever and finalize is safely re-runnable (does not grow durations
  against `new Date()` on a second run).
- Recomputes `boardDuration` authoritatively from `BOARD_JOIN`/`BOARD_LEAVE`
  logs (fixed 2026-08-30 per BACKLOG.md — a board tab open at class end used
  to undercount).
- Clears `joinedAt`/`leftAt` on zero-duration rows so a "loaded the page but
  never connected" row reads as a true absence, not a phantom join
  (BACKLOG.md, "Phantom Absent" fix).
- `getCoachTeachingStats`/`getAdminCoachTeachingReport`/`getClassDetailReport`
  (`:1471,1131,1251`) surface the reconciled numbers.

**No net-new schema or endpoints needed for coach-hour calc.** The only gap is
that today's inputs (webhook-derived logs) can be incomplete if a webhook is
lost — which is exactly what heartbeat data (§4.1) would backstop, making
reconciliation more *accurate*, not restructuring how it works.

### 2.5 Admin/coach reliability visibility — PARTIAL

`getLiveClassMonitoring` (`attendance.service.ts:1748`, route
`API_ROUTES.attendance.classLive`) + frontend `LiveClassMonitor`/
`LiveClassMonitorDialog` (`features/attendance/components/`,
`useLiveClassMonitoring` polling every 10s) — shipped 2026-08-30 per
BACKLOG.md. Coach/admin only, one class at a time, shown on `/classes/[id]`
and via a "Monitor Live" action on the admin batch-classes table.

Gaps against the spec's "admin reliability view":
- **No staleness/heartbeat check** — `isOnline` is purely
  `lastLog.eventType IN (JOIN, RECONNECT)` with no timeout (§1.3).
- **No cross-class view** — can't see "which live classes right now have
  reliability problems" without opening each one.
- **No webhook-health signal** — nothing surfaces `ProcessedWebhookEvent`
  volume/lag, or classes where the LiveKit webhook appears to have stopped
  delivering (the only existing check for that is the *scheduled-end-passed*
  sweep in §2.1, which is too coarse and too late for mid-class outages).

### 2.6 Chessboard sync / recovery — EXISTS (protocol already supports recovery)

`apps/web/src/features/chessboard/`:

- `BoardSyncMessage` union (`types/sync.ts:75`) already includes
  `REQUEST_SYNC` (ask for current state) and `FORCE_SYNC` (push authoritative
  state) alongside `MOVE/UNDO/REDO/RESET`, `UPDATE_PERMISSIONS`,
  `UPDATE_ANNOTATIONS`, `SET_CLOCK`, `SET_UI_STATE`, `REQUEST_CONTROL`.
- One sync engine (`LiveBoardSyncBridge` → `BoardSyncContext`, per
  CLAUDE.md §3.7) rather than one per component — the god-component/duplicate-
  engine bug class this replaced is already fixed (BACKLOG.md 2026-08-30).
- Coach-authoritative shared clock (`ClockState`/`lib/clock.ts`), per-student
  detach/resync (`isDetached`, `detachBoard`/`resyncBoard`), multi-student
  board control (`boardControlStudentIds`).
- `useBoardSync.ts` already reads `useConnectionState()` (`ConnectionState`
  from `livekit-client`).

**Open question for Phase 1 (verify, don't assume):** confirm whether
`REQUEST_SYNC` is actually *dispatched* automatically on a
`Reconnecting → Connected` transition, or only on demand (e.g. a manual
"resync" button). If it's not auto-triggered on reconnect, that's a small,
contained fix inside `useBoardSync.ts` / `LiveBoardSyncBridge.tsx` — not a new
protocol message.

### 2.7 Chat recovery — PARTIAL

`LiveChatMessage` (`schema.prisma:672`) persists every message server-side
with a `clientMessageId` for dedupe (added specifically because
senderName+text+timestamp dedupe dropped legitimately repeated short
messages — AUDIT M24, per the field's doc comment). `saveChatMessage`/
`getChatHistory` exist on `LiveClassService` and are wired to
`API_ROUTES.liveClass.chat`.

Gap: `ChatProvider.tsx` fetches history exactly once on mount (`useEffect` at
`:43`, confirmed no `ConnectionState`/reconnect dependency). If the LiveKit
data-channel message that would have delivered a chat message in real time is
missed during a `Reconnecting` window, nothing re-fetches history to catch up
— unlike the board's `REQUEST_SYNC` pattern. This is a frontend-only fix
(re-fetch `getChatHistory` on `Connected` after having been `Reconnecting`),
no schema/API change required since the persisted history already exists.

### 2.8 Duplicate-tab handling — PARTIAL

`joinedSession.ts`: `getTabClientId()` gives each browser tab a stable,
`sessionStorage`-scoped id, appended to the LiveKit participant identity as
`${userId}_${clientId}` (`live-class.service.ts:246`) specifically to stop two
tabs of the same user colliding on LiveKit identity and evicting each other
(AUDIT M23, per code comment). The board tab uses a literal `_board` suffix
that the webhook controller specifically strips/recognizes (`:219`).

This solves the **transport-layer** collision. It does **not** solve the
**product-layer** question the spec's "duplicate-tab handling" likely means:
nothing tells the user "you already have this class open in another tab," and
— more importantly for reliability — **attendance is keyed purely on
`userId`** (`ClassAttendance @@unique([classId, studentId])`), so two
simultaneous tabs from the same student produce interleaved
join/leave/reconnect webhook events onto the *same* attendance row. The
ghost-drop logic (§2.2) may misfire here: tab A's clean `LEAVE` while tab B is
still open would currently read as the student leaving, then tab B's next
heartbeat-less event would read as a "reconnect." This needs a dedicated test
in Phase 1 (`e2e/` or a `.spec.ts`) before assuming it's fine, not a rewrite.

### 2.9 Frontend session/connection state — NET-NEW (as a coordinating layer)

No `ClassroomSessionManager` or `ConnectionStateManager` exists. The relevant
pieces live independently in:

- `MeetingRoom.tsx` — `LiveKitRoom` `onConnected`/`onDisconnected`/`onError`,
  `ReconnectToaster` (surfaces LiveKit's own `Reconnecting`/
  `SignalReconnecting` as a toast), `ConnectionLost` fallback (full page
  reload to retry, relying on `joinedSession` sessionStorage to skip PreJoin).
- `useLiveClass.ts` — token fetch + silent-retry polling for "class not
  started yet"/"coach hasn't joined," independent of the LiveKit connection
  state.
- `useMeetingTimer.ts`, `MeetingStatus.tsx` — each independently call
  `useConnectionState()`.
- `useBoardSync.ts` — its own `useConnectionState()` read, gates board-mutating
  sends on `Connected`.
- `ChatProvider.tsx` — no connection-state awareness at all (§2.7).

Each of these works correctly in isolation (LiveKit's SDK handles the actual
reconnect transparently), but there is no single place that owns "what is
this participant's overall session/connection state right now," which is what
makes a server-side heartbeat, a UI grace-period countdown, or a
"reconnecting — do not mark absent" signal to `getLiveClassMonitoring`
impossible to implement cleanly today. This is the real net-new frontend
architecture piece.

---

## 3. State model (current vs. proposed)

### 3.1 Current (as-is, confirmed above)

```
CoachClass.status      : SCHEDULED | LIVE | COMPLETED | CANCELLED | (IN_PROGRESS, orphaned?)
LiveSession.status     : "SCHEDULED" | "WAITING" | "LIVE" | "ENDED" | "CANCELLED"  (untyped string)
ClassAttendance.status : PRESENT | LATE | PARTIAL | ABSENT           (post-hoc, set by finalize)
AttendanceLog.eventType: JOIN | LEAVE | DISCONNECT | RECONNECT       (DISCONNECT never written)
CoachAttendanceLog.eventType: free string, same 4 values + BOARD_JOIN | BOARD_LEAVE
```

### 3.2 Proposed additions (additive only — no renames of existing values)

```
LiveSessionStatus (new Prisma enum, replaces LiveSession.status's raw String,
                    same value set — SCHEDULED|WAITING|LIVE|ENDED|CANCELLED)

ParticipantPresence (new, per-participant *live* state — not persisted as an
                      enum column necessarily; see §4.1 for whether this lives
                      in a new lightweight table or is computed on read):
  ONLINE        — heartbeat within policy.heartbeatIntervalSeconds * 2
  RECONNECTING  — last heartbeat stale, still inside gracePeriodMinutes
  OFFLINE       — grace period elapsed, no LEAVE webhook confirmed yet
  LEFT          — LEAVE/DISCONNECT webhook confirmed, or grace period elapsed
                   and swept by the reconciliation job
```

`ParticipantPresence` is a *read-time* derived state (heartbeat timestamp +
existing log history + policy), not a replacement for `AttendanceEventType` —
the append-only log stays the source of truth for scoring; presence is what
`getLiveClassMonitoring` and the frontend care about in real time.

---

## 4. Net-new work (what Phase 1+ actually builds)

### 4.1 Heartbeat + server-side presence (backend, schema-touching)

- **New endpoint**: `POST /live-class/:id/heartbeat` — add to `API_ROUTES.liveClass`
  in `packages/types/src/api-endpoints.ts` first (per CLAUDE.md §3.1/§7 rule
  3), body `{ clientId }` (reuse the existing tab clientId, don't invent a new
  identity concept), auth via the existing token-string pattern (§3.2 of
  CLAUDE.md — no guards). Called every N seconds (policy-driven, default ~15s)
  by the frontend while `ConnectionState === Connected`.
- **Schema**: add `lastHeartbeatAt DateTime?` to `ClassAttendance` and
  `CoachAttendance` (additive, nullable, no migration risk to existing rows) —
  prefer this over a new `ParticipantSession` model unless Phase 1 discovers a
  concrete need for multi-tab-per-user heartbeat granularity (see §2.8 — worth
  resolving that question *before* deciding table shape, since if multi-tab
  attendance needs its own row per tab, the heartbeat probably belongs there
  too, and a new model becomes the right call instead of two nullable columns).
- **Wire up `recordDisconnectEvent`** (already implemented,
  `attendance.service.ts:186`, currently dead): a new low-frequency cron
  (e.g. `EVERY_30_SECONDS`, same advisory-lock pattern as `handleStaleClasses`
  to avoid double-firing across instances) scans for rows where
  `lastHeartbeatAt` is older than `policy.gracePeriodMinutes` (field already
  exists, currently unread outside scoring — see §2.3) and the last log is
  still an open `JOIN`/`RECONNECT`, and calls `recordDisconnectEvent`. This
  makes heartbeat the fallback when a LiveKit webhook is lost, not a
  replacement for the webhook path — webhooks stay primary and authoritative
  when they arrive.
- **Do not** touch `AttendancePolicy.reconnectTolerance` semantics without
  checking current readers first — grep showed it's read by scoring code;
  confirm exact usage in Phase 1 before repurposing it for grace-period math.

**Phase 1 status: DONE (2026-09-05).** Multi-tab question resolved by
inspecting `pg_indexes` on `live_sessions`/`coach_attendance_logs` on
`vps_dev`: neither table carries any existing per-tab structure, so there was
no signal pushing toward a new session-scoped model — went with the nullable
`lastHeartbeatAt` columns as the default said to prefer. `clientId` is
accepted by the endpoint and `AttendanceService.recordHeartbeat` but not
persisted per-tab: any of a student's open tabs pinging keeps the single
column fresh, which is the conservative choice for §2.8 (multiple tabs =
still present) until Phase 4's dedicated test either confirms that's correct
or finds a ghost-drop misfire. `reconnectTolerance` was left untouched —
repo-wide grep found it is stored and admin-editable
(`attendance-policy.dto.ts`, `AttendancePolicy` schema) but has **zero
readers anywhere in `apps/api` or `apps/web`**, so there was nothing to check
compatibility against. That's a separate, pre-existing gap (a policy field
that does nothing), not something this phase needed to fix.

### 4.2 `getLiveClassMonitoring` staleness (backend, additive)

Extend the response (already typed in `@nexa-chess/types`, update there first)
with `presence: ParticipantPresence` and `lastHeartbeatAt` per student, derived
from the new heartbeat column instead of purely `lastLog.eventType`. No new
endpoint — same route, richer payload. Existing `LiveClassMonitor` UI degrades
gracefully during rollout since it currently only reads `isOnline`.

### 4.3 Frontend `ConnectionStateManager` + `ClassroomSessionManager`

- `ConnectionStateManager` (new, `features/live-class/`): wraps
  `useConnectionState()` + a heartbeat interval + last-heartbeat-ack, exposes
  one `presenceState` used by `MeetingStatus`, the board bridge (trigger
  `REQUEST_SYNC` on `Reconnecting → Connected`, once §2.6's open question is
  resolved), and `ChatProvider` (re-fetch `getChatHistory` on the same
  transition — closes §2.7's gap with no backend change).
- `ClassroomSessionManager` (new, thin, sits above it): owns tab identity
  (`getTabClientId`, already exists — relocate, don't rewrite),
  `joinedSession` flag (already exists — relocate), and surfaces a
  duplicate-tab warning (new: `BroadcastChannel` or `storage` event listening
  for another tab claiming the same `roomId`, product-layer only — the
  LiveKit-identity collision is already handled at transport layer, §2.8).
- This is a consolidation of five existing call sites, not a rewrite of
  LiveKit connection handling — `LiveKitRoom`'s own reconnect logic in
  `MeetingRoom.tsx` stays as-is.

### 4.4 Shared event-type enum (backend, low-risk cleanup)

Extend `AttendanceEventType` with `BOARD_JOIN`/`BOARD_LEAVE` and migrate
`CoachAttendanceLog.eventType` from free `String` to the enum (values already
match). Bundle into the same migration as the `LiveSessionStatus` enum
cleanup (§3.1) since both are additive, non-breaking, single-migration
changes — don't ship four separate migrations for four small enum fixes.

### 4.5 Admin cross-class reliability view (backend + frontend, genuinely new)

New endpoint, e.g. `GET /attendance/admin/live-reliability` (add to
`API_ROUTES.attendance`), admin-only, surfacing: all currently-`LIVE`
sessions with any participant in `RECONNECTING`/`OFFLINE` presence, and (once
4.1 lands) heartbeat-gap counts — a genuinely new query, not a repurposing of
`getLiveClassMonitoring` (which stays per-class). Frontend: a new admin page/
section, not a component that already exists to extend.

---

## 5. Explicitly out of scope for this initiative

- Rewriting the webhook idempotency, ghost-drop, or finalize logic — all
  correct and tested (`attendance-calculations.spec.ts`,
  `live-class-authorization.spec.ts`, `live-class-recording.spec.ts`,
  `attendance-authorization.spec.ts`, `attendance-student-stats.spec.ts`).
- Replacing `LiveKitRoom`'s own reconnect handling in `MeetingRoom.tsx` — it
  already does the right thing (transparent reconnect, toast, exhausted-retry
  fallback).
- A new board-sync protocol — `REQUEST_SYNC`/`FORCE_SYNC` already cover state
  recovery; only the auto-trigger-on-reconnect wiring (if missing) is in
  scope.
- Waiting room / lobby (tracked separately in BACKLOG.md "Feature gaps").

---

## 6. Phased implementation plan

| Phase | Work | Depends on |
|---|---|---|
| **1. Schema + heartbeat backbone — DONE (2026-09-05)** | `LiveSessionStatus` enum, `AttendanceEventType` +BOARD_*, `CoachAttendanceLog.eventType` migration, `lastHeartbeatAt` column(s) or new session-scoped model (decide after resolving §2.8's multi-tab question), `POST /live-class/:id/heartbeat`, wire `recordDisconnectEvent` via new grace-period cron. Check row counts for `ClassStatus.IN_PROGRESS` in `vps_dev` before deciding whether to drop it (query-only — do not run destructive schema/data changes as part of this check). | This doc |
| **2. `getLiveClassMonitoring` presence** | Derive `presence`/`lastHeartbeatAt` in the response; update `LiveClassMonitor` UI to show `RECONNECTING` distinctly from `OFFLINE`. | Phase 1 |
| **3. Frontend `ConnectionStateManager`/`ClassroomSessionManager`** | Consolidate `joinedSession.ts`, `getTabClientId`, `useConnectionState` call sites; wire heartbeat ping; trigger board `REQUEST_SYNC` and chat re-fetch on reconnect; duplicate-tab product-layer warning. | Phase 1 (needs the heartbeat endpoint) |
| **4. Multi-tab attendance correctness** | Dedicated test (unit or `e2e/`) for two simultaneous tabs of one student; fix ghost-drop misfire if confirmed (§2.8). | Can start in parallel with Phase 1 |
| **5. Admin cross-class reliability view** | New endpoint + admin page per §4.5. | Phase 2 |
| **6. Coach-hour reconciliation audit** | Compare heartbeat-backstopped totals against pre-heartbeat historical data on a sample of classes to confirm Phase 1 didn't change existing numbers unexpectedly; add reliability metrics (webhook-loss rate, heartbeat-fallback trigger rate) to the admin dashboard. | Phases 1–5 |

Each phase should update this doc's status table (§2) and `docs/BACKLOG.md` in
the same change, per CLAUDE.md §3.0/§6.

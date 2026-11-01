# Class scheduling, timing, batch type & demo classes

> Moved out of [CLAUDE.md](../CLAUDE.md) on 2026-10-17 to keep that file
> under the context limit; the text is unchanged. `§` numbers refer to
> CLAUDE.md, which keeps a short summary under the same number.

## Coach classes are academy-scheduled (from §3.7)

- **Coach classes are academy-scheduled**: a coach cannot create, reschedule or re-batch a class (admin scheduling / `batch-schedule` generate them). `PATCH` `coach.updateClass` accepts only title/topic/description/objectives/homework/notes, before or after the class (not once cancelled) — `ClassNotesDialog`. A coach who needs an extra class or a new time **asks** (`apps/api/src/class-request/`, `features/class-requests/`, routes `API_ROUTES.classRequests.*`, admin page `/admin/class-requests`): a `ClassChangeRequest` (`EXTRA_CLASS` / `RESCHEDULE`, `PENDING` → `APPROVED` / `REJECTED` / `WITHDRAWN`). Approval runs in one transaction — a status-filtered `updateMany` claims the request (double-approve ⇒ 409), the coach's schedule is re-checked with `assertNoSchedulingConflict`, then the class is created (and `CLASS_SCHEDULED` dispatched) or moved if still `SCHEDULED`. A partial unique index (hand-written migration) allows one pending reschedule per class. Not soft-deletable. A second partial unique index allows one pending EXTRA_CLASS per coach, batch and start time.
- **Cancelling a class** (V10, [PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md](PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md)): `resolveCancellationPath` (`@nexa-chess/types` `class-cancellation.ts`) is the one rule — more than 24 h before the start the coach cancels directly (`PATCH coach.cancelClass`, status-filtered); within 24 h it is a `CLASS_CANCEL` admin request (expires at the start); after the start (not held or running) a `CLASS_CANCEL_EXCEPTIONAL` request (always urgent; a running class must be ended before approval). The web's `useCoachClassCancel` picks the control from the same function. Admin scheduling cancels are unchanged.

## 3.6j1 Class timing rules (start window, upcoming / past, not held)

`@nexa-chess/types` `class-availability.ts` is the one place that decides where
a class sits in time — use it, don't re-derive from `status`:
`resolveClassDisplayStatus` (adds `NOT_HELD` = SCHEDULED whose `endsAt` passed;
the stored status is never rewritten), `isUpcomingClass` / `isPastClass`
(cancelled is never upcoming, and past only once its date arrives),
`getClassStartAvailability` (start allowed from `CLASS_EARLY_START_MINUTES`
before `startsAt` until `endsAt` — `LiveClassService.startClass` enforces it,
since ending a class is what marks it COMPLETED) and `canJoinClass` (LIVE /
IN_PROGRESS only). Web: `ClassStatusBadge` takes `endsAt` to show "Not held";
calendars use `CLASS_STATUS_DOT` + `ClassStatusLegend`. `/classes/:id` renders
`StudentClassDetailsClient` (`GET /student/classes/:id`) for students and
`StaffClassDetailsClient` for coach/admin. Batch dates bound their sessions —
`common/batch-dates.ts` (schedules, regeneration, class requests, and
narrowing a batch's dates cancels the future SCHEDULED sessions outside them).

## 3.6j2 Batch type & dashboard upcoming classes

`BatchType` (`GROUP` / `INDIVIDUAL` / `BUDDY`, `@nexa-chess/types`
`batch-type.ts`) resolves in three layers via `resolveBatchType`: roster size
(1 → Individual, 2 → Buddy, else Group) → `Batch.batchType` (admin, BatchForm
"Batch Type") → `CoachClass.batchType` (one class only, coach). Both columns are
nullable; null inherits. The coach sets/clears a class's override through the
existing `PATCH coach.updateClass` (`batchType: null` clears) — it never writes
the batch or sibling classes.

- **Coach `/coach`**: "Latest Upcoming Classes" (`features/coach/components/upcoming/`)
  = `GET coach.upcomingClasses?limit=3` (same not-over/`SCHEDULED|LIVE` rule as the
  schedule page; `CoachClass` now carries `students`, `level`, `batchType*`). Inline
  topic + class-type edits go through `useUpdateUpcomingClass` (immediate + Undo).
  `StartClassButton` reuses `useStartLiveClass` + redirect, with a confirm when
  starting more than 15 min early.
- **Student `/student`**: `nextClasses` on the dashboard payload (next three not
  over, a live one included). `upcomingClasses` is unchanged — `/student/live-classes`
  still reads it. Join is enabled only while the class is `LIVE`/`IN_PROGRESS`.

## 3.6k Demo classes (guest access, invites, static schedules)

`apps/api/src/demo-class/` (`DemoInviteService`, `DemoScheduleService`) +
`AdminService` demo methods + `LiveClassDemoService.getDemoInfo`/`joinDemoClass`;
web `features/admin/components/DemoClass*` + `demo-classes/*`, public page
`app/demo/[classId]`; routes `API_ROUTES.admin.demoClass*` / `.demoSchedule*`,
`API_ROUTES.liveClass.demoInfo` / `.demoJoin`. Super-admin only (admin side).

- **A guest is a `DemoClassRegistration`, not a user.** One row per
  `(classId, contactMethod, contactValue)`; `contactValue` is the normalized
  phone (`WhatsAppService.normalizeRecipient`, so `98765…` and `+91 98765…`
  match) or lowercased email. **Any existing row admits its contact in every
  access mode** — an invite, a lead booking, or an earlier self-registration.
- **Access mode** (`CoachClass.demoAccessMode`): `PUBLIC` / `PASSCODE`
  (`demoPasscode`, stored readable so the admin can share it; compared
  case-insensitively in constant time) / `INVITE_ONLY`. The mode only gates a
  *new* registration. An uninvited guest of an `INVITE_ONLY` class is **never
  turned away**: their row is `approval: PENDING` and appears in the room's
  existing waiting-room list as `studentId: "guest:<registrationId>"`, so the
  coach admits/denies with the same People-panel UI (`resolveWaitingRoomEntry`
  branches on the prefix). `POST .../demo/:id/join` is throttled to 20/min.
- **Personal invite links**: every admin-added guest (lead or new invitee) gets
  a unique `inviteToken`; `/demo/<classId>?invite=<token>` admits them with no
  typing. The phone/email is the fallback. Invitations go out by email /
  WhatsApp free text (best effort — outside the 24h window WhatsApp won't
  deliver; an approved template is the fix).
- **A guest in the room has no session** — only the LiveKit token the join
  mints, plus a `guestToken` (`live-class/demo-guest-token.ts`: a 6h JWT of
  `type: "demo_guest"` naming the registration + class, so `authenticateUser`
  never takes it as an access token). The web keeps it in `LiveRoomProvider`
  (`features/live-class/providers/LiveRoomContext.tsx`) and sends it as
  `DEMO_GUEST_TOKEN_HEADER` to the one route a guest may call,
  `GET /live-class/:id/puzzle/guest` (`LiveClassAccessService.resolveDemoGuest`:
  token for this class, registration not DENIED, LIVE demo). It returns the
  active puzzle **with its solution**: a guest can't own a `PuzzleAttempt`, so
  it practises client-side like the coach's preview — unscored, never on a
  leaderboard. Everything else in the room is user-only: in-room components
  take the class id from `useMemberClassId()`, which is `""` for a guest, so
  their queries stay off instead of answering 401s. **In-room code must never
  read `useParams().roomId`** — the guest room is `/demo/[classId]`, where it is
  undefined (that was why a shared puzzle never reached a guest).
- **`DemoInviteService` is the only way to add a guest** — both the demo-class
  "Invite guests" panel and the leads CRM's "assign demo class" go through
  `bookLead` / `addInvitees`, so lead status/timeline stay consistent. A lead
  who actually joins is moved to `DEMO_ATTENDED` (`markLeadAttended`).
- **Static demo schedules** (`DemoSchedule`, admin → Demo Classes →
  Schedules): weekly slots + one permanent `/demo/<slug>` link that resolves to
  the LIVE occurrence, else the next one. Occurrences are ordinary demo
  `CoachClass` rows with `demoScheduleId`, generated `DEMO_SCHEDULE_HORIZON_DAYS`
  ahead on save and by an hourly cron (job lock `demo-schedule.top-up`), idempotent on
  unique `(demoScheduleId, startsAt)`. A slot that clashes with the coach's
  other classes is skipped, not double-booked. An edit/pause deletes only
  **unbooked** future occurrences and re-generates; booked ones are kept. A
  cancelled occurrence keeps its row, so it is not re-created. Rescheduling an
  occurrence by hand detaches it from the schedule.
- None of these models are soft-deletable or Trash-registered.

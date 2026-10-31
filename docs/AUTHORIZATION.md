# Authorization — permission matrix and audit (2026-10-16)

How access is decided, who may do what, and what the 2026-10-16 audit found and
fixed. The mechanism itself (no guards, token-string auth, `authenticateUser`)
is in CLAUDE.md §3.2; this file is the policy.

## Ground rules

- **One academy, platform-wide admins.** The schema has no academy/tenant id:
  `ADMIN` and `SUPER_ADMIN` see every batch, class and student. Scope below that
  comes from relationships — `BatchCoach`, `BatchStudent`, `CoachClass.coachId`,
  `LiveSession.coachId`, ownership columns (`createdById`, `userId`, `ownerId`).
- **Plan before role, platform staff apart.** Before a handler runs, the
  global `FeatureGateGuard` refuses (402) a route whose SaaS-plan feature the
  academy lacks, or any change while the subscription is read-only/locked
  (docs/SAAS_PLANS.md). It narrows, never grants: the role checks below still
  run. `/platform/*` (plans, the academy's subscription) needs a
  `platform_staff` row; no tenant role, `SUPER_ADMIN` included, reaches it.
- **The API is the boundary.** Every route authenticates through
  `authenticateUser` (identity + `ACTIVE` + a live session, see below) and then
  checks the resource. The web's `routeAccess.ts` / `middleware.ts` and hidden
  buttons are routing and usability only.
- **Ids from the client are claims.** A body/URL id is loaded and checked
  against the caller (`getXVisibilityWhere`, `resolveClassManager`,
  `resolveParticipant`, `assertOwnerOrAdmin`, `canManage`…); role and ownership
  are never read from the request.
- **404 vs 403.** Row-level misses on owned data are usually 404 ("not found"),
  wrong-role refusals 403. Either is acceptable to the cross-user suite.
- **Real-time.** LiveKit grants are minted only by the API (`getToken`,
  `generateSpectatorToken`, the recorder's egress token) from the resolved class
  settings. Students hold `canPublishData`, so *every* data packet a client
  receives is untrusted unless its envelope proves otherwise: API-injected
  topics have no sender, and receivers drop a packet that has one.

## Sessions and revocation

| Event | Effect |
|---|---|
| Logout | Refresh family revoked **and** every access token of that session refused at once (`authenticateUser` checks `auth_sessions.revokedAt` for the token's `sessionId`). |
| Password reset (self) / refresh-token reuse | Same: family revoked, access tokens die immediately. |
| Admin sets a new password or a non-ACTIVE status | All of that user's sessions revoked (`UserService.update`). |
| Account archived / deleted | Next request is a 401 (`status !== ACTIVE`). |
| Role changed | Takes effect on the next request — the role is read from the DB, never the token. |
| Kicked from a live class | `getToken` refuses a new LiveKit token; a reconnect with an older token is removed by the `participant_joined` webhook (`LiveClassModerationService.enforceRemovalOnJoin`). |
| Removed from a batch | Loses API access to the batch's classes/chat at once. An already-issued LiveKit token still connects until it expires, at most 10 minutes (`LIVEKIT_TOKEN_TTL`). |

## Permission matrix

R = read, C = create, U = update, D = delete, P = publish/share/launch.
"own batch" = a batch the coach is a `BatchCoach` of; "enrolled" = a live
`BatchStudent` row. Admin = `ADMIN` or `SUPER_ADMIN` unless stated.

| Resource | Student | Coach | Admin | Notes |
|---|---|---|---|---|
| Own profile, avatar | R U | R U | R U | Avatar delete: own profile upload only, and only if no other account uses that URL. |
| Other users | — | R (students of own batches; any active student via pull-roster search) | R C U D (ADMIN can't touch ADMIN/SUPER_ADMIN; only SUPER_ADMIN creates or promotes admins; nobody changes their own role; last SUPER_ADMIN can't be deleted) | |
| Batches | R (enrolled) | R (own batch) | R C U D | |
| Classes (`CoachClass`) | R (enrolled batch) | R, U notes/topic (own class), cancel own | R C U D | Coach scheduling changes go through `ClassChangeRequest` (admin approves). |
| Live class: join / token | enrolled, or pulled, or admitted from waiting room; not if removed | own class | any (visible), or hidden spectator seat | Demo guests via `DemoClassRegistration`. |
| Live class: demo guest puzzle (`GET /live-class/:id/puzzle/guest`) | — (users use `GET …/puzzle`) | — | — | Demo guests only, by the `guestToken` from their join (header `x-nexa-demo-guest`): this class, registration not DENIED, class a LIVE demo. Returns the solution — a guest practises unscored. |
| Live class: settings, moderation, kick, pull, waiting room, screen-share approval, end | — (may request screen share / admission) | own class | any class | `resolveClassManager`. |
| Live class: **recording** start/stop | — | own class | any class | Fixed 2026-10-16 (was any coach). |
| Recording: view / stream / download | enrolled batch | own class | any | Stream token is signed per viewer + class and re-checked. |
| Shared board state | R (participant) | R U (own class, LIVE) | R U | Peer moves: coach always; student only with a per-colour grant and a legal move (`senderMayMutateBoard`), enforced by every receiver incl. the recorder and spectator. |
| In-class chat | R C (own class; DM coach only) | R C (own class) | R C | `privateChatRecipientAllowed`. |
| Live puzzles, simul, matches, move polls, Puzzle Storm, tools, chapters, activity queue | play/answer in own class; never read others' attempts or unrevealed results | P U D in own class | any class | Activity queue + chapters are coach-only reads too (a saved line can hold an answer). |
| Puzzle library | R published GLOBAL + PRIVATE of their own coaches (via assignment / class / course only) | R GLOBAL + own PRIVATE; C U D own PRIVATE | R C U D all | Solutions only to staff/coach and to students after finishing. |
| Puzzle topics / folders | — | R | C U D (homework approval SUPER_ADMIN) | |
| Assignments (library) | — | R GLOBAL library + own; C U D own | all | |
| Assignment deployments | R own `StudentAssignment`; attempt own | P to own batches; R results of own deployments | all | |
| Puzzle attempts | own only | of students in own batches (via results/history) | all | Server-scored. |
| Progress, activity history, attendance | own | students of own batches | all | Lists/filters apply the same scope. |
| Smart Revision | own queue, session, ratings and report | read + recommend for students of own batches; remove only their own recommendations | all students; remove any recommendation | Grades capped by the server-graded attempt; a recommended puzzle must be openable by the student and visible to the coach. |
| Feedback | submit/skip own pending only | R responses of `showToCoach` forms, student stripped | all forms + responses | |
| Game Library | own games + LIVE_BOARD games of attended classes | own / own class / own batch / played | all | Only IMPORT games deletable (importer or admin). |
| Persistent chat | own threads; DM staff or a coach sharing a batch | own threads; groups of own students | all | `directChatAllowed`. |
| Invoices, payments, subscriptions | own | own manual-payment records for own batches (PENDING until approved) | all | Never refundable via MANUAL. |
| Payroll, payslips | — | own | all | |
| Class change requests | — | C own; R own | approve/reject | |
| Messaging rules, analytics, leads, demo classes, backups, trash, data retention | — | — | admin (trash, demo classes, backups, data retention: SUPER_ADMIN) | A retention window deletes for good, so only a super admin sets one. |
| Presets (live class) | — | PERSONAL own; use ORG/system | ORG + any | |

## Audit 2026-10-16

### Method

1. Read every service's auth head; flagged methods with no ownership/visibility
   check (heuristic scan, then by hand).
2. **Route sweep**: booted the real app on the integration DB with the
   cross-user world (`world.ts`), enumerated every mounted route (496) and
   called each as side A's student and coach with every one of side B's ids,
   recording any 2xx/5xx. Also called every route anonymously. (One-off; the
   anonymous half is now the permanent `auth-boundary.int-spec.ts`.)
3. Reviewed every data-channel receiver for sender checks.

Limits: write routes whose body validation runs before the handler return 400
to an empty body, so the sweep cannot see past them; those were reviewed by
reading the services, not exhaustively by request. Unit and integration tests
exercise the API in-process; LiveKit itself was not running.

### Confirmed and fixed

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | High | `POST /live-class/:id/recording/start` and `/stop` checked only the role: **any coach could record (or stop recording) another coach's live class** of minors. Found by the sweep (coach A's call reached LiveKit). | Both use `LiveClassAccessService.resolveClassManager`. Unit + cross-user rows. |
| 2 | Medium | Access tokens outlived logout, password reset and refresh-reuse revocation for up to 15 min; `/auth/me` and profile update hand-rolled their own user load. | `authenticateUser` rejects a token whose `sessionId` row is missing, revoked or another user's; `AuthService.me`/`updateProfile` use it. |
| 3 | Medium | Admin resetting a user's password (or deactivating them) left their refresh tokens valid (7 days). | `UserService.update` revokes all sessions on a new password or non-ACTIVE status. |
| 4 | Medium | `DELETE /upload/image` trusted "the URL equals my `avatarUrl`", but `avatarUrl` is a free-form profile field: copy someone's avatar URL into your profile, then delete their image. | Non-admins may delete only a `nexa_chess/profiles/` upload that no other account (incl. deleted) uses. |
| 5 | Medium | Receivers of API-only topics (`live_class_settings`, `live_class_puzzle` assign/update/end, `live_class_simul`, `live_class_match`, `recording`, `waiting_room`, `screen_share_request`, `classroom_tools`, `move_poll`) accepted packets from any participant: a student could push fake settings (client-side mic/camera locks) to classmates, pop a fake puzzle, fake simul/match boards, or flip the recording indicator. | Each drops a packet with a sender (`if (msg.from) return`), as moderation / Puzzle Storm / activity queue already did. `LEADERBOARD_DIRTY` stays peer-sendable. |
| 6 | Medium | The recording template and the admin spectator seat applied every `board_sync` packet from anyone: a student could rewrite the board the recording (and an admin) sees. | `reduceReadOnlyBoard` applies `senderMayMutateBoard` + the one-legal-move check, tracking `UPDATE_PERMISSIONS`; the coach restates grants after answering `REQUEST_SYNC` so a viewer joining mid-grant still accepts the controller's moves. |
| 7 | Medium | A kicked student holding a pre-kick LiveKit token could reconnect straight to the SFU. | `participant_joined` webhook removes a student whose waiting-room row is `DENIED`, and records no attendance for it. |
| 8 | Low | TanStack Query cache (60s `staleTime`, keys not user-scoped) survived logout / a different account signing in on the same tab, so the previous user's data could render. | `SessionBootstrap` removes all queries when the signed-in user id changes away from someone. |
| 9 | Low | 500s before/instead of authorization: `PUT/POST /messaging/rules/:event` (`zod.parse` on the param, even unauthenticated), `GET /payroll/payslips/:id/pdf` (`findUniqueOrThrow`), raw `.parse` on payments/invoices admin queries. | `parseOrBadRequest` (common/zod-body.pipe.ts) in all nine controller call sites; payslip 404. |

### Verified correct (no change)

Batch/class/student visibility helpers; class notes/cancel; attendance reports
(coach scoped to own classes, admin dashboards admin-only); progress and
activity history (own / own-batch / admin); assignments, deployments, puzzle-set
results and leaderboards; puzzle visibility and solution reveal; puzzle attempt
reads/writes (own only); chat (`directChatAllowed`, BATCH roster, DM membership);
Game Library visibility and edit rules; live-class lifecycle, moderation, kick,
pull, waiting room, screen share, board state, chat, chapters, activity queue,
move poll, simul, matches, Puzzle Storm, tools; presets (PERSONAL owner / ORG
admin); class-change requests; payments (owner-or-admin on every payment id),
invoices, payslips, manual payments (coach scoped to own batches); user
management role escalation guards; every admin-only controller refused student
and coach on every route in the sweep; every route refuses an anonymous caller
except `/health`, `/health/ready` and `/auth/logout` (webhooks reject an
unsigned call; demo routes are guest-facing by design).

### Open / theoretical (not changed)

- **LiveKit token lifetime** is 10 minutes since 2026-10-17
  (`LIVEKIT_TOKEN_TTL`, `livekit.service.ts`); LiveKit refreshes tokens for
  connected clients. The pre-join card never holds a token (`useLiveClass`
  fetches one only after Join). Still to do: a staging run of a class longer
  than the TTL (tracked in BACKLOG.md "Open items").
- The removal-on-join enforcement depends on LiveKit webhooks reaching the API
  (they do in production; never on localhost).
- `liveClass.puzzleClassLeaderboardAdjust` accepts any student id for the
  coach's own class; the name then shows on that class's board. A coach can
  already look up any student via the pull roster, so this exposes nothing new.
- Peer topics (`board_sync`, chat, reactions, hand raise) are enforced by each
  receiver. A modified client can ignore rules *on its own screen*; it cannot
  change anyone else's.
- Per-browser `localStorage` conveniences (puzzle cursor, last-used class
  settings, checkout key) are not cleared on logout; none hold another user's
  private data.

## Tests that hold this

- `test/integration/access/cross-user-access.int-spec.ts` — A-vs-B denial rows
  with positive controls, list leakage, wrong-role 403s (now incl. recording).
- `test/integration/access/auth-boundary.int-spec.ts` — every mounted route
  refuses an anonymous caller; logout / revoked session / deactivated account
  end a still-unexpired access cookie.
- `common/security/route-auth.spec.ts` — every handler reads its request.
- Unit: `auth/authenticate.spec.ts` (session binding),
  `live-class/live-class-recording.spec.ts`, `live-class-authorization.spec.ts`
  (`enforceRemovalOnJoin`), `attendance/attendance-multi-tab.spec.ts` (webhook
  hand-off), `upload/upload.controller.spec.ts`, `user/user.service.spec.ts`.

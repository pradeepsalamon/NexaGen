# Authorization — permission matrix and audit (2026-10-16)

How access is decided, who may do what, and what the 2026-10-16 audit found and
fixed. The controller/service pattern (no guards, token-string auth) is
CLAUDE.md §3.2; the authentication mechanics are under
[Authentication mechanics](#authentication-mechanics) below; the rest of this
file is the policy.

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

## Authentication mechanics

Moved out of CLAUDE.md §3.2 on 2026-10-31; the text is unchanged in substance.

- **`authenticateUser(this.jwtService, this.prisma, accessToken)`**
  (`auth/authenticate.ts`) is the single implementation: missing token / bad or
  expired signature / non-`access` type / user not `ACTIVE` / the token's
  `sessionId` missing or revoked in `auth_sessions` all become a 401 (never the
  500 a raw `TokenExpiredError` turns into) — so logout, a password reset or
  refresh-token reuse ends the access token at once, not 15 minutes later. Pass
  `{ include: { … } }` as a 4th argument to load relations; `verifyAccessToken`
  is the no-DB variant. **Never hand-roll `jwtService.verifyAsync` for an access
  token** — the 25 copies this replaced had drifted (admin/backup skipped the
  ACTIVE check, Stockfish trusted the token's role). The module
  `*-auth.helper.ts` files re-export it.
- **Params and queries.** Parse a param/query inside a handler with
  `parseOrBadRequest` (`common/zod-body.pipe.ts`), never a bare `schema.parse` —
  a ZodError is a 500, thrown before the handler has even authenticated anyone.
  A single query value headed for a Prisma `where` goes through `queryEnum` /
  `queryString` (`common/query-params.ts`): a repeated key arrives as an array
  and an unknown enum value only fails inside Prisma, both 500s until checked
  (`test/integration/access/query-validation.int-spec.ts`).
- **File uploads.** multer buffers the whole body in memory *before* the
  handler's auth runs, so every multipart route is
  `@UseInterceptors(RequireAccessTokenInterceptor, FileInterceptor("file", { limits: { fileSize, files: 1, fields } }))`
  — the interceptor (`common/security/`) rejects a missing/forged access token
  before any bytes are read, and `limits` makes an oversize file a 413 instead
  of an unbounded buffer. The handler still calls `authenticateUser`.
- **Route coverage.** `common/security/route-auth.spec.ts` fails any route
  handler that never passes its `request` to something (i.e. can't be reading
  the cookie); a deliberately public route goes on its `PUBLIC_ROUTES` list.

### Two-factor (TOTP)

`auth/mfa/` (`MfaService`, `MfaController`, routes `API_ROUTES.auth.mfa*`,
table `user_mfa`). Production refuses to boot without `MFA_ENCRYPTION_KEY`
while `MFA_REQUIRED_ROLES` names a role (`NONE` opts out; an empty value falls
back to the compose default) (`packages/config/src/api.ts`), so required MFA
can't silently switch off.

- With `MFA_ENCRYPTION_KEY` set, a correct password for an MFA-enabled account
  — or any account whose role is in `MFA_REQUIRED_ROLES` (default
  `SUPER_ADMIN,ADMIN`) — returns `{ mfaRequired: "VERIFY" | "SETUP", challengeToken }`
  instead of cookies; `/auth/mfa/verify` (code or single-use recovery code) or
  `/auth/mfa/enable` (first enrollment) then finishes the login via
  `AuthService.completeLogin`.
- The challenge is a 10-minute JWT of `type: "mfa_challenge"`, so it can never
  pass as an access token. Secrets are AES-256-GCM encrypted; `lastUsedStep`
  blocks code replay.
- Wrong codes are 400 (not 401) so the web client's refresh-and-retry doesn't
  fire. They are also counted **per account** (`user_mfa.failedAttempts`): the
  5th (`MFA_MAX_FAILED_ATTEMPTS`) sets `lockedUntil` 15 minutes ahead, during
  which every code — even a correct one — is a 429. The route's IP throttle
  alone let guesses spread across many IPs. Clear a lock with
  `UPDATE user_mfa SET "lockedUntil" = NULL WHERE "userId" = '…'`.
- Students can't enroll. Lost device + no recovery codes:
  `DELETE FROM user_mfa WHERE "userId" = '…'`, and the next login forces setup
  again. Changing `MFA_ENCRYPTION_KEY` invalidates every enrolled authenticator.

### Login lockout and email change

- Wrong passwords are counted per account (`users.failedLoginAttempts`); the
  10th (`LOGIN_MAX_FAILED_ATTEMPTS`) sets `loginLockedUntil` 15 minutes ahead,
  during which login is a 429 even with the right password. A correct password
  or a completed password reset clears it; by hand:
  `UPDATE users SET "loginLockedUntil" = NULL, "failedLoginAttempts" = 0 WHERE email = '…'`.
  The IP throttle (5/min) alone missed guessing spread across many IPs.
- Changing the account email (`PATCH /auth/profile`) requires `currentPassword`
  (400 if missing or wrong; the route is throttled 10/min), revokes every other
  session family, and mails a notice to the old address — the email is what
  password reset trusts, so a stolen session alone must not move it.
- Email verification is an academy setting, off by default. When `REQUIRED`,
  password sign-in refuses unverified students and coaches with a 401; admins are
  exempt. [EMAIL_ADMIN](EMAIL_ADMIN.md)

### Cookies, refresh tokens, CSRF and headers

- `AUTH_COOKIE_NAMES` = `nexa_access_token` / `nexa_refresh_token`
  (`apps/api/src/auth/types/`). Access TTL 15m, refresh 1d (no "remember me")
  or 7d (remember me).
- Refresh tokens rotate on every use and are sha256-hashed in `auth_sessions`
  (bcrypt would only read the JWT's first 72 bytes; old bcrypt rows still
  verify). A rotation sets `rotatedAt` (claimed atomically); `revokedAt` means
  logout / password reset / reuse and is **never** revived. Within 30s of a
  rotation the old token may mint a sibling in the same `familyId` (concurrent
  tabs); after that a replay revokes the whole family. Logout revokes the
  family.
- `getCookieBaseOptions` (`@nexa-chess/config/api`) sets every cookie: `secure`
  when `FRONTEND_URL` is https, `sameSite` from `COOKIE_SAME_SITE` (default
  `lax` — web and API are same-site subdomains).
- **CSRF**: `app.setup.ts` `configureApp` (shared by `main.ts` and the
  integration test app) registers only the JSON body parser (no urlencoded),
  then defaults a missing body to `{}` (body-parser 2 leaves it undefined;
  Express 4 didn't), and `common/security/origin-check.ts` rejects a
  POST/PUT/PATCH/DELETE whose `Origin` (or `Referer`) is not in `CORS_ORIGIN`
  with 403; webhook paths are exempt. **A new webhook route must be added to
  that exempt list.**
- **Security headers**: the API sends `nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer` and (over https) HSTS on every response
  (`common/security/security-headers.ts`); the invoice HTML routes add
  `INVOICE_HTML_CSP`. The web's headers live in `next.config.mjs`
  `securityHeaders()`: an enforced CSP of `frame-ancestors`/`object-src`/`base-uri`
  only, plus a **report-only** full CSP whose console violations are how to
  find origins before enforcing it — a new third-party script, iframe or fetch
  host needs adding there.

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

The target model (direct / approval / admin-only / consent-controlled actions
for every module), the roadmap and the progress log are in
[PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md](PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md).
This table is the policy as built.

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
| Live class: settings, moderation, kick, pull, waiting room, screen-share approval, end | — (may request screen share / admission) | own class (settings: unlocked fields only) | any class | `resolveClassManager`. A field an admin locked at the academy or batch layer can't be changed by any class override (2026-11-01, PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md). |
| Live class settings locks | — | — | academy + batch locks | Admin-only; audited as `LIVE_SETTINGS_CHANGE` with `locksBefore/After`. |
| Live class: **recording** start/stop | — | own class | any class | Fixed 2026-10-16 (was any coach). |
| Recording: view / stream / download | enrolled batch | own class | any | Stream token is signed per viewer + class and re-checked. |
| Shared board state (recorder) | — | — | — | `GET /live-class/:id/recorder/board-state`: no session, no role. The egress template's LiveKit token is the credential (signed with our LiveKit secret, this class's room, hidden seat). Read-only. The one route authenticated by something other than the access cookie besides webhooks. |
| Shared board state | R (participant) | R U (own class, LIVE) | R U | Peer moves: coach always; student only with a per-colour grant and a legal move (`senderMayMutateBoard`), enforced by every receiver incl. the recorder and spectator. |
| In-class chat | R C (own class; DM coach only) | R C (own class) | R C | `privateChatRecipientAllowed`. |
| Live puzzles, simul, matches, move polls, Puzzle Storm, tools, chapters, activity queue, MCQ and Playout runs | play/answer in own class; never read others' attempts or unrevealed results | P U D in own class | any class | Activity queue + chapters are coach-only reads too (a saved line can hold an answer). |
| Puzzle library | R published GLOBAL + PRIVATE of their own coaches (via assignment / class / course only) | R GLOBAL + own PRIVATE; C U D own PRIVATE | R C U D all | Solutions only to staff/coach and to students after finishing. |
| Puzzle topics / folders | — | R | C U D (homework approval SUPER_ADMIN) | |
| Assignments (library) | — | R GLOBAL library + own; C U D own | all | |
| Assignment deployments | R own `StudentAssignment`; attempt own | P to own batches; R results of own deployments | all | |
| Puzzle attempts | own only | of students in own batches (via results/history) | all | Server-scored. |
| Progress, activity history, attendance | own | students of own batches | all | Lists/filters apply the same scope. |
| Smart Revision | own queue, session, ratings and report | read + recommend for students of own batches; remove only their own recommendations | all students; remove any recommendation | Grades capped by the server-graded attempt; a recommended puzzle must be openable by the student and visible to the coach. |
| Feedback | submit/skip own pending only | R responses of `showToCoach` forms, student stripped | all forms + responses | |
| Game sync | own accounts, and own switch when no rule or academy setting decides | R + set rule + sync now for students of own batches; not a rule an admin set | all, plus the academy setting | Only the student can link an account. [GAME_SOURCES](GAME_SOURCES.md) |
| Admin email | none | none | policy, direct email, sent log; a plain Admin can't change another admin's verification | Verification status of your own account only via `/auth/email-verification`. [EMAIL_ADMIN](EMAIL_ADMIN.md) |
| Game Library | own games + LIVE_BOARD games of attended classes | own / own class / own batch / played | all | Only IMPORT games deletable (importer or admin). |
| Persistent chat | own threads; DM staff or a coach sharing a batch | own threads; groups of own students | all | `directChatAllowed`. |
| Invoices, payments, subscriptions | own | own manual-payment records for own batches (PENDING until approved) | all | Never refundable via MANUAL. A manual-payment review is claimed (status-filtered) before money moves, so concurrent reviews have one winner. |
| Payroll, payslips | — | own | all | |
| Class change requests | — | C own; R own | approve/reject | Approval revalidates the coach is still an ACTIVE coach of a live, unarchived batch (and still owns a rescheduled class). |
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
  `world.ts` builds two mirror-image sides (coach + batch + student + class +
  private puzzle + attempt + invoice + payroll record each). **A new endpoint
  that takes an id of something a user owns gets a row here**, with a positive
  control on the caller's own data.
- `test/integration/access/auth-boundary.int-spec.ts` — every mounted route
  refuses an anonymous caller (allow-list `ANONYMOUS_OK`); logout / revoked
  session / deactivated account end a still-unexpired access cookie. The test
  app's `tokenFor` creates the `auth_sessions` row each token names.
- `test/integration/access/admin-routes.int-spec.ts` — discovers every
  registered route under the admin prefixes (`/admin`, `/analytics`, `/users`,
  …) and asserts students and coaches get 403 — and plain admins on the
  SUPER_ADMIN `/admin/*` routes — so a new admin route is covered automatically;
  a mixed module lists its admin routes there. A 400 counts only when a super
  admin gets the same 400 (rejected before any role check). Routes with outside
  effects (backups) are never called with a privileged user.
- `common/security/route-auth.spec.ts` — every handler reads its request.
- Unit: `auth/authenticate.spec.ts` (session binding),
  `live-class/live-class-recording.spec.ts`, `live-class-authorization.spec.ts`
  (`enforceRemovalOnJoin`), `attendance/attendance-multi-tab.spec.ts` (webhook
  hand-off), `upload/upload.controller.spec.ts`, `user/user.service.spec.ts`.

# Multi-role accounts with a role switch

Status: **built** 2026-11-20 on branch `feat/multi-role-accounts` (PR into
`dev`, not merged). Owner asked for it on 2026-11-20 as the fix for a solo
coach who runs their own academy. §10 lists what the build changed from the
design below; the defaults are the builder's calls and can be changed in review.

## 1. Problem

Every account has exactly one role (`User.role`). A coach who runs their own
academy (the Mini plan, docs/SAAS_PLANS.md) needs an **admin** login for fees,
batches and settings and a separate **coach** login to teach. Two logins with
two emails is clumsy and confuses attendance, chat and payroll ("who is the
coach?").

## 2. What the owner gets

- One login can hold **Admin (or Super Admin) + Coach**.
- The user menu shows **"Switch to coach view" / "Switch to admin view"**. The
  switch takes about a second, needs no logout and lands on that role's
  dashboard.
- At any moment the account acts in **exactly one role**: in coach view it has a
  coach's permissions only, in admin view an admin's. This keeps every existing
  permission rule true and never mixes powers.

## 3. Rules (v1)

1. **Allowed combination: a staff account (ADMIN or SUPER_ADMIN) may also be a
   COACH.** Nothing else in v1: never STUDENT with anything (students are
   minors; their data, consent and chat rules differ), never SALES with
   anything (referral-only by design, docs/REFERRALS.md).
2. `User.role` stays the **primary** role (the higher one, admin). The extra
   role lives in a new list. Existing accounts change in no way.
3. **Only a SUPER_ADMIN of the same academy grants or removes the extra role**
   (Admin → Users → the admin's page → "Can also teach"). Granting creates the
   coach's `CoachProfile` if missing (payroll rates, transcript consent).
4. **The active role belongs to the login session**, not the account, so a
   phone in coach view and a laptop in admin view can coexist.
5. A removed extra role ends that view at once: the next request in that
   session falls back to the primary role.
6. Plan limits: an account that can teach **takes a coach seat**
   (`maxCoaches`). On Mini (1 coach) the owner's own account is that seat.
7. Every grant/removal is recorded (§5.4); switches are logged.

## 4. Why this is cheap

The API checks `user.role` in about **360 places**, but every request gets its
user from one function, `authenticateUser` (`apps/api/src/auth/authenticate.ts`),
which already loads the session. If that function hands services the user
**with `role` set to the session's active role**, all 360 checks keep working
unchanged and coach view is automatically limited to coach powers.

The access token already carries `role` (`auth.service.ts`, signed at
login/refresh). Minting it with the active role means the web middleware, route
rules (`routeAccess.ts` `ROUTE_RULES`), `getRoleDashboardHref` and the menus
follow the switch with no change.

## 5. Design

### 5.1 Data (one additive migration)

- `User.extraRoles UserRole[] @default([])` — v1 only ever holds `COACH`, and
  only on ADMIN / SUPER_ADMIN accounts (checked in the service and by a
  `CHECK` constraint).
- `AuthSession.activeRole UserRole?` — null = the primary role.
- `UserRoleChange` (new, tenant-scoped): `userId`, `role`, `action`
  (GRANTED | REMOVED), `actorId`, `createdAt`. Getter in `PrismaService`,
  `tenantId` (not a platform model), a section in the privacy export (it is
  personal data), retention: kept with the account.

### 5.2 Flows

| Flow | What happens |
|---|---|
| **Grant** `PUT /users/:id/extra-roles` (`API_ROUTES.users.extraRoles`) | SUPER_ADMIN only; target must be ADMIN/SUPER_ADMIN of the same academy and ACTIVE; seat check (`EntitlementService.assert*`, under the existing limit lock) inside the transaction; create `CoachProfile` if missing; `UserRoleChange` row. |
| **Remove** same route | Clears `COACH`; sessions whose `activeRole` is COACH fall back on their next request (§5.3), no forced logout. Batches the account coaches keep it as coach (history), and the admin sees a warning listing them. |
| **Login** | Session starts in the primary role (admin). |
| **Switch** `POST /auth/switch-role { role }` | Role must be the primary or in `extraRoles`; sets `AuthSession.activeRole` on the current session, mints a new access token (same session, refresh token unchanged), sets the cookie, returns `/auth/me`. Throttled like other auth writes; structured log line `role-switch`. |
| **Refresh** | Access token minted with `session.activeRole ?? user.role` (one place). |
| **Logout / password reset** | Unchanged (the session ends). |
| **MFA** | `MFA_REQUIRED_ROLES` is judged on the **primary** role at login, so an admin who can teach still needs MFA; switching never skips it. |

### 5.3 Enforcement (`authenticateUser`)

After the existing checks: if `session.activeRole` is set **and still allowed**
(primary, or in `extraRoles`), return the user with `role = activeRole`;
otherwise the primary role. Also return `roles` (primary + extras) and
`primaryRole` for the few places that need them (§5.5). `verifyAccessToken`
(the no-DB variant, used by the throttler, activity tracking, support-visit
and require-token interceptors, and one referral route) reads the role from the
token, which already holds the active role.

### 5.4 Queries that look for "users who are coaches"

About 22 queries filter `role: COACH` (+2 `role in [COACH, STUDENT]`). In coach
view the account is a coach, but these queries look users up **by stored
role**, so an admin who can teach would be missing from them. Each becomes
`OR: [{ role: COACH }, { extraRoles: { has: COACH } }]` through one helper
(`coachWhere()` in `common/`), with a spec that fails a new raw `role: COACH`
filter (like `route-auth.spec.ts`). Known groups: coach pickers and lists
(batches, classes, demo classes, tournaments), payroll, feedback, analytics,
messaging recipients, plan seat counting (`entitlement.service.ts`), search /
assignable users. The ~33 `role: STUDENT` filters are unaffected (students can't
hold extra roles). The 7 admin filters (`ADMIN`/`SUPER_ADMIN`) are unaffected
(the primary role is already admin).

### 5.5 Places that need the primary role or all roles

- `/auth/me` returns `role` (active) plus `roles` and `primaryRole`.
- The user list / profile shows "Admin · can also teach".
- Platform operator checks (`assertPlatformOperator`) use the primary role, so
  a Nexa super admin in coach view can't use the platform console until they
  switch back (consistent with "one role at a time").
- Live class: a coach-view account joins as the class's coach; nothing new
  (rooms already key on the user id and `resolveClassManager`).

### 5.6 Web

- `useAuthStore` keeps `user` (its `role` is the active role) and gains
  `roles`. A **role switch** in the user menu (`components/layout/`) when
  `roles.length > 1`: `mutateAsync` the switch, refresh the session store,
  `router.replace(getRoleDashboardHref(role))`, clear role-specific query caches.
- A clear **"Coach view" / "Admin view" chip** in the top bar so nobody forgets
  which hat is on.
- Admin → Users → an admin's page: "Can also teach" switch (SUPER_ADMIN only),
  with the seat count and the 402 message from the plan limit.
- No `ROUTE_RULES` or `middleware.ts` change (the token's role is the active
  role).

## 6. Tests

- Unit: `authenticateUser` returns the active role, falls back when the extra
  role is gone, refuses a forged role; the switch route refuses a role the
  account doesn't hold; grant rules (who, which combinations, seat limit, same
  academy); token minting on refresh uses the active role.
- Spec guard: no raw `role: COACH` user filter outside `coachWhere()`.
- Integration (`*.int-spec.ts`): grant → switch → coach route works, admin
  route 403s in coach view and works after switching back; removal falls back;
  seat counting under the plan-limit lock; `cross-user-access` row for the
  grant route; tenant isolation (another academy's super admin can't grant).
- E2E (staging): one login records a cash fee in admin view, switches, starts
  and teaches a live class in coach view.

## 7. Rollout

- Additive migration only; nothing changes until a super admin ticks "Can also
  teach". Rollback = stop granting (existing grants are inert rows if the code
  is rolled back: the old `authenticateUser` ignores `activeRole`).
- Docs: this file, AUTHORIZATION.md (§ "Authentication mechanics": active role),
  SAAS_PLANS.md (seat counting), PRIVACY export list, TROUBLESHOOTING row
  ("a coach is missing from a picker" → `coachWhere`).

## 8. Size

One unattended run: migration + auth change (small), ~24 query sites through
one helper (medium, mechanical), web switcher + admin toggle (small), tests
(medium). Builds on PR #165 only for the Mini plan context; no code dependency.

## 9. Later (not v1)

- Other combinations (e.g. COACH + SALES for a coach who also refers).
- A coach-primary account that can also administer (today: make the account an
  admin and tick "Can also teach", same result).
- Viewing both dashboards at once (deliberately not done: one role at a time
  keeps every permission rule simple and auditable).

## 10. As built (2026-11-20)

- **Route** `PUT /users/:id/extra-roles` `{ extraRoles: [] | ["COACH"] }`
  (next to the other `/users` routes, so the admin-route access suite covers
  it), answer `{ user, coachedBatches }`. `POST /auth/switch-role { role }`
  answers `/auth/me`'s shape and replaces only the access cookie
  (`setAccessCookie`); 10 a minute per caller. A support visit cannot switch.
- **A super admin may grant it to their own account** (a solo owner has one
  login). Logged as an owner question in BACKLOG.md.
- **Enforcement**: `applyActiveRole` (`auth/authenticate.ts`) sets `role` and
  adds non-enumerable `primaryRole` / `roles`, so a spread of the user into a
  Prisma write or a JSON body never carries them. `primaryRoleOf(user)` for
  account-level facts; MFA `status` / `disable` use it. Rules shared with the
  web: `@nexa-chess/types` `multi-role.ts` (`canHoldExtraRole`,
  `accountRoles`, `resolveActiveRole`, `rolesOf`).
- **Database**: `users.extraRoles` (default `{}`) with a CHECK constraint
  `users_extra_roles_v1_check` (only `{COACH}` on ADMIN / SUPER_ADMIN),
  `auth_sessions.activeRole`, `user_role_changes`. Migration
  `20261120192549_multi_role_accounts`.
- **Primary role changes**: editing an account to a role that can't hold its
  extra roles (e.g. admin → coach) drops them in the same update and records
  REMOVED. Reactivating or restoring an admin who can teach takes a coach seat
  again.
- **Coach lookups** (`common/coach-accounts.ts`): `coachWhere()` for queries,
  `isCoachAccount()` for a loaded account (the approval handlers' "is the
  requester still a coach" revalidation, demo-class coach checks). Changed:
  batch / schedule / class coach pickers and validation, substitute options,
  feedback ratings, payroll compensation profiles, attendance report and
  monitoring counts, analytics coach counts and the coach leaderboard SQL,
  plan seat counting and usage, announcements to coaches. Kept on the primary
  role (marked `coach-role-ok`): coach applications, a new applicant's
  account, two type/label literals.
- **Privacy export**: section `roleChanges` (without the actor's id).
- **Web**: "Switch to coach view / admin view" in the user menu
  (`useSwitchRole`: `mutateAsync`, `setUser`, `queryClient.clear()`, go to the
  role's dashboard), a "Coach view" chip in the header from `sm`, a "Can also
  teach" card under Admin → Users → Edit (super admins, staff rows only) that
  warns which batches still list the account as coach after removal, and a
  "Can also teach" badge in the users table.
- **Tests**: `auth/authenticate.spec.ts`, `auth/multi-role.spec.ts`,
  `auth/auth.service.spec.ts` (switch, refresh carry-over),
  `user/user.service.spec.ts` (`setExtraRoles`, role change),
  `common/coach-accounts.spec.ts` (the raw-filter guard),
  `user/multi-role.int-spec.ts` (grant, switch, coach-view powers, fallback on
  removal, seat count, CHECK constraint), and rows in the access suites. The
  staging e2e of §6 is not run yet.


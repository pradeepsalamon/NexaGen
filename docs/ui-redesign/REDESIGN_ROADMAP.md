# NexaChess redesign roadmap

Implementation sequence. Audit date: 2026-11-01. **The owner approved the four audit documents as the working baseline on 2026-11-01. That approval covers M0 only: M1 and later wait for separate approval.** M0 results are in [M0_REPORT.md](M0_REPORT.md).

Facts behind this plan are in [FRONTEND_AUDIT.md](FRONTEND_AUDIT.md), [SCREEN_INVENTORY.md](SCREEN_INVENTORY.md) and [COMPONENT_INVENTORY.md](COMPONENT_INVENTORY.md).

---

## 1. Approach

1. **Merge first.** Build on one branch that contains both the current `main` and the useful parts of `dev`.
2. **Tokens, then primitives, then patterns, then screens.** About 5,700 token uses and a few high-use primitives mean most of the app changes from a small number of files.
3. **Presentation only.** No API, schema, permission, route or business-logic changes. A screen keeps every action it has today.
4. **The riskiest surfaces go last and are tested throughout.** Live class and payments inherit tokens at milestone 1, so both get a check at every token change, even though their own milestones come late.
5. **Each milestone can ship alone.** Nothing is left half-converted at a milestone boundary.

### Rules for every milestone

- Keep URLs, `ROUTE_RULES`, `navItems` visibility logic and the plan gates.
- Keep `id`s and accessible names that e2e specs and `capture.mjs` rely on, or update those specs in the same change. The e2e suite has 180 role, text and label locators against only 24 `data-testid`s in the app, **so sentence-casing a label can fail a test**.
- A new third-party font, image or script host goes in the report-only CSP in `next.config.mjs`.
- Update `docs/UI_RULES.md`, `docs/RESPONSIVE.md` and CLAUDE.md §3.6 in the same change. They currently mandate pills, `rounded-full` row actions and the `nx-*` system.

### Exit check for every milestone

```bash
npm run typecheck -w apps/web
npm run lint -w apps/web
npm run build -w apps/web
npm run shots -- --paths <touched routes> --login <role> --devices all --theme both
npx playwright test <affected specs>
```

Also, at any milestone that touches tokens or shared primitives: **one real class, coach and student, phone and laptop.**

---

## 2. Decisions

Status at 2026-11-01. **Owner** means the owner decided it directly. **Follows D4** means the owner's D4 rule settles it, so it needs no separate answer unless the owner disagrees.

### Source-of-truth rule (D4)

| Source | Governs |
|---|---|
| The six v1.0 reference images | Visual direction, component appearance, layout inspiration, patterns and page composition, icon and illustration direction |
| Design System v2 (`6LcJYnJC86mGYvktHzS22t`) | Colour tokens, semantic token names, typography tokens, spacing and sizing, component specifications, light and dark themes |
| Where they conflict | v2, after correcting its documented accessibility problems |
| Never copied from the images | Inaccurate contrast values, spacing labels, typos, unsupported features |
| Above both | The owner's explicit decisions below |

### Decision log

| # | Decision | Outcome | Status |
|---|---|---|---|
| **D1** | Baseline | One branch holding current `main` and `dev`: `main`'s functionality, `dev`'s approved styling. `/` is the academy site and `/academy` redirects to it. The drawer's Chess Rating card is still open: see N1 | Owner, except N1 |
| **D2** | Navigation | Off-canvas drawer at all widths. **No persistent desktop sidebar and no mobile bottom navigation.** Restyle the drawer navy, restore a visible desktop menu button, keep all role and subscription visibility logic. The Patterns board does not overturn this | Owner |
| **D3** | Parent scope | **No parent portal and no parent role.** Contact fields stay as contact details | Owner |
| **D4** | Source of truth | See the rule above | Owner |
| **D5** | Inter | Inter is the default body font and JetBrains Mono is for chess notation. Both self-hosted. The admin and per-user font preference stays, since removing it would remove functionality, so a saved override still wins | Owner; feature kept per project scope |
| **D6** | Dark mode | Keep light and dark, using v2's values | Owner |
| **D7** | Coral `warm` | v2 has no such colour, so it goes: courses use `primary-soft`, recordings use neutral | Follows D4 |
| **D8** | Nav contents | No change: `/admin/caption-test` stays in the nav, and the unlisted analytics and attendance reports stay unlisted | Default holds, open to owner |
| **D9** | Legacy `/live-class/[id]/board` | Not redesigned. Retirement would be a separate decision | Default holds, open to owner |
| **D10** | Control size | 36px on fine pointers, 44px on coarse pointers, in rem. v2's 36px is the spec and the 44px touch target is the accessibility correction | Follows D4 |
| **D11** | Boards | Keep chessground and the 3-layer appearance system. `board-*` become the default theme values. Replacing the library would be functional work outside this project | Default holds, open to owner |
| **D12** | Content | Owner supplies verified testimonials, figures and final legal text. Blocks public launch of M10, not the build | Open, owner to supply |

### Other owner decisions (2026-11-01)

| Area | Decision |
|---|---|
| Colour roles | Primary actions royal blue. Brand navigation navy. Gold is a restrained accent and reward colour. Neutrals slate grey |
| Type | Body Inter 16px/24px. Small text 14px/20px. Chess notation JetBrains Mono |
| Icons | Lucide is the standard library. Custom chess icons only where necessary |
| Illustrations and images | A consistent library based on actual product requirements. No unnecessary decorative assets |
| Not to be built | Parent portal or role, tournament features, onboarding functionality |

### New items from M0, for the owner

See [M0_REPORT.md](M0_REPORT.md) for detail and recommendations.

| # | Item | Blocks |
|---|---|---|
| **N1** | Resolved in M5: the drawer's Chess Rating card stays gone on `dev`; students see their rating as a dashboard tile when they have one | Done |
| **N2** | `Lead.email` is a schema and API change that reaches `main` through this branch | Merge to `main` |
| **N3** | The owner's 16/24 body text differs from v2's 14/20 default UI text. The owner's decision is applied, so v2's type tokens need remapping | M1 |
| **N4** | Header colour: v2 specifies a navy app header, the Patterns board shows white. **Owner decided navy, 2026-11-02** | Nothing |
| **N5** | Logo and brand files: only raster logos exist in the repo, and v2's asset groups are empty. **Owner skipped SVG logos, 2026-11-02: the app keeps the existing PNGs.** Traced drafts were rejected as not faithful enough | Nothing. A proper vector redraw can replace the PNGs later |

### Colour tokens before M3 (2026-11-02)

The owner asked that every component and page use colour tokens before M3. Hex, literal `rgb()`, palette classes, `dark:` colours and the `nx-*` and `warm` aliases were removed, and ESLint now rejects them. The files allowed to hold literal values are listed in `docs/UI_RULES.md` §1. The marketing site moved from its own palette to v2 tokens, so its colours changed.

### Skipped by the owner

| Date | Item | Effect |
|---|---|---|
| 2026-11-02 | M2 real-class test | Automated coach and student run only, 27 of 27 with fake cameras. Real devices, private chat, poll, queue step, simul, match, interactives, recording and playback, feedback prompt and demo guest join were not tested |

---

## 3. Milestones

Size is relative effort: S, M, L, XL. No dates are given since they depend on the decisions above and on review speed.

### M0. Prepare (S–M). No visual change

| Work | Detail |
|---|---|
| Decisions | D1–D12 recorded in §2 |
| Branch | Create the redesign branch from merged `main`. Resolve the remaining conflicts (2, after `dev` took the first 24 in `a77bf3fc`). Remember that a merge into `dev` needs explicit approval |
| Baseline | Full `shots` set for all routes, both themes, as the before picture. Full e2e run |
| Real-class test | Write the coach + student script from the risk table below, run it once on current code |
| Local env | Matching migrations and a rebuilt `packages/types` so local runs are trustworthy |

**Done when:** the branch builds, e2e passes, baseline exists.

### M1. Foundation (M)

| Work | Detail |
|---|---|
| Semantic rename | `accent` → `success` first, as a mechanical change with **no visual difference**, then separate gold |
| Token values | v2 colours as `--rgb-*` triplets, light and dark. Radius, shadow and focus values |
| Typography | Inter default, JetBrains Mono vendored, `font-mono` mapped, preload updated (`fonts.ts` preloads only the two defaults). Type scale in rem |
| Charts | `useChartColors` and its fallback hexes |
| Theme colour | `themeColor` in `app/layout.tsx` |
| Docs | Rewrite `UI_RULES.md`. Add Patterns to the design system |

**Risk:** the whole app changes colour at once, including the room. Expect temporary mismatches until M2, such as gold actions that v2 would not allow. Each gold use needs a review (115 `secondary` uses plus `RowActions` and `.nx-cta`).
**Done when:** contrast is checked in both themes, and a real class has run.

### M2. Primitives (L)

Everything marked P0 and P1 in [COMPONENT_INVENTORY.md](COMPONENT_INVENTORY.md) §§2–5: `Button`, `fieldClasses` family, `Checkbox`, `Switch`, `Badge`, `Card`, `Tabs`, `Table`, `DataTable`, `RowActions`, `Dialog`, `AlertDialog`, `ConfirmationModal`, `DropdownMenu`, `Popover`, `Tooltip`, `Toaster`, `Skeleton`, `EmptyState`, `WidgetError`, `Alert`, `StatTile`/`KpiCard`, `SectionCard`, date and time pickers, `UserAvatar`.

**Risk:** the floating room toolbar and other tight layouts depend on button dimensions. Moving from 44px to 36px changes rows everywhere.
**Done when:** every primitive matches v2 in both themes, and a real class has run.

### M3. App shell (M)

`Header`, `NavDrawer` per D2, role sidebars, `UserNavMenu`, notifications popover, `ThemeToggle`, `PageHeader` with breadcrumbs, `FormPageShell`, one content width, `PageLoading`, `not-found`, `global-error`, `PlanUpgradeNotice`.

**Built 2026-11-02, not signed off.** Breadcrumbs exist with one use; other pages adopt them in their own milestones. N1 was resolved in M5. Still unchecked: signing in as each role, a joined live room, the drawer's drag gesture on a real touch screen.

Fixes known issues: edge-hover dimming, the tab covering content on phones, gold-as-status in the drawer, unnamed drawer states.

**Done when:** all three roles navigate everywhere, with plan and role filtering verified by signing in as each.

### M4. Auth and onboarding (S–M). High risk

`/login` with MFA verify and enrolment, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`.

Layout comes from the reference images' authentication pattern. The Registration canvas is for layout ideas only: its parent sign-up and Google sign-in do not exist, and it omits Coach registration (FRONTEND_AUDIT §5.1).

**Done when:** the risk table's auth checks pass.

### M5. Student area (L)

Dashboard first as the template, then schedule, live classes, batches, assignments, training, revision, progress, insights, courses, attendance. Billing waits for M8.

**Dashboard built 2026-11-02**, checked on a mocked API only. **Schedule built 2026-11-02**, checked against a real API with the seeded student; dashboard rows now use `ClassRow`. The other student pages are not started.

**Standardises:** `ClassRow`, `StatCard`, `ScheduleCalendar`, Practice board pattern, Progress template.
**Fixes:** fake recording controls, truncated phone labels, competing primary actions.
**Note:** the Progress template and practice board are shared with coach and admin, which get the benefit early.

### M6. Coach area (L)

Dashboard, batches, schedule, assignments (decide whether `AssignmentFormDialog` stays a dialog), puzzle library, puzzle forms, PDF import, students, history, attendance, presets, feedback.

### M7. Admin operations (XL). Split into reviewable parts

| Part | Screens |
|---|---|
| 7a | Table template with `/admin/users`, approvals, batches, schedule, class requests, leads |
| 7b | Analytics template: overview and 12 analytics pages, reliability |
| 7c | Attendance reports and policy |
| 7d | Content: courses, assignments, puzzles, scoring, plus knowledge and activities |
| 7e | Settings and system: messaging, feedback, appearance, typography, subscription, privacy, email, game sync, retention, backups, trash, demo classes, batch classes, live class settings |

### M8. Finance (L). High risk

`/plans`, `/checkout/[planId]`, `/student/billing`, invoice views, `/coach/payments`, `/coach/earnings`, `/admin/payments`, `/admin/finance/invoices*`, `/admin/finance/coach-payroll*`.

Reskin only. A finance change in M1–M2 still reaches these pages, so include them in those milestones' checks.

### M9. Chess surfaces and Live Class (XL). Highest risk

| Part | Scope |
|---|---|
| 9a | `BoardFrame`, move list, engine, clock, drawing toolbar, position editor, analysis and game viewer, `/chess-board` |
| 9b | Entry states: pre-join, 7 error and waiting states, class summary, demo gate |
| 9c | Room chrome: top bar, toolbar, panel tabs, stage switch |
| 9d | People, chat, moderation |
| 9e | Activities: puzzles, simul, matches, polls, queue |
| 9f | 14 interactives, PiP, spectator |

Every part ends with a real class. **Do not start 9c until the v2 live-class patterns are designed:** v2 specifies only a tile, controls and chat (COMPONENT_INVENTORY §7).

### M10. Marketing and legal (M)

`/`, `/academy` per D1, `/privacy`, `/terms`, `/help*`. Colours are already on v2 tokens (done before M3), so this is layout, type and shape. Blocked from public release by D12.

### M11. Hardening (M)

Remove or adopt unused components (`nx-*`, `warm`, `navy`, `gold` were deleted before M3). Sweep for `text-[Npx]` (231 today). Full `shots` matrix, both themes, all devices. Accessibility pass. Real-device tests including iOS Safari. Update all docs.

### Sequence

```text
M0 ─ M1 ─ M2 ─ M3 ─┬─ M4 Auth
                   ├─ M5 Student ─ M6 Coach ─ M7 Admin
                   ├─ M8 Finance
                   ├─ M9 Chess and Live Class
                   └─ M10 Marketing
                                     all ─ M11 Hardening
```

M4, M5, M8, M9 and M10 can run in parallel after M3. M6 and M7 should follow M5 because they reuse its templates. Real-class checks run at M1, M2 and M3 regardless.

---

## 4. Dependencies

| Work | Depends on | Reason |
|---|---|---|
| Any token value | Semantic `accent` rename | Otherwise success turns gold |
| M1 | N3 | D1 and D4–D7 are decided. Type tokens need the N3 remap |
| M2 Button | D10 (decided) | Sets size |
| M3 | N4 and D2 are decided, N5 is skipped | Header colour; logos stay PNG |
| M4 Register | D4 (decided) | The Registration canvas predates v2 and changes functionality |
| M9a | D11 (default holds) | Board colour source |
| M9c–f | v2 live-class patterns | Not specified yet |
| M10 | D12 | Content |

---

## 5. High-risk areas

### Live Class

| What can break | Guardrail | How to verify |
|---|---|---|
| Toolbar collides or wraps after button resizing | Keep its dimensions constant until 9c; `CLASSROOM_PANEL_OFFSET` | `shots` at 1024, 1280, 844×390 |
| Board or toolbar hidden in phone landscape | Keep `dvh` calculations | Real phone, landscape |
| `room` layout disagreement | Keep Tailwind `room` and `ROOM_ROW_QUERY` in sync | 1000×760, 768×760 |
| Slower room from new subscriptions | Field selectors, `useRoster`, `useGridTracks`; no bare `useBoardStore()` | Phone CPU check, render counts |
| Silent drop of follow-up work after sharing a puzzle | Never move board loads into per-call `mutate` callbacks | `live-class-puzzle.spec.ts`, manual share and load |
| Unreadable text on video | Keep the `bg-black/60 text-white` exception | Bright and dark camera |
| PiP unstyled or wrong theme | `copyStylesTo` copies stylesheets; check font and token loading | Chromium Document PiP, Safari video PiP |
| Recording changes or breaks | Do not touch `/recorder` or its console contract | `recording-flow.spec.ts`, one real recording |
| Student data exposure through a layout change | API already scopes; do not surface coach-only panels by moving components | Run as student and as guest |
| Demo guests break | Use `useRoomClassId`, not `useParams` | One guest join |
| Persisted choices lost | Never rename `localStorage` keys, interactive ids or background presets | Reload mid-class |

**Real-class script:** coach starts, student joins from dashboard on a phone, mic and camera toggle, chat and private chat, board control grant by colour, share a puzzle and solve it, leaderboard, poll, one queue step, one simul move, one match move, one interactive, record and stop, end class, summary and feedback prompt, recording playback. Repeat at laptop and tablet width, in both themes.

### Chessboard interactions

| What can break | Guardrail | How to verify |
|---|---|---|
| Drag becomes scroll on touch | Keep `touch-action: none` on `cg-board` and spare pieces | Real phone |
| Board stops being square or overflows | Keep JS sizing in the position editor; never centre an overflowing board with `align-items: center` | `analysis-board.spec.ts`, `shots` |
| Hardcoded board colours creep in | Every board reads `useChessAppearance()` | Change theme in `/chess-board`, check all surfaces |
| Practice layout regressions | Keep `PRACTICE_BOARD_GRID` and `PRACTICE_BOARD_BESIDE` | Solve at 768 and 1024 |
| Arrows and highlights lost contrast | Test annotations on each board theme | Manual |
| Page CSS leaks into chessground | Keep overrides in `chess-appearance/styles` | Visual diff |

### Authentication

| What can break | Guardrail | How to verify |
|---|---|---|
| MFA step lost or looping | Keep steps inside `LoginForm`; wrong code stays 400 | Log in with MFA on, wrong code, recovery code, first-time enrolment |
| Lockout messages hidden | Show 429 text in the same place | 5 wrong codes, 10 wrong passwords in test |
| Session state regressions | Do not touch `lib/api.ts`, `SessionBootstrap`, cookie handling | Refresh token expiry, two tabs |
| Redirect behaviour changes | Do not change middleware | Each role to a forbidden URL |
| Tools and tests fail | Keep `#email`, `#password`, button name regex | `capture.mjs`, e2e fixtures |
| Forms lose validation | Keep Zod schemas; visual changes only | Submit empty and invalid |

### Permissions

| What can break | Guardrail | How to verify |
|---|---|---|
| Nav shows a page a role cannot use | Keep `getAdminNavItems`, `filterNavByPlan`, `superAdminOnly`, `feature` | Sign in as all four roles, on a low plan |
| Action shown that returns 403 | Do not reveal hidden actions when moving them into menus | `admin-routes` suite, manual |
| Plan gate bypassed visually | Keep `RouteFeatureGate` in `AppShell` | Lower a plan in test data |
| Shared routes show wrong view | `/classes/[id]` and `/profile` branch on role; keep the branches | Open as each role |
| `SuperAdminOnly` lost in a rewrite | Keep wrappers | Plain admin on `/admin/backups` |

The API enforces every role, so a UI mistake exposes a button rather than data, but it still produces a confusing failure.

### Payments

| What can break | Guardrail | How to verify |
|---|---|---|
| Duplicate submit | Keep disabled and loading behaviour on pay buttons; idempotency stays server-side | Double click in sandbox |
| Gateway handoff breaks | Do not touch `features/payments` flow logic; CSP host list stays | Razorpay, Cashfree and Stripe sandboxes |
| UPI QR unreadable | Keep the white background | Scan on a phone |
| Status recovery lost | Keep "I have completed payment" and status check | Abandon and return |
| Amounts misrepresented | Display only; minor-unit conversion stays in `toMinorUnits` | Compare with API values |
| Invoice looks edited | Invoice is a frozen snapshot; printable HTML has its own CSP and is API-rendered | Compare web, printable and PDF |
| Refund appears settled early | Status comes from webhook or reconcile; keep labels accurate | Sandbox refund |
| Payroll state confused | Same step order; visual only | Run a period in test data |
| Access mismatch | Access comes from `Entitlement`; never infer it in the UI | Paid and unpaid student |

**No screen in M8 ships without a sandbox purchase.**

### Other

| Risk | Note |
|---|---|
| Merge drift | `main` keeps moving. Merge often: the verdict counted 20 conflicting files at 55 commits behind, and the audit counted 24 at 85. `dev` resolved those 24 in `a77bf3fc`, and M0 resolved the 2 left by PR #125 |
| Text scale | Fixed px sizes ignore the user's setting. Do not add more |
| CSP | The web CSP is report-only for scripts, so a missed host shows only as console violations |
| Sentry privacy | No change expected; students are minors, so never add names to telemetry during debugging |

---

## 6. Out of scope

Listed so they are not assumed. Each would be a separate request.

- Parent role, parent portal, or parent reports
- Persistent desktop sidebar or mobile bottom navigation
- Tournament features, onboarding functionality, or decorative assets with no product need
- New API endpoints, schema changes, or changes to permissions (`Lead.email`, already on `dev`, is item N2)
- Global search, onboarding tours, or new dashboards
- Replacing chessground, LiveKit, TanStack, or Radix
- Removing dark mode, font preferences, or board appearance settings
- Renaming routes
- Writing marketing claims or legal text
- Changing `/recorder`

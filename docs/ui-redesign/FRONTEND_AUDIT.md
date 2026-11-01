# NexaChess frontend audit

Phase 1 of the UI/UX redesign. Audit date: 2026-11-01. **No application code was changed.** The owner approved this audit as the working baseline on 2026-11-01, with the decisions in [REDESIGN_ROADMAP.md](REDESIGN_ROADMAP.md) §2. Findings below were measured on the branches named. §1 and §5 are updated for those decisions and for the merge in [M0_REPORT.md](M0_REPORT.md).

Companion documents: [SCREEN_INVENTORY.md](SCREEN_INVENTORY.md) · [COMPONENT_INVENTORY.md](COMPONENT_INVENTORY.md) · [REDESIGN_ROADMAP.md](REDESIGN_ROADMAP.md)

In this document, **Existing** means present in the code today. **Proposed** means a recommendation that has not been built.

---

## 1. Summary

| Metric | Result |
|---|---|
| Routes (`page.tsx`) | **126** on `redesign/design-system-v2`. The audit counted 125 across `dev` and `main`; the merge removes `/academy` and adds `/admin/requests` and `/coach/requests` |
| Rendered routes | **121** (5 are redirect-only; `/admin/class-requests` became one in PR #125) |
| Designable screens | **143** (rendered routes plus 22 non-route states, see §3.4) |
| Shared components | **71** `.tsx` files in `components/` on `dev`, 6 of them with no importer |
| Major workflows | **38** (§9) |
| Modal surfaces | 82 files render a dialog |
| Tabbed surfaces | 25 files use `TabsList` |

**The five findings that shape the project:**

1. **The redesign must start from a merged branch.** *Done in M0: see [M0_REPORT.md](M0_REPORT.md). The figures that follow describe the branches at audit time.* `main` is 85 commits ahead of `dev` and has 11 screens `dev` lacks (Help centre, Knowledge base, Email, Game sync, Data retention, puzzle activities, `/academy`). `dev` has one commit `main` lacks: the navy/gold reskin (#106). A trial merge conflicts in 24 files, including `Header.tsx`, the student dashboard and three live-class files.
2. **Most of the app can be re-themed through tokens.** Feature code has about 5,700 semantic token uses (`text-app-text`, `bg-primary`) and only 375 `nx-*` uses. Changing token values reaches almost every screen at once, which is the largest source of leverage and also the largest risk.
3. **Token names mean something different in the approved system.** Today `accent` is green and `secondary` is gold. In design system v2, `accent` is gold. `primary` is navy today and royal blue in v2. Swapping values alone would turn every success state gold, so semantic remapping must come first.
4. **There is no parent or ERP surface.** `UserRole` has `SUPER_ADMIN`, `ADMIN`, `COACH` and `STUDENT`. Parent access was deliberately not built ([PARENT_REPORTS.md](../PARENT_REPORTS.md)). "ERP" maps to the admin area. No such screens are proposed here.
5. **The live class has never been checked in the navy/gold look.** It has 326 reachable files, 94 API routes and 2,118 token uses, so a token change reaches it immediately. Every milestone that changes tokens needs a real-class check.

Twelve decisions need an owner's answer before implementation: see [REDESIGN_ROADMAP.md § Decisions](REDESIGN_ROADMAP.md#2-decisions-needed-before-implementation).

---

## 2. Method and limits

| Evidence | How it was gathered | Tag used in the inventory |
|---|---|---|
| Static reach analysis | A throwaway TypeScript AST script followed each page's imports at symbol level, so a page lists only the API calls and components it can actually reach. Run on `dev` (`10f307b8`) and `origin/main` (`ae52644e`) | Generated fields |
| Browser sweep | Chromium navigation at 390×844, 820×1180 and 1366×768, signed in as seeded users, against a local stack with mail, LiveKit, Cloudinary and object storage disabled. No controls were clicked and no forms were submitted | `[measured]` |
| Source reading | Files named in each note | `[code]` |
| Project documents | `docs/*.md` | `[docs]`, `[baseline]` |
| 2026-11-01 redesign verdict | Your earlier comparison of live and `dev`, including its screenshots | `[verdict]` |

**Writes the sweep caused, in the local database only:** pages that write when they load did so. `/student/training` started puzzle attempts for the seeded student (6 calls), `/` recorded visitor tracking (3 calls), and logging in created sessions. The API also ran its scheduled jobs against the local database for about an hour. No application code or production system was touched.

**What this audit could not verify:**

- **Live class room:** not run. LiveKit in this environment points at the host production uses, so it was disabled for the sweep. Pre-join and waiting states were read in code only.
- **Checkout and real payments:** no gateway was configured and nothing was purchased.
- **Touch and real devices:** the sweep resized a desktop Chromium. Touch emulation, iOS Safari and real networks were not tested.
- **Dark mode:** the sweep ran in light mode. Dark-mode notes come from code and the verdict.
- **Screens on `main` only:** analysed statically, not opened in a browser.
- **Some endpoints failed locally:** the student dashboard and attendance endpoints returned 500 because the local Prisma client expects a `class_attendance.correctedAt` column the local database lacks. This is a mismatch in this machine's setup, not a shown product bug. `/student`, `/student/live-classes`, `/student/attendance`, `/coach/attendance`, `/admin/attendance` and `/admin/attendance/completed-classes` were therefore seen in their error states. The verdict's screenshots cover the student dashboard with data.
- **Sparse seed data:** many lists were empty, which is useful for empty states but means populated tables were not all measured.
- **Inferred states:** loading, empty, error and success states in the inventory are inferred from reachable code. A listed state exists in the code path; not every one was triggered.

---

## 3. Routes and pages

### 3.1 Count by area

| Area | Routes | Notes |
|---|---|---|
| Public marketing and legal | 4 | `/`, `/academy` (page on `main`, redirect on `dev`), `/privacy`, `/terms` |
| Auth | 5 | `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` |
| Student | 17 | One redirect (`/student/puzzles`) |
| Coach | 17 | |
| Admin | 68 | 60 on `dev`, 8 on `main` only. Three redirects |
| Shared signed-in | 10 | `/profile`, `/messages`, `/games`, `/games/[id]`, `/chess-board`, `/plans`, `/checkout/[planId]`, `/classes/[id]`, plus `/help` and `/help/[slug]` on `main` |
| Live class and guest | 4 | `/live-class/[roomId]`, `/live-class/[roomId]/board` (legacy), `/demo/[classId]`, `/recorder/[classId]` (not user-facing) |
| **Total** | **125** | 114 on `dev`, 11 on `main` only, 4 redirects |

Every route is itemised in [SCREEN_INVENTORY.md](SCREEN_INVENTORY.md).

Non-page routes: `/llms.txt`, `/robots.txt`, `/sitemap.xml`, `opengraph-image`. These have no UI.

### 3.2 Access control (Existing, must be preserved)

- **`middleware.ts`** is the one page-level gate. With no session cookie it redirects to `/login?reason=unauthorized`. With the wrong role it redirects to that role's dashboard.
- **`lib/routeAccess.ts` `ROUTE_RULES`** holds the rules. `/admin/backups`, `/admin/classes`, `/admin/demo-classes` and `/admin/trash` are `SUPER_ADMIN` only; `/admin/data-retention` joins them on `main`. The rest of `/admin` is `SUPER_ADMIN` and `ADMIN`.
- **The role read in middleware is unverified** and is for routing only. `SessionBootstrap` re-checks once `/auth/me` resolves. The API enforces every role.
- **Not gated by middleware by design:** `/live-class/*` (the page handles API refusals), `/demo/*` (guests), `/recorder/*` (egress token).
- **Plan gates:** `RouteFeatureGate` in `AppShell` replaces gated pages with `PlanUpgradeNotice`. Nav items also hide by `feature` and `superAdminOnly`. The API answers 402.

Any redesign of navigation must keep `navItems.ts` as the source for `feature` and `superAdminOnly`, and `filterNavByPlan`/`getAdminNavItems` as the filters.

### 3.3 Routes reached without the nav

Nothing is truly orphaned, but these need a link inside another page to be found:

| Route | Reached from |
|---|---|
| `/admin/analytics/students` | Report links on `/admin` |
| `/admin/attendance/coaches`, `/admin/attendance/completed-classes` | `/admin/attendance` |
| `/admin/students/[studentId]` | One row action in `/admin/users` |
| `/live-class/[roomId]/board` | Nothing. Kept for an e2e spec [docs] |

### 3.4 Non-route screens that need design

| Group | Count | Screens |
|---|---|---|
| Live class states | 10 | Loading, Class not started, Waiting for coach, Waiting for admit, Removed from class, Join denied, Permission denied, Connection lost, Pre-join, Class summary |
| Live class variants | 3 | Beyond the route itself: coach and student differ, and phone differs from `md+` |
| Demo | 1 | Guest gate |
| Class details | 1 | Student and staff views on one route |
| Auth steps | 4 | MFA verify, MFA enrolment, Coach application received, Student registration received |
| Global | 3 | `not-found`, `global-error`, plan upgrade notice |
| **Total** | **22** | |

---

## 4. Layouts and navigation (Existing)

| Layer | Implementation |
|---|---|
| Root | `app/layout.tsx`: theme-init script before first paint, typography variables, `AppProviders` |
| Chromeless routes | `AppProviders` hides `Header` on `/`, auth routes, `/live-class`, `/demo` |
| Role shells | `app/admin`, `app/coach`, `app/student` layouts: `AppShell` + `<main>`, with widths of `max-w-7xl`, `max-w-6xl` and `max-w-[1180px]` |
| Header | Fixed, 64px. On `dev` white with logo, centred page label at `lg`, bell, theme toggle, user menu |
| Navigation | `NavDrawer` in `Sidebar.tsx` (503 lines): off-canvas at **every** width, opened by the ☰ button below `lg`, a gold edge tab, or hovering the left edge |
| Student nav | 17 flat links on the merged branch |
| Coach nav | 18 flat links on the merged branch, including `/coach/requests` |
| Admin nav | Dashboard + Live now + 7 accordions: 41 destinations for a super admin on `dev`, 45 on `main` |
| Page furniture | `PageHeader`, `FormPageShell`, `BackButton`, `PageLoading` |
| Live class | Own top bar and floating toolbar, no global header |

**Issues:**

- **Decided (D2, reconfirmed 2026-11-01):** the off-canvas drawer stays at every width. There is no persistent desktop sidebar and no mobile bottom navigation. The drawer is restyled navy and a visible desktop menu button returns. The Patterns board, and v2's Sidebar, which reads as a persistent rail, do not overturn this.
- On `dev`, the desktop menu button is gone, leaving the edge tab and hover as the only ways in [verdict].
- Touching the left screen edge dims the page by 15% [verdict].
- The closed drawer's tab overlays page content on phones [baseline; seen again in this sweep].
- Three role shells use three content widths, and the student shell uses `nx-*` while the other two use `app-*` [code].
- **Gold is used for generic actions** on `dev`: Back on class details, Save draft on puzzle forms, Logout on profile, Archive in row actions [measured]. Design system v2 reserves gold for reward and secondary calls to action, so these need a per-use review, not only a colour swap.
- Student and coach navs are long and flat, with 16 items each. Grouping them is a Proposed change that does not move any route.
- **Names that blur together:** `/admin/live-class` (settings) and `/admin/live-classes` ("Live now"). "Chess board" is really appearance settings. Student "Assignments" lives at `/student/practice`.

---

## 5. Design system: current state and approved target

### 5.1 Where the approved reference lives

| Artifact | Role |
|---|---|
| **NexaChess Design System** (`6LcJYnJC86mGYvktHzS22t`), "v2 palette" | **Canonical technical specification (D4):** colour tokens, semantic names, type tokens, spacing, sizing, component specs, light and dark themes. Contains `tokens.json`, `README.md`, `bundle.css`, 14 components |
| **Six v1.0 reference boards** (`ui/*.png`, untracked; the brief names `docs/ui-redesign/reference/`, which does not exist) | **Visual direction (D4):** component appearance, layout inspiration, patterns and page composition, icon and illustration direction |
| NexaChess Design System canvas (`Y6SKw9uLKbekxSXp91SR28`) | Earlier draft using `#3355E0`. Not the target |
| NexaChess Registration canvas (`5ApJAzds5AJzPNiktc13c8`) | Register screen draft that predates v2. **Not usable as drawn**, see below |
| Stitch projects (Live Class UI, Student Dashboard and others, Sep–Oct 2026) | Older explorations, not used |

**The Registration canvas conflicts with the rules of this project.** It uses Fraunces and Manrope with a `#C9A227` gold CTA and `#0B1F3A` navy, not v2's values. More importantly, it changes functionality:

| In the canvas | In the app today |
|---|---|
| "A student" or "A parent" switch | Student or Coach switch. **There is no parent account, and the canvas drops Coach registration** |
| "Continue with Google" | No social sign-in exists |
| "Child's full name" under a parent | Student form has separate parent name and contact fields |
| "Chess level" with four options, +91 phone, terms checkbox | Form has age, WhatsApp/phone, acquisition source, parent fields and more; no terms checkbox |

Its split navy panel layout is a good direction for the Auth pattern. The fields and options must come from the existing forms.

**The brief describes four sections: Components, Patterns, Guidelines, Resources.** v2 has Components, and its README covers Guidelines. The v1.0 boards now show all four as pictures, which settles direction under D4. **v2's `assetGroups` is still empty and the repo holds only raster logos, so real brand files are still needed (N5).**

**Not to be taken from the boards (owner, 2026-11-01):** Parent Dashboard and any parent content, persistent left nav and bottom nav, Tournaments, the onboarding flow, the 1,200+ icon set, the 50+ illustrations, Figma and Stitch kits and ZIP downloads as if they existed, decorative assets with no product need, printed contrast figures, typos and the mislabelled 40px spacing step.

### 5.2 Current versus target

| Aspect | `dev` today | `main` today | Design system v2 |
|---|---|---|---|
| Brand navy | `#071B41` | not used | `brand-800 #0F1E3A`, chrome only, never a button |
| Primary action | Navy `#071B41`; gold in dark | Royal `#2447A0` | `primary #2F5FD0`; `#6B93EA` in dark |
| Gold | `#BB8B37` / `#E2B355` | Saffron `#F4B63F` | `accent #E9BE72`, reward only, never a status |
| Success green | Token named `accent` | Token named `accent` | `success #15803D` |
| Coral | `warm` for courses and recordings | `warm` | **None in v2** |
| Body text | Navy `#071B41` | `#172049` | `ink #111827` |
| Fonts | Outfit + Nunito Sans | Outfit + Nunito Sans | Inter, JetBrains Mono for notation |
| Button shape | Pill, 44px | Pill, 44px | `radius-md` 8px, 36px |
| Field | 12px radius, tinted fill, **gold** focus | Differs (`fieldStyles` absent) | 8px, white, 36px, **blue** focus |
| Cards | 20px radius | 20px | `radius-lg` 12px |
| Table header | Solid navy, centred cells | Solid brand | `surface-sunken`, muted 12px text |
| Tabs | Solid fill on a track | Solid fill on a track | Solid blue on a sunken track (close match) |
| Drawer | White, gold active | Primary blue | Navy `brand-900`, gold inset bar |
| Row actions | Filled circles by colour | Filled circles | Neutral icon buttons, `Menu`, destructive last |
| Badges | Sentence case, tinted | Same | Close match |
| Icons | Lucide | Lucide | Lucide, 1.75 stroke (code uses 2–2.5) |

**Where the boards and v2 differ, v2 wins (D4):** success `#15803D` not `#16A34A`, warning `#B45309` not `#D97706`, info `#0369A1` not `#0EA5E9`. v2's values also fix the white-on-status contrast failures in the boards' fills. Neutrals follow v2's slate scale, as the owner decided. `ink` stays `#111827`, which v2 records as deliberate.

**The one owner decision above v2 (N3):** default body is Inter 16/24 and small text 14/20, where v2 has `body` 14/20 and `body-large` 16/24. `body-small` 12/16 stays for captions and badges.

### 5.3 Token debt, measured on `dev`

| Measure | Count | Concentrated in |
|---|---|---|
| Semantic token uses (`app-*`, `primary` and so on) | 5,691 | Everywhere; 1,586 in live class |
| `nx-*` uses | 375 | Student dashboard, auth, shell, chess-board, revision |
| Arbitrary hex colours | 710 | **All in `features/academy`** |
| `dark:` colour overrides | 120 | **All in `features/academy`** |
| Tailwind palette classes | 15 | Mostly small exceptions |
| Pixel font sizes `text-[Npx]` | 231 | Live class 98, academy 77. These ignore the user's text-size setting |
| Banned radii (`rounded-xl` etc.) | 70 | Student dashboard 27 |
| Banned shadows | 17 | Academy 7, auth 4 |

App code outside the academy site is close to token-clean. Phase G of the 2026-10-17 polish did most of that work.

Two token systems now coexist on `dev`: `app-*` and `nx-*`. `tailwind.config.ts` holds around 100 `nx-*` entries, plus unused-looking `navy` and `gold` scales and `text-primary`-style aliases. The redesign should end with one system.

### 5.4 Approved system: problems to resolve before building on it

Measured with the WCAG formula:

| Item | Finding |
|---|---|
| `line-strong` `#CBD5E1` on white | README and token note say 3:1. **Actual: 1.48:1.** Input borders and unchecked controls fail WCAG 1.4.11 |
| `ink-subtle` on `surface-sunken` | **4.34:1**, below 4.5:1 for 12px captions in table headers |
| `accent` as text on white | 1.74:1. Correctly forbidden by the system; the code must use `accent-ink` |
| Passing pairs | White on primary 5.72, on-accent on gold 7.93, ink-muted, status inks on soft (all ≥ 4.5), `on-brand-muted` on navy 8.78 |

Conflicts with existing project rules:

| Design system says | Project rule | Proposed resolution |
|---|---|---|
| 36px controls | Touch targets ≥ 44px on interactive controls (RESPONSIVE §7) | **Follows D4:** 36px on `pointer: fine`, 44px on `pointer: coarse`, using the existing media query in `globals.css` (D10) |
| Font and spacing in px | Sizes must be rem so the user's text-size setting works (UI_RULES §6) | Convert to rem at the default scale |
| Render with react-chessboard, pass square colours | Boards use chessground; every board reads `useChessAppearance()` (§3.6h) | Keep chessground, the default that holds unless the owner says otherwise. `board-*` tokens become the default appearance theme (D11) |
| "Inter from Google Fonts" | Never `next/font/google`; self-host through the vendor script (§3.6j) | Inter is already vendored. JetBrains Mono is not, and must be added to the catalogue |
| Plain `nc-*` CSS classes | Reuse CVA primitives in `components/ui/` | Port values into existing primitives. **Do not ship a second `nc-*` layer** |
| Buttons and fields square-ish | UI_RULES mandates pills, `rounded-full` row actions | UI_RULES and CLAUDE.md §3.6 must be rewritten in the same change |
| Gold reserved for reward | `RowActions` `warning` tone is gold; Archive uses it | Use neutral or `warning` orange |
| Navy paints the app header | `dev` header is white, and so is the Patterns board's | **N4:** D4's rule points to navy; owner to confirm before M3 |
| Inter only | Fonts are an admin and per-user preference with locks (§3.6j) | Keep the feature; change the default (D5) |
| Lucide at 1.75 stroke | CLAUDE.md §3.6 and rule 7 require `strokeWidth={2.5}` on table actions | **Follows D4:** v2's stroke, with CLAUDE.md rewritten in the same change |

---

## 6. Role functionality (Existing)

### 6.1 Student

Dashboard; schedule (calendar and list); live classes and recordings; batches; assignments with five activity types (replay, solve line, play vs engine, free analysis, puzzle set), results and leaderboards; rated puzzle training; Smart Revision with spaced repetition; progress (overview, performance, activity history, revision, games, puzzles); game insights with PGN upload and linked accounts; courses; attendance; billing (payments, invoices, credit notes, access, subscriptions, billing details); plus shared chat, game library, board preferences and profile.

### 6.2 Coach

Dashboard with KPIs and class actions; batches; schedule with extra-class and reschedule requests; assignment library, assignment to batches and leaderboards; puzzle library with Lichess catalogue, topic folders and PGN/PDF import; students and student progress with revision recommendations; own feedback; class history and notes; attendance; class presets; earnings; recording manual payments; shared chat, games and preferences; everything in the live room's coach view.

### 6.3 Parent

**No parent screens exist.** There is no role, login, link to a child or report, and [PARENT_REPORTS.md](../PARENT_REPORTS.md) records this as deliberate because students are minors and no guardian identity is verified. Parent-related data that does exist:

- **Contact fields:** `StudentProfile.parentName`, `parentEmail`, `parentPhone`, `parentRelationship`, entered at registration and in profiles, and shown to staff.
- **`BillingProfile`:** bill-payer details.
- **Lead fields:** `parentName` on demo bookings from the academy site.
- **Messages:** invoices can reach a parent's WhatsApp through messaging rules.
- **Marketing copy:** the site addresses parents.

The redesign must not add a parent portal or imply one exists. Register form copy should describe these as contact details.

### 6.4 Admin and "ERP"

There is no ERP module by that name. These are the admin modules a brief would call ERP:

| Domain | Screens |
|---|---|
| People | Users, approvals, leads, coach feedback, privacy requests, chat; Email on `main` |
| Scheduling | Batches, class scheduler, class requests, attendance reports and policy, live reliability, Live now, batch classes |
| Learning | Courses, assignments, puzzle library, puzzle points, game library; Knowledge base and activities on `main` |
| Finance | Payments (8 tabs), invoices and credit notes, coach payroll |
| Communication | Messaging rules, announcements, delivery log |
| Reporting | Overview plus 10 analytics pages and 2 drill-downs |
| Settings | Live class defaults, chess appearance, fonts, subscription; Game sync on `main` |
| Super admin | Backups, trash, demo classes, batch classes; Data retention on `main` |

Plain `ADMIN` differs from `SUPER_ADMIN` only on the super-admin routes above, plus visibility of those nav items.

---

## 7. Live Class and the chess teaching board

### 7.1 Structure (Existing)

The room is by far the largest surface: **207 files and about 34,500 lines** in `features/live-class`, 26,600 of them in `.tsx`.

| Region | Components |
|---|---|
| Entry states | `ClassroomStateShell`, `PreJoinCard`, `LoadingMeeting`, `ErrorStates` (7 states), `ClassSummary` |
| Shell at `md+` | `MeetingLayout`, `ClassroomTopBar`, `ClassroomLayout`, `ClassroomBoard`, `ClassroomPanel`, `ClassroomVideo`, `ClassroomGallery`, floating `MeetingToolbar` |
| Phone | `MeetingVideoGrid`, `BoardStage`, `MeetingSidebar` as a full-screen drawer |
| Coach panel tabs | Leaderboard, Moves, Chat, People, Response, Queue, Engine, PGN, Games |
| Coach sidebar | Chapters and Members over Leaderboard and Chat, shown only when there is spare width |
| Stage switch | Board, Gallery, and one tab per running activity |
| Activities | Puzzles and leaderboards, Simul, Student matches, Move polls, Activity queue |
| Interactives (14) | Pick a Student, Mystery Box, Wall of Moments, Team Generator, Grandmaster Mapper, Chess Balance, White or Black, Chess Legends, Opening of the Day, Chess Video Generator, Rating Calculator, Classroom Timer, Puzzle Storm, Puzzle Racer |
| Room control | Waiting room, kick, force mute, request on, mute all, pull into class, screen-share approval |
| Media | Device picker, video effects (blur, backgrounds, auto-framing), PiP in two modes, mobile audio session |
| Other | Recording, captions, reactions, in-class chat with private threads, board control per colour |

### 7.2 Things a restyle can silently break

| Constraint | Why it matters | Source |
|---|---|---|
| `room` breakpoint and `ROOM_ROW_QUERY` | CSS and JS must agree on the side-by-side layout | RESPONSIVE §2 |
| Floating toolbar width | Coach toolbar is about 710–744px and the layout reserves a 740px stage at `xl`. Larger or smaller buttons change this | RESPONSIVE §6.8 |
| `dvh` rules (46) and rush board height calcs | Phone landscape must not hide the toolbar | LIVE_CLASS |
| Z-index map in `lib/meetingUi.ts` | Central layer order | RESPONSIVE §6.8 |
| PiP window | Clones stylesheets and mirrors `data-theme`; deliberately uses native `title=` because Radix tooltips cannot appear there | LIVE_CLASS, baseline Phase G |
| Fixed-order gallery and render selectors | Provider read patterns keep phones usable. Do not add broad subscriptions when restyling | CLAUDE.md §3.7 |
| Overlays on video and board | `bg-black/60 text-white` is the allowed exception, not debt | UI_RULES §1 |
| `RECORDER` template | Recording contains the board only through this page | LIVE_CLASS |
| Keyboard shortcuts | `coachBoardShortcuts.ts` feeds handlers and hints | LIVE_CLASS |
| Persisted ids | Interactive ids, background presets and catalogue ids must never be renamed | LIVE_CLASS |
| Local storage keys | Panel width, video height, sidebar tabs, media prefs and more | LIVE_CLASS |
| Per-call `mutate(…, { onSuccess })` | Sharing a puzzle unmounts its caller, so moving a button can reintroduce a silent bug | CLAUDE.md §3.7 |

### 7.3 Chessboard (Existing)

`features/chessboard`: chessground + chess.js through the `@/lib/chess` wrapper, with `ChessgroundBoard`, `PracticeBoard` (21 importers in 6 features, the most reused chess component), `PositionEditor`, `ReadOnlySyncedBoard`, `BoardWorkspace`, `SetupPositionWorkspace`, panels for moves, engine, PGN, clock and masterbase, toolbars for navigation and drawing. `cg-board` is `touch-action: none`. Appearance comes from a 3-layer resolver in `features/chess-appearance` (16 files). On `dev`, boards are unchanged by the recolour [verdict].

Proposed direction: treat the board as the one thing that is never restyled from page CSS. Only its frame, panels and toolbars change.

---

## 8. Auth, onboarding and responsive behaviour

### 8.1 Auth and onboarding (Existing)

- **Register:** Student or Coach switch; both end in a pending-approval state. Admin approves in `/admin/approvals`.
- **Login:** password, then MFA verify or enrolment when required. Wrong codes return 400, not 401, so the refresh interceptor does not fire. 429 lockouts need clear messages.
- **Verify email:** link flow. The in-app banner is commented out in `AppProviders` as "Temporarily disabled".
- **Reset password:** token flow with confirmation.
- **Sessions:** HTTP-only cookies, refresh interceptor in `lib/api.ts`, `SessionBootstrap`, `useAuthStore`.
- **Guests:** demo classes use a `guestToken`, not a session.

There is no multi-step onboarding after approval. A first-run tour would be a new feature and is not proposed.

Tooling relies on these selectors, so they must stay: `#email`, `#password`, and the login button name matching `/sign in|log in|login/i`.

### 8.2 Responsive behaviour (Existing)

Documented in [RESPONSIVE.md](../RESPONSIVE.md): floor of 320px, no page-level horizontal scroll, wide tables scroll in their own box, `dvh` for viewport heights. Breakpoints: `xs` 400, `sm` 640, `md` 768, `room`, `lg` 1024, `xl` 1280, `2xl` 1536. Board experiences change at `md`.

Sweep results are in §10. Patterns from the code:

| Pattern | Use |
|---|---|
| `stackOnMobile` card rows | 3 routes on `dev`: `/admin/batches`, `/coach/history`, `/coach/students` (plus `/admin/email` on `main`). 45 routes with tables do not use it |
| `pin="end"` action column | Puzzle libraries and earnings |
| Horizontal table scroll | Default elsewhere, including `/admin/users` |
| JS viewport checks | Mostly the live room (15 `matchMedia`-style uses) and the academy navbar |

Tablet is the least considered width: 57 of the 121 rendered routes have no `md:` rule at all in reachable code, so they either stay in phone layout up to 1024px or depend on `sm:` and `lg:`. A count of zero does not show a defect, but it marks where to look first.

---

## 9. Major workflows

| ID | Workflow | Roles | Key screens |
|---|---|---|---|
| W1 | Registration and approval | Visitor, admin | `/register`, `/verify-email`, `/admin/approvals` |
| W2 | Sign-in with MFA | All | `/login` |
| W3 | Password recovery | All | `/forgot-password`, `/reset-password` |
| W4 | Account, data export, deletion, legal | All, admin | `/profile`, `/admin/privacy`, `/privacy`, `/terms` |
| W5 | Find and join a class | Student | `/student`, `/student/schedule`, `/classes/[id]`, room |
| W6 | Start, run, end and monitor a class | Coach, admin | `/coach`, `/classes/[id]`, room, `/admin/live-classes` |
| W7 | Pre-class settings and presets | Coach, admin | `/coach/presets`, `/admin/live-class`, batch form |
| W8 | In-class puzzles and leaderboard | Coach, student | Room, `/admin/puzzles/scoring` |
| W9 | Activity queue | Coach | `/classes/[id]`, room |
| W10 | Simul | Coach, student | Room |
| W11 | Student matches | Coach, student | Room |
| W12 | Move polls | Coach, student | Room |
| W13 | Interactives, Puzzle Storm and Racer | Coach, student | Room |
| W14 | Moderation, waiting room, pull into class | Coach | Room |
| W15 | Recording and playback | Coach, student, admin | Room, history, dashboards, analytics |
| W16 | Demo classes, invites and guests | Super admin, guest | `/admin/demo-classes`, `/demo/[classId]` |
| W17 | Batch management | Admin, coach, student | `/admin/batches`, role batch pages |
| W18 | Recurring schedules | Admin | `/admin/schedule*` |
| W19 | Extra class and reschedule requests | Coach, admin | `/coach/schedule`, `/admin/class-requests` |
| W20 | Attendance | All | Role attendance pages, policy, reports |
| W21 | Assignments: create, assign, solve, review | Coach, admin, student | Assignment pages, `/student/practice/[id]` |
| W22 | Puzzle library, imports, solving and training | Coach, admin, student | Puzzle pages, `/student/training` |
| W23 | Smart Revision | Student, coach | `/student/revision`, progress |
| W24 | Student progress review | Student, coach, admin | Progress pages |
| W25 | Game library, analysis, insights, sources | All | `/games*`, `/student/insights` |
| W26 | Courses | Admin, student | `/admin/courses*`, `/student/courses*` |
| W27 | Persistent chat | All | `/messages` |
| W28 | Plans, checkout, gateway and manual payments | Student, coach, admin | `/plans`, `/checkout`, `/coach/payments`, `/admin/payments` |
| W29 | Subscriptions, refunds, discounts, routing | Student, admin | `/student/billing`, `/admin/payments` |
| W30 | Invoices and credit notes | Student, admin | Billing, `/admin/finance/invoices*` |
| W31 | Coach payroll | Admin, coach | `/admin/finance/coach-payroll*`, `/coach/earnings` |
| W32 | Coach feedback | Student, coach, admin | Dashboard prompt, `/coach/feedback`, `/admin/feedback` |
| W33 | Leads, demo booking, automated messages | Visitor, admin | `/`, `/admin/leads`, `/admin/messaging` |
| W34 | Analytics and reporting | Admin | `/admin`, `/admin/analytics/*`, `/admin/reliability` |
| W35 | Board and text appearance | All, admin | `/chess-board`, `/admin/chess-appearance`, `/admin/typography` |
| W36 | Users, trash, backups, retention | Admin, super admin | `/admin/users`, `/admin/trash`, `/admin/backups` |
| W37 | SaaS plan and feature gating | Admin, all | `/admin/subscription`, gated routes |
| W38 | Help centre and knowledge base (`main`) | All, admin | `/help*`, `/admin/knowledge*` |

---

## 10. API integration and application states

### 10.1 Pattern (Existing)

`apiFetch` in `lib/api.ts` (axios) with credentials and a refresh queue, TanStack Query hooks under `features/<x>/hooks`, central `lib/queryKeys.ts`, and routes in `API_ROUTES`. `useServerTable` drives paginated tables.

One deviation: `app/admin/_components/BackupManager.tsx` hard-codes three `/admin/backups` paths, against CLAUDE.md §3.1. This is tech debt to log, not to fix in a UI milestone.

### 10.2 State primitives

| State | Existing tools | Files using |
|---|---|---|
| Route loading | `loading.tsx` at root and in 3 role areas, `PageLoading` | 4 |
| Content loading | `Skeleton` | 124 |
| Spinner | `Loader2` | 46 |
| Hand-rolled pulse | `animate-pulse` outside `Skeleton` | 14 |
| Empty | `EmptyState` (`page`, `inline`) | 65 |
| Error | `WidgetError` | 74 |
| Inline messages | `Alert` | 24 |
| Mutations | `useUndoableMutation`, Sonner toasts through `useToast` | widespread |
| Confirmations | `ConfirmationModal`, `AlertDialog`. No `window.confirm` anywhere | 20 importers |

The tools exist and are widely used, so state design is largely a matter of restyling them. Gaps:

- **`/admin/users` has no `EmptyState` or `WidgetError`** in reachable code, using plain text and toasts instead.
- Six table routes have no empty handling at all in reachable code: four analytics pages (`acquisition`, `classes`, `students`, `users`), `/admin/attendance`, `/admin/subscription`.
- Several attendance pages hand-roll their "No data" and error layouts.
- `SystemState` in the design system has one shape for all four states, which suits replacing `EmptyState` and `WidgetError` visually.

### 10.3 Browser sweep results

**Coverage:** 291 captures of 96 `dev` routes at three widths, signed in as the seeded student, coach and super admin. The remaining 18 `dev` routes need a record or a live room the seed could not reach, or are not user-facing, and each says so in the inventory. Screens on `main` only were not opened.

| Check | Result |
|---|---|
| Page-level horizontal overflow | **None** at any width on any route |
| Elements past the screen edge | Only `/`: 11 on phone, 1 on tablet |
| Routes with tables scrolling sideways | Phone **25 of 26**. Tablet 10. Laptop 0 |
| Controls under 40px at phone width | **872 of 1438 (61%)** on routes with 5 or more controls |
| Most under-40px controls | `/admin/puzzles` 67/71, `/coach/puzzles` 46/61, `/classes/[id]` 45/57, `/admin/batches` 43/49, `/admin/messaging` 39/39, `/admin/chess-appearance` 38/54, `/admin/trash` 29/39, `/admin/analytics` 26/55 |
| Missing or extra `h1` | No `h1` on phone: `/login`, `/register`, `/forgot-password`. At laptop width all three use the hero tagline as the `h1`, not the form title. Two `h1`s at laptop: `/reset-password`, `/verify-email`. None at any width: `/admin/finance/invoices/[id]` |
| Missing `<main>` | `/classes/[id]` |
| Fonts rendered | Nunito Sans body, Outfit headings; Playfair on `/` |
| Console errors with a product cause | One: React reports an unrecognised `<piece>` tag on `/coach/puzzles/[id]/edit` |

The under-40px figure includes `size="sm"` buttons (36px) and table icons (32px), which UI_RULES allows, so it measures density, not a defect count. It still means v2's 36px control size needs the coarse-pointer rule in Decision D10.

Environment failures, not product findings:

- `class_attendance.correctedAt` was missing from the local database, which caused 500s on the student dashboard and attendance endpoints.
- `/admin/backups` failed because object storage was deliberately disabled.
- A few 401s on `/admin/schedule/new` were the access token expiring mid-sweep and refreshing normally.

---

## 11. Housekeeping found on the way

These are not design tasks, but they will affect the project:

- **Docs are out of date:** CLAUDE.md §1 and RESPONSIVE.md §1 say Next.js 14 and React 18; `package.json` has Next 15.5 and React 19.3.
- **Legal pages are drafts:** `LEGAL_DRAFT` shows a visible "not yet in effect" banner on `/privacy` and `/terms`, and marks them `noindex`.
- **Content problems in `dev`:** stock testimonial portraits, reused stat figures with changed meanings, conflicting coach counts [verdict].
- **Seed email in production UI:** `LoginForm.tsx:156` placeholder is `student@nexa.test`.
- **Attempt on load:** `/student/training` calls `POST /puzzles/:id/attempts` as soon as it opens, twice per load in dev mode. A redesign must not change when this fires. Whether the double call also occurs in a production build was not checked.
- **React warning:** an unrecognised `<piece>` tag on `/coach/puzzles/[id]/edit`, from a board rendered inside the puzzle form.
- **Unused shared components:** `UserAvatar`, `PageContainer`, `Separator`, `FormCheckbox`, `Logo`, `EmailVerificationBanner` (commented out). See COMPONENT_INVENTORY.
- **Local environment:** `packages/types/dist` was built from another branch and the Prisma client and local database disagree. Anyone running `dev` locally needs a rebuild and a matching migration state.

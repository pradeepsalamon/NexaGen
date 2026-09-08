# Responsive Design & Device Testing

Single reference for how **Nexa Chess (NexaGen)** behaves across phones, tablets,
laptops and desktops, and the full procedure for testing every screen on every
device.

- Human conventions: [PROJECT_RULES.md](PROJECT_RULES.md)
- Screenshot tool details: [`scripts/responsive/README.md`](../scripts/responsive/README.md)
- Agent rules: [`.agents/AGENTS.md`](../.agents/AGENTS.md), [`CLAUDE.md`](../CLAUDE.md)

---

## 1. Scope

`apps/web` (Next.js 14 App Router) is the only responsive surface. `apps/api` has
no UI. Every route below must render correctly, with **no horizontal page
scroll**, from a 320 px phone to a 3440 px ultrawide, in **both light and dark**
themes, in **portrait and landscape**.

Product decision: the app is **mobile-first for consumption** (dashboards,
schedule, attendance, joining a class, chat) and **desktop-first for authoring**
(the shared teaching board). See §6.9.

---

## 2. Breakpoint system

Tailwind defaults — **no custom `screens`** in
[`apps/web/tailwind.config.ts`](../apps/web/tailwind.config.ts). Mobile-first:
an unprefixed utility applies everywhere, a prefixed one applies at that width
and up.

| Prefix | Min width | Band | Typical use in this app |
|---|---|---|---|
| _(none)_ | 0 | Phone portrait | Single column, stacked, full-bleed cards |
| `sm:` | 640 px | Large phone / phone landscape | Header shows text labels, `PageHeader` goes row |
| `md:` | 768 px | Tablet portrait | **Persistent sidebar appears; mobile drawer hidden.** Shared board mounts |
| `lg:` | 1024 px | Tablet landscape / small laptop | Dashboard multi-column grids (`lg:grid-cols-3`), header Dashboard CTA when `compact` |
| `xl:` | 1280 px | Laptop / desktop | Extra column density where useful |
| `2xl:` | 1536 px | Large desktop | Rarely needed; container max-width already caps content |

**The load-bearing breakpoint is `md` (768 px)** — it flips the whole navigation
model and the shared-board experience.

Content width is capped by container max-widths, not by a `2xl:` breakpoint:

| Container | Max width | Where |
|---|---|---|
| `max-w-7xl` (1280) | Header bar, admin main column | [`Header.tsx`](../apps/web/src/components/layout/Header.tsx), [`app/admin/layout.tsx`](../apps/web/src/app/admin/layout.tsx) |
| `max-w-6xl` (1152) | Coach main column | [`app/coach/layout.tsx`](../apps/web/src/app/coach/layout.tsx) |
| `max-w-5xl` (1024) | Schedule builder | [`ScheduleBuilderClient.tsx`](../apps/web/src/features/batch-schedules/components/ScheduleBuilderClient.tsx) |
| `max-w-[480px]` | Auth forms, LiveKit pre-join | `AuthLayout`, `.custom-prejoin` in `globals.css` |

---

## 3. Supported device matrix

Presets live in [`scripts/responsive/devices.mjs`](../scripts/responsive/devices.mjs).
`{ w, h }` is the **CSS viewport** (portrait unless the key says `-landscape`).

### Phones — portrait
| Key | CSS px | DPR | Notes |
|---|---|---|---|
| `android-small` | 320 × 568 | 2 | **Hard floor.** Everything must fit here |
| `galaxy-s8` | 360 × 740 | 3 | Common Android |
| `iphone-se` | 375 × 667 | 2 | Common small iPhone |
| `iphone-14` | 390 × 844 | 3 | Baseline modern iPhone |
| `pixel-7` | 412 × 915 | 2.625 | Common large Android |
| `iphone-14-pro-max` | 430 × 932 | 3 | Largest phone |

### Phones — landscape
| Key | CSS px | Notes |
|---|---|---|
| `iphone-14-landscape` | 844 × 390 | **Short height** — sticky/fixed bars must not eat the viewport |
| `pixel-7-landscape` | 915 × 412 | crosses `md`: sidebar tries to appear at 768–915 |

### Tablets — portrait (all ≥ `md`, sidebar visible)
| Key | CSS px |
|---|---|
| `ipad-mini` | 768 × 1024 |
| `ipad-air` | 820 × 1180 |
| `ipad-pro-11` | 834 × 1194 |

### Tablets — landscape
| Key | CSS px |
|---|---|
| `ipad-mini-landscape` | 1024 × 768 |
| `ipad-air-landscape` | 1180 × 820 |
| `ipad-pro-landscape` | 1366 × 1024 |

### Laptops
| Key | CSS px | DPR |
|---|---|---|
| `laptop-hd` | 1366 × 768 | 1 |
| `laptop-13` | 1280 × 800 | 2 |
| `laptop-15` | 1440 × 900 | 2 |
| `laptop-16` | 1536 × 960 | 2 |

### Desktops
| Key | CSS px | DPR |
|---|---|---|
| `desktop-1080` | 1920 × 1080 | 1 |
| `desktop-1440` | 2560 × 1440 | 1 |
| `desktop-ultrawide` | 3440 × 1440 | 1 |

### Categories (pass to `--devices`)
`mobile`, `mobile-landscape`, `tablet`, `tablet-landscape`, `laptop`, `desktop`,
`all` (every preset), `quick` (one per band + edge phones — the default).

`quick` = `android-small, iphone-14, iphone-14-pro-max, iphone-14-landscape,
ipad-mini, ipad-air-landscape, laptop-13, laptop-15, desktop-1080`.

---

## 4. Global layout architecture

```
┌───────────────────────────────────────────────┐
│ Header  fixed inset-x-0 top-0 z-40 h-16        │  ← always fixed, 64 px
├──────────┬────────────────────────────────────┤
│ Rail     │  main                              │
│ w-[4.75  │  p-4 → md:p-6 → lg:p-8             │
│  rem]    │  pb-24 on mobile (clears the FAB)  │
│ hidden   │  mx-auto max-w-6xl / 7xl           │
│ md:block │  overflow-x-hidden  min-w-0        │
│  (fixed; │                                    │
│  expands │                                    │
│  to w-60 │                                    │
│  as an   │                                    │
│  overlay)│                                    │
└──────────┴────────────────────────────────────┘
       └─ MobileNavDrawer: FAB bottom-right, md:hidden,
          Radix Dialog sliding sheet (w-[280px] max-w-[85vw])
```

Key files:

| Concern | File | Behaviour |
|---|---|---|
| App wrapper | [`AppShell.tsx`](../apps/web/src/components/layout/AppShell.tsx) | Renders children + `<MobileNavDrawer/>` |
| Top bar | [`Header.tsx`](../apps/web/src/components/layout/Header.tsx) | `fixed h-16`; 3-col grid `minmax(0,1fr) auto minmax(0,1fr)`; title `truncate max-w-[42vw] sm:max-w-none`; `compact` prop hides Dashboard CTA / bell / theme toggle on small screens for immersive pages |
| Sidebar shell | [`Sidebar.tsx`](../apps/web/src/components/layout/Sidebar.tsx) | Shared `SidebarContainer` — layout reserves only the `w-[4.75rem]` rail; the panel is `fixed top-16 z-30` and expands to `w-60` as an **overlay** above the content (click-outside / Escape collapses it). Plus `SidebarToggle`, `SidebarLink` (icon-only + tooltip when collapsed), `SidebarGroupBox` (admin boxed group: inline nested panel expanded, flyout `Popover` when collapsed). Rail defaults collapsed; pinned choice in `localStorage` `nexa-sidebar-collapsed` via [`useSidebarCollapse.ts`](../apps/web/src/components/layout/useSidebarCollapse.ts) |
| Admin sidebar | [`AdminSidebar.tsx`](../apps/web/src/components/layout/AdminSidebar.tsx) | `hidden md:block`; **collapsible overlay rail** + **boxed collapsible groups** (Analytics / Manage / Super Admin) with per-group icons, open state in `localStorage` `nexa-admin-nav-open-groups`, active group auto-expands |
| Coach sidebar | [`CoachSidebar.tsx`](../apps/web/src/components/layout/CoachSidebar.tsx) | `hidden md:block`, flat list, collapsible rail |
| Student sidebar | [`StudentSidebar.tsx`](../apps/web/src/components/layout/StudentSidebar.tsx) | `hidden md:block`, flat list, collapsible rail |
| Mobile nav | [`MobileNavDrawer.tsx`](../apps/web/src/components/layout/MobileNavDrawer.tsx) | `md:hidden` FAB → right-side sheet; **admin gets the same boxed collapsible groups**, coach/student flat; closes on route change |
| Page heading | [`PageHeader.tsx`](../apps/web/src/components/layout/PageHeader.tsx) | `flex-col gap-4 sm:flex-row sm:items-center sm:justify-between` — title stacks above actions on phone |

Because `Header` is `fixed`, every routed layout offsets content by 64 px
(`min-h-[calc(100vh-64px)]`, or `pt-16` on the immersive meeting screens).

---

## 5. Responsive building blocks

Reuse these — do not hand-roll responsive behaviour that a primitive already
solves.

| Primitive | File | Responsive contract |
|---|---|---|
| `Table` / `DataTable` | [`ui/Table.tsx`](../apps/web/src/components/ui/Table.tsx), [`ui/DataTable.tsx`](../apps/web/src/components/ui/DataTable.tsx) | Table is wrapped in `div.w-full.overflow-auto` — **wide tables scroll inside their own box, never the page**. Keep them in that wrapper |
| `Dialog` | [`ui/Dialog.tsx`](../apps/web/src/components/ui/Dialog.tsx) | Centered modal; content should carry `max-h-[90vh] overflow-y-auto` and `sm:max-w-[…]` (full-bleed with margin on phone) |
| `DatePicker` | [`ui/DatePicker.tsx`](../apps/web/src/components/ui/DatePicker.tsx) | Opens a `Dialog` (not a popover) so the calendar never clips on small screens; pass `className="w-full"` inside grids |
| `TimePicker` | [`ui/TimePicker.tsx`](../apps/web/src/components/ui/TimePicker.tsx) | `Popover` with hour/minute/AM-PM selects, `min-h-11` trigger |
| `Popover` / `DropdownMenu` | [`ui/Popover.tsx`](../apps/web/src/components/ui/Popover.tsx) | `collisionPadding={16}`, portalled; fine on tablet+; prefer `Dialog` when the panel is large or the anchor is near a screen edge on phones |
| `Tabs` | [`ui/Tabs.tsx`](../apps/web/src/components/ui/Tabs.tsx) | Tab strip should be `overflow-x-auto` when it can exceed the width |
| Buttons | [`ui/Button.tsx`](../apps/web/src/components/ui/Button.tsx) | `min-h-11` (44 px touch target) at default size; `size="sm"` = `min-h-9`; table-action buttons are `size-8 rounded-full` icon buttons |

Design tokens (theme-aware, defined in
[`styles/globals.css`](../apps/web/src/styles/globals.css)): `bg-app-surface`,
`bg-app-background`, `text-app-text`, `text-app-muted`, `border-app-border`,
`bg-primary`, `bg-secondary`, `rounded-app|control|panel`, `shadow-card|soft`.
Dark mode is the `[data-theme="dark"]` selector (not `prefers-color-scheme`);
theme is persisted in `localStorage` (`nexa-chess-theme`).

---

## 6. Area-by-area responsive spec

### 6.1 Auth (`/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`)
- `AuthLayout` centers a `max-w-[480px]` card; single column at every size.
- No sidebar, no drawer. Header shows Login CTA (icon only < `sm`).
- Verify: 320 px — card has side margin, inputs `min-h-11`, no field clipped.

### 6.2 Dashboards (`/student`, `/coach`, `/admin`)
- Card grids: `grid-cols-1` → `lg:grid-cols-2` / `lg:grid-cols-3` (hero + rail),
  KPI rows `grid-cols-2 lg:grid-cols-4`.
- Vertical rhythm `space-y-6 md:space-y-8`, `pb-10` (clear the mobile FAB).
- Verify: phone = one column, KPIs 2-up; laptop = full multi-column.

### 6.3 List / management pages with tables
(`/admin/users`, `/admin/batches`, `/admin/assignments`, `/admin/attendance*`,
`/coach/students`, `/coach/history`, `/admin/coaches`, `/admin/demo-classes`,
`/admin/classes`, `/admin/trash`)
- `PageHeader` stacks on phone; primary action is full-width or icon there.
- Table body scrolls **horizontally inside its wrapper** on phone/tablet.
- Toolbar (search + filters + column toggle) wraps: `flex flex-wrap gap-2`.
- Pagination controls wrap; never overflow.
- Verify: 320 px — page itself does not scroll sideways; the table does.

### 6.4 Forms & dialogs
(batch create/edit, assignment dialogs, schedule class dialog, profile)
- Field grids `grid-cols-1 sm:grid-cols-2`; label + control stacked.
- Dialog: `max-h-[90vh] overflow-y-auto`, `sm:max-w-[600px]`, full-bleed-ish on
  phone.
- Native `<input type="date|time">` is **banned** — use `DatePicker` /
  `TimePicker` (they were the "can't edit on mobile" bug).

### 6.5 Schedule builder (`/admin/schedule/new`, `/admin/schedule/[id]`)
- `max-w-5xl` card; top grid `grid gap-4 sm:grid-cols-2` (Batch, Title, Timezone,
  then a stacked Start date / Ends control).
- Weekly-rule row: `grid-cols-1` on phone →
  `sm:grid-cols-[1.2fr_1fr_1fr_1.6fr_auto]` on `sm+`; each field labelled so the
  stacked phone view is readable.
- "Ends" = **By date** (`DatePicker`) or **By count** (number → computed end date
  shown as a hint).
- Delete-rule button: `size-8 rounded-full` danger icon, centered in its column
  on `sm+`.
- Preview panel: stat grid `grid-cols-2 sm:grid-cols-4`, occurrence list
  `max-h-72 overflow-y-auto`.

### 6.6 Analytics (`/admin/analytics/*`)
- Recharts containers must be width-100% / `ResponsiveContainer`; fixed pixel
  heights are fine.
- KPI card rows `grid-cols-2 → lg:grid-cols-4`; section cards `grid-cols-1
  lg:grid-cols-2`.
- Date-range picker: `DateRangePicker` (Dialog-based) — check it opens without
  clipping on phone.
- Wide data tables (coach leaderboard etc.) use the same `overflow-auto` wrapper.
- Verify all on `mobile` + `tablet` + `desktop-1440`.

### 6.7 Attendance
- Report tables horizontal-scroll on phone.
- Policy editor (`/admin/attendance/policy`) is a stacked form.
- Student/coach attendance views: summary cards stack, history list is vertical.

### 6.8 Live class meeting (`/live-class/[roomId]`)
- [`MeetingLayout.tsx`](../apps/web/src/features/live-class/components/meeting/MeetingLayout.tsx):
  `h-[100dvh] flex flex-col overflow-hidden pt-14` — uses **`dvh`**, not `vh`, so
  mobile browser chrome doesn't crop the toolbar.
- `MeetingTopBar` (not the global `Header`): a trimmed classroom bar via
  [`ClassroomTopBar.tsx`](../apps/web/src/features/live-class/components/meeting/ClassroomTopBar.tsx)
  — Logo + class title + LIVE/REC + connection pill + timer + Leave. `h-14`, fixed.
  The same bar (no live widgets) fronts the pre-join / error screens through
  [`ClassroomStateShell.tsx`](../apps/web/src/features/live-class/components/states/ClassroomStateShell.tsx).
- Video grid: column math in
  [`videoGrid.utils.ts`](../apps/web/src/features/live-class/components/meeting/video-grid/videoGrid.utils.ts);
  tiles keep `aspect-video`, grid reflows by count and viewport.
- `MeetingSidebar` (chat / people / settings): **full-screen drawer on
  mobile**, docked `w-[360px]` panel on desktop. Panels share `PanelHeader`.
- `MeetingToolbar`: floating, centered, **single row (never wraps)** — ~6 primary
  controls + a `More` popover for the rest, at every width. Must stay above the
  `dvh` bottom edge in phone landscape (`iphone-14-landscape` is the stress case).
- Layer order is centralised in
  [`lib/meetingUi.ts`](../apps/web/src/features/live-class/lib/meetingUi.ts) (`Z`).
- Pre-join card: class-info column + `.custom-prejoin` device preview, two-column
  `md+`, stacked below.
- Verify: `mobile`, `mobile-landscape`, `tablet`, `laptop-15` — with
  `--live-class <roomId>`.

### 6.9 Shared teaching board (`/live-class/[roomId]/board`)
- **Desktop/tablet only.** `useIsBoardViewport()` gates on
  `matchMedia("(min-width: 768px)")`.
- `< 768 px`: renders a "open on a laptop/desktop" notice + "Back to Live Class"
  — the LiveKit room is **not** mounted (saves a connection).
- `≥ 768 px`: `BoardWorkspace` (chessground + engine/notation panels) fills
  `h-[100dvh]`.
- `isDesktop === null` (pre-measure) renders the loader = same as SSR, no
  hydration mismatch.
- Verify: `ipad-mini` (768, boundary), `laptop-13`, `desktop-1080`; and one phone
  to confirm the notice.

### 6.10 Chessboard component (`features/chessboard`)
- Board is a square that scales to its container; side panels collapse/stack
  under the board on narrow containers.
- Inside the meeting, students get a responsive inline board **tile** and a
  full-screen view; they never load `BoardWorkspace`.

---

## 7. Non-negotiable responsive rules

1. **No horizontal scroll on `<body>` / the routed page** at any width ≥ 320 px.
   The `shots` tool fails the run if it detects page overflow.
2. **Wide content scrolls in its own container** — tables, code blocks, wide
   diagrams, tab strips get `overflow-x-auto` on a wrapper with `min-w-0`.
3. **`min-w-0` on flex/grid children** that contain text or tables, so they can
   shrink instead of pushing the layout wide. (`main` already has it.)
4. **Touch targets ≥ 44 px** on interactive controls (`min-h-11`); `size="sm"`
   (36 px) only for dense desktop toolbars.
5. **Use `dvh`, not `vh`**, for full-height immersive screens (meeting, board).
6. **Images**: `max-w-full` (global reset covers `img`); avatars/thumbs fixed
   size with `shrink-0`.
7. **Never `title=`** for tooltips on interactive elements — `SimpleTooltip` +
   `aria-label` (native `title` is unusable on touch).
8. **Modals**: `max-h-[90vh] overflow-y-auto`; pickers that can be tall use
   `Dialog`, not `Popover`, so they don't clip on phones.
9. **Both themes, always** — verify light and dark; colours come from tokens.
10. **Landscape phones** (short height) must not trap content behind fixed bars.
11. Test at the **`md` boundary (768/820/915 px)** — sidebar appears here and is
    the most common regression point.

---

## 8. Device testing — the `shots` tool

Drives real headless Chromium over **devices × routes × theme**, writes PNGs +
`results.json` + an `index.html` gallery, and **exits non-zero on horizontal
overflow or page error**.

### One-time setup
```bash
npx playwright install chromium
```

### Prereqs per run
- `npm run dev` (web on :3000). Authed routes and `--live-class` also need `api`
  (+ postgres/redis; livekit for a real meeting).
- Seeded logins (password `Test@12345`): `superadmin@nexa.test`,
  `coach@nexa.test`, `student@nexa.test` — run `npm run db:seed` if missing.
- **Git Bash:** pass routes **without** a leading `/` (or use `--url`, or
  `MSYS_NO_PATHCONV=1`).

### Flags
| Flag | Meaning |
|---|---|
| `--path <route>` / `--paths <a,b,c>` | routes to capture |
| `--url <abs>` | absolute URL (repeatable) |
| `--devices <list>` | `quick` (default) · `all` · category · device · comma mix |
| `--login <role>` | `admin` · `coach` · `student` |
| `--live-class <id>` | capture `/live-class/<id>`, auto-login + click Join |
| `--theme <mode>` | `light` (default) · `dark` · `both` |
| `--full-page` | whole scroll height, not just the viewport |
| `--dpr <n>` | force devicePixelRatio (`1` = smaller PNGs) |
| `--wait <ms>` | settle time per page (default 2000) |
| `--out <dir>` | output dir |

Output: `scripts/responsive/shots/<timestamp>/` (git-ignored). Open `index.html`
— overflow shots are outlined amber.

---

## 9. Full test matrix

### 9.1 Public / auth (no login)
```bash
npm run shots -- --paths login,register,forgot-password --devices all --theme both
```

### 9.2 Student
```bash
npm run shots -- --login student --theme both --devices all \
  --paths student,student/courses,student/batches,student/live-classes,student/schedule,student/practice,student/progress,student/attendance,profile
```

### 9.3 Coach
```bash
npm run shots -- --login coach --theme both --devices all \
  --paths coach,coach/batches,coach/schedule,coach/assignments,coach/students,coach/history,coach/attendance
```

### 9.4 Admin / Super Admin
```bash
npm run shots -- --login admin --theme both --devices all \
  --paths admin,admin/analytics/users,admin/analytics/acquisition,admin/analytics/coaches,admin/analytics/classes,admin/analytics/attendance,admin/analytics/batches,admin/analytics/recordings,admin/analytics/engagement,admin/analytics/operations,admin/batches,admin/schedule,admin/schedule/new,admin/assignments,admin/users,admin/attendance,admin/attendance/policy,admin/coaches,admin/demo-classes,admin/classes,admin/trash,admin/backups
```

### 9.5 Live class + shared board
```bash
# meeting UI
npm run shots -- --live-class <roomId> --login student --theme both \
  --devices mobile,mobile-landscape,tablet,laptop-15

npm run shots -- --live-class <roomId> --login coach \
  --devices iphone-14,ipad-air,laptop-15,desktop-1080

# shared board (desktop-only gate + the phone notice)
npm run shots -- --path live-class/<roomId>/board --login coach \
  --devices iphone-14,ipad-mini,laptop-13,desktop-1080
```

### 9.6 Fast pre-PR sweep (what to run on any UI change)
```bash
npm run shots -- --login admin --devices all --theme both --paths <routes-you-touched>
npm run shots -- --login coach   --devices quick --paths <routes-you-touched>
npm run shots -- --login student --devices quick --paths <routes-you-touched>
```
A green (exit 0) run = no overflow and no page errored. Still **open
`index.html`** and eyeball the amber-free gallery.

---

## 10. Per-device manual checklist

Run against `index.html` (or a real device / DevTools device mode).

### Every device
- [ ] No horizontal page scroll; only intended inner containers scroll sideways.
- [ ] Header fixed, 64 px, content starts below it (nothing hidden under it).
- [ ] Light **and** dark: text contrast OK, no token missing (unstyled white/black).
- [ ] Images/avatars not stretched; no broken aspect ratios.
- [ ] Focus rings visible on keyboard tab.

### Phone portrait (320–430)
- [ ] `android-small` (320): nothing clipped, buttons not cut off.
- [ ] Sidebar hidden; FAB visible bottom-right; drawer opens, closes on nav,
      `max-w-[85vw]`.
- [ ] `PageHeader` stacked; primary action reachable (full-width / icon).
- [ ] Tables scroll inside their box; page does not.
- [ ] Dialogs: `≤ 90vh`, internal scroll, close button reachable.
- [ ] `DatePicker` / `TimePicker` open and are fully on-screen.
- [ ] Bottom content not hidden behind the FAB (`pb-24`).

### Phone landscape (`iphone-14-landscape` 844×390)
- [ ] Fixed header + any floating toolbar leave enough usable height.
- [ ] Meeting toolbar stays above the bottom edge; video grid still usable.
- [ ] Width 844 > `md`: confirm the persistent sidebar appearing here still looks
      intentional (this is a known edge — 768–1023 px width on a short screen).

### Tablet portrait (768–834)
- [ ] Sidebar now persistent; no FAB.
- [ ] Dashboard grids: 1–2 columns (not yet full `lg` density).
- [ ] Shared board mounts at exactly 768.

### Tablet landscape / small laptop (1024–1279)
- [ ] `lg:` grids at full column count.
- [ ] Analytics charts fill width, legends not clipped.

### Laptop / desktop (1280–3440)
- [ ] Content capped at container max-width, centered, not stretched edge-to-edge.
- [ ] Ultrawide (3440): no absurd line lengths; sidebar + centered column look OK.

---

## 11. Automated / CI checks

| Check | Command | Gate |
|---|---|---|
| Type safety (RSC/client boundary) | `npm run build -w apps/web` | must pass for web changes |
| Lint | `npm run lint -w apps/web` | no new warnings |
| Typecheck | `npm run typecheck -w apps/web` | must pass |
| Overflow / render sweep | `npm run shots -- …` | **exit 0** = no overflow, no errored page |
| E2E user flow | `npx playwright test` (`e2e/attendance-flow.spec.ts`) | not in `npm test`; run for flow changes |

The pre-commit hook (`.husky/pre-commit`) runs `typecheck` + `lint` only. The
`shots` sweep is **not** in CI — it is a required manual step for UI/layout PRs
(CLAUDE.md §2).

There are currently **no web unit tests**; responsive correctness is covered by
`shots` + manual review + Playwright flows.

---

## 12. Definition of done for a UI change

1. `typecheck`, `lint` pass; `build -w apps/web` passes if RSC/client boundaries
   were touched.
2. `shots` run for **every affected route** across `--devices all --theme both`
   for the primary role, `quick` for the others — **exit 0**.
3. `index.html` visually reviewed: no amber (overflow) tiles, no clipped content,
   both themes correct, portrait + landscape correct.
4. `md`-boundary widths (768 / 820 / 915) checked specifically.
5. Touch targets ≥ 44 px on new interactive controls.
6. If behaviour/commands/setup changed, the relevant doc is updated in the **same
   PR** (project rule).

---

## 13. Common failure patterns → fix

| Symptom | Cause | Fix |
|---|---|---|
| Whole page scrolls sideways on phone | A child wider than the viewport (long text, table, `w-[900px]`, negative margin) | Add `min-w-0` to the flex/grid child; wrap wide content in `overflow-x-auto`; use `max-w-full` |
| Table pushes layout wide | Table not in the `overflow-auto` wrapper, or wrapper's parent lacks `min-w-0` | Keep `DataTable`/`Table` as-is; ensure ancestor chain has `min-w-0` |
| Calendar / dropdown clipped at screen edge on phone | `Popover` near the viewport edge | Use `DatePicker` (Dialog-based) or raise `collisionPadding` |
| Content hidden under the fixed header | Missing top offset | `min-h-[calc(100vh-64px)]` container or `pt-16` |
| Meeting toolbar cut off in phone landscape | `vh` instead of `dvh`, or toolbar not accounting for safe area | Use `h-[100dvh]`; keep toolbar `bottom`-anchored with padding |
| Sidebar appears on a wide phone landscape (844 px) | `md:` triggers at 768 regardless of height | Accept, or gate nav on `md:` + a height check only where it actually breaks |
| Hydration mismatch on a viewport-gated screen | Reading `window`/`matchMedia` during render | Start from `null` (= SSR output), measure in `useEffect` (see the shared-board page) |
| Dark mode shows unstyled colours | Hard-coded `bg-white` / `text-black` instead of tokens | Use `bg-app-surface`, `text-app-text`, etc. |
| Tap does nothing / tooltip never shows on touch | `title=` attribute used for a tooltip | `SimpleTooltip` + `aria-label` |

---

_Last reviewed: 2026-08-31._

# NexaChess component inventory

Shared components to standardise against **NexaChess Design System v2**. Audit date: 2026-11-01, on `dev` (`10f307b8`), with `main` differences noted.

- **Importers** counts files that import the component directly.
- **Routes** counts the 114 `dev` routes that can reach it through their imports.
- **DS target** names the v2 component. "No DS spec" means v2 has nothing for it, so the design must be extended. Those entries are listed in §7.
- **Priority:** P0 is needed before any screen work, P1 is used by most screens, P2 is local.

Nothing in this document has been built.

---

## 1. How to apply the design system

**Keep the existing React primitives and change what they render.** Do not import `nc-*` classes into the app.

- About 261 files import `Button` and every one gets the new look from one file.
- `Button`, `Badge`, and the others already use CVA and tokens.
- A parallel `nc-*` layer would create a third styling system beside `app-*` and `nx-*`.

The v2 `bundle.css` is the visual specification, and its values get ported into these components.

### Token migration map

Order matters. **`accent` must be renamed before gold takes that name**, or every success state turns gold.

| Current token (uses on `dev`) | Current meaning | v2 token | Notes |
|---|---|---|---|
| `primary` (760), `on-primary` (145) | Navy action; gold in dark | `primary`, `on-primary` | Value change. Review chrome uses, which become `brand-800` |
| `primary-ink` (279) | Coloured text on surfaces | `primary` as text, or `primary-ink` on `primary-soft` | |
| `accent` (101), `accent-ink` (38) | **Green: success, active** | `success` | **Semantic rename first** |
| `secondary` (115), `secondary-ink` (31) | Gold: attention, practice | `accent`, `accent-ink`, or `warning` where it means a status | Needs a per-use review: v2 forbids gold as status |
| `warm` (17), `warm-ink` (6) | Coral: courses, recordings | **None** | Decision D7 |
| `success`, `warning`, `info` | Status | Same names | v2 adds `-soft` backgrounds |
| `app-danger` (335) | Destructive and LIVE | `danger`, `danger-fill` | Split text and fill |
| `app-background` | Page | `surface` `#F8FAFC` | Currently `#FFF` on `dev` |
| `app-surface` | Card | `surface-raised` | |
| `app-soft` | Soft fill | `surface-sunken` | |
| `app-border` | Divider | `line` | |
| *(input border)* | | `line-strong` | **Fails 3:1 as specified: fix in the DS first** |
| `app-text`, `app-muted` | Text | `ink`, `ink-muted` | Text moves from navy to near-black |
| `app-focus` | Focus | `focus-ring` | Blue, not gold |
| `rounded-control` 12, `rounded-app` 20, `rounded-panel` 24 | | `radius-md` 8, `radius-lg` 12, `radius-xl` 16 | Change variable values |
| `shadow-card`, `shadow-lift`, `shadow-soft` | | `shadow-sm`, `shadow-md`, `shadow-lg` | Also change values |
| All `nx-*` (375) | Redesign roles | Equivalents above | Delete at the end |

Keep channel triplets: colours must stay `--rgb-*` values because Tailwind alpha modifiers silently vanish on a bare `var()`.

---

## 2. Foundation primitives

| Component | Importers | Routes | DS target | Change needed | Priority |
|---|---|---|---|---|---|
| `ui/Button` | 261 | 104 | Button | Pill → 8px; 44px → 36px with 44px on coarse pointers; weight bold → 500; variants below | P0 |
| `ui/Badge` | 110 | 72 | Badge | Tints to `-soft` + ink; add `accent` and `live` variants | P0 |
| `ui/Card` | 127 | 77 | Card | 20px → 12px; `line` border; `shadow-sm` | P0 |
| `ui/Input` | 86 | 60 | TextField | Through `fieldClasses` | P0 |
| `ui/Select` | 78 | 63 | TextField | Through `fieldClasses` | P0 |
| `ui/Textarea` | 44 | 39 | TextField | Through `fieldClasses` | P0 |
| `ui/fieldStyles` | 6 | | TextField | **One edit reskins every field**: white fill, `line-strong`, blue focus halo. Absent on `main` | P0 |
| `ui/PasswordInput` | 5 | 4 | TextField | Through `fieldClasses` | P1 |
| `ui/Combobox` | 1 | 1 | No DS spec | 361 lines for one consumer; check whether it earns its place | P2 |
| `ui/Checkbox` | 28 | 28 | Choice | Blue checked state; 18px, 6px radius | P0 |
| `ui/Switch` | 33 | 25 | Choice | Blue on; 40×22 | P0 |
| `ui/Label` | 38 | 46 | TextField | `nc-label` type | P0 |
| `ui/FormField` | 26 | 26 | TextField | Error text uses `danger` | P0 |
| `ui/Tabs` | 25 | 24 | Navigation | Blue active on sunken track, add overflow behaviour | P0 |
| `ui/Tooltip` | 114 | 76 | No DS spec | Inverted surface tokens | P1 |
| `ui/Skeleton` | 127 | 87 | SystemState | `surface-sunken`; replace 14 hand-rolled pulses | P1 |
| `ui/Separator` | **0** | 0 | | Unused: use or remove after confirming | P2 |

### Button variant mapping

| Current | v2 | Migration note |
|---|---|---|
| `primary` | `nc-btn-primary` | Blue |
| `secondary` (gold, black text) | `nc-btn-secondary` | Gold with `on-accent`. **Audit each use**: v2 reserves it for secondary CTAs and reward |
| `outline` (primary ink, thick bottom edge) | `nc-btn-outline` or `nc-btn-neutral` | v2 separates these. UI_RULES' Cancel pairs become `neutral` |
| `ghost` | `nc-btn-ghost` | Blue text in v2, ink today |
| `destructive` | `nc-btn-danger` | Add `danger-soft` variant |
| — | `nc-btn-neutral` | **New.** Toolbars, row actions, cancels |
| `.nx-cta` class (7 files) | `nc-btn-primary` | Remove the class |

---

## 3. Data display

| Component | Importers | Routes | DS target | Change needed | Priority |
|---|---|---|---|---|---|
| `ui/Table` | 41 | 48 | DataTable | Sunken header, left-aligned text, hover in `primary-soft`, right-aligned numbers | P0 |
| `ui/DataTable` | 8 | 8 | DataTable | Same. Make `stackOnMobile` the norm for tables with actions | P0 |
| `ui/DataTablePagination` | 8 | 8 | Navigation pages | `nc-pages` | P1 |
| `ui/DataTableSortButton` | 36 | 38 | DataTable | Muted 12px | P1 |
| `ui/DataTableToolbar` | 5 | 5 | No DS spec | Filter row layout | P1 |
| `ui/RowActions` | 5 | 8 | Menu + DataTable | Filled circles → neutral icon buttons; destructive last. `warning` tone is gold today, which v2 forbids | P0 |
| `ui/ScrollShadow` | 1 | 48 | No DS spec | Keep; retune colours | P2 |
| `ui/SectionCard` | 20 | 20 | Card | Tone icons are not in v2. Keep structure, neutralise the ring | P1 |
| `ui/StatTile` | 13 | 13 | Card stat | One KPI component | P1 |
| `ui/KpiCard` + `KpiCardRow` | 10, 11 | 11, 12 | Card stat | Merge visually with `StatTile` (see §6) | P1 |
| `ui/EmptyState` | 65 | 53 | SystemState | `nc-state` look; keep `page` and `inline` | P0 |
| `ui/WidgetError` | 74 | 63 | SystemState | Same family; must keep Retry | P0 |
| `ui/Alert` | 24 | 72 | SystemState | `-soft` backgrounds | P1 |
| `ui/ClassStatusBadge` + `Legend` | 10, 3 | 7, 3 | Badge | Use `live`, `info`, `success`, `danger` tones | P1 |
| `common/UserAvatar` | **0** | 0 | Avatar | Unused while avatars are hand-built in several places. **Adopt this one** | P1 |
| `charts/ChartContainer` + `Charts` | 11 | 12 | No DS spec | Empty and error states; keep as host | P1 |
| `charts/useChartColors` | 2 | | No DS spec | Reads computed tokens and has hard-coded fallbacks that must change with the palette | P1 |

---

## 4. Overlays and feedback

| Component | Importers | Routes | DS target | Change needed | Priority |
|---|---|---|---|---|---|
| `ui/Dialog` | 63 | 44 | Modal | 16px radius, `shadow-lg`, navy scrim | P0 |
| `ui/AlertDialog` | 12 | 15 | Modal | Same | P0 |
| `common/ConfirmationModal` | 8 | 8 | Modal | Title asks, body says consequence, action names the verb. Copy review needed | P0 |
| `common/BulkResultDialog` | 3 | 4 | Modal | Same frame | P2 |
| `ui/DropdownMenu` | 13 | 27 | Menu | Destructive last with separator | P1 |
| `ui/Popover` | 15 | 21 | Menu surface | `shadow-md`, `radius-lg` | P1 |
| `ui/FilterPopover` | 1 | 1 | No DS spec | Generalise for the filter-heavy screens | P1 |
| `ui/BulkActionsBar` | 3 | 4 | No DS spec | Floating bar styling | P2 |
| `ui/Toaster` | 1 | global | No DS spec | Sonner theme. Live-room toast colours in `lib/meetingToasts.ts` | P1 |

---

## 5. Date and time, forms, layout

| Component | Importers | Routes | DS target | Change needed | Priority |
|---|---|---|---|---|---|
| `ui/DatePicker` | 21 | 25 | No DS spec | 301 lines, opens a dialog by design | P1 |
| `ui/DateRangePicker` | 2 | 13 | No DS spec | Same family | P1 |
| `ui/TimePicker` | 3 | 3 | No DS spec | Same family | P2 |
| `ui/Calendar` | 2 | 35 | No DS spec | Selected state in blue | P1 |
| `forms/Form`, `FormInput`, `FormSelect` | 4, 4, 3 | 5, 5, 3 | TextField | Wrappers | P1 |
| `forms/FormCheckbox` | **0** | 0 | Choice | Unused | P2 |
| `layout/Header` | 4 | global | No DS spec | Navy or white per D2 | P0 |
| `layout/Sidebar` (`NavDrawer`) | 3 | 6 + | Sidebar | 503 lines. Navy `brand-900`, gold inset bar; keep drawer behaviour per D2 | P0 |
| `layout/AdminSidebar`, `CoachSidebar`, `StudentSidebar`, `RoleSidebar` | 1 each | | Sidebar | Styling flows from `Sidebar`. `StudentSidebar` has live badges to keep | P0 |
| `layout/navItems` | 4 | | | **Source of role and plan visibility. Do not move logic** | P0 |
| `layout/UserNavMenu` | 1 | | Avatar + Menu | | P1 |
| `layout/PageHeader` | 18 | 19 | No DS spec | Only 19 of `dev`'s 110 rendered routes reach it; many hand-write the header. Adopt widely, add breadcrumb slot | P0 |
| `layout/FormPageShell` | 2 | 5 | No DS spec | Form page pattern | P1 |
| `layout/PageLoading` | 3 | 3 role layouts | SystemState | | P1 |
| `layout/SuperAdminOnly` | 1 | | | UI affordance only. Keep | P2 |
| `layout/EmailVerificationBanner` | **0** | 0 | | Commented out in `AppProviders`. Owner decision | P2 |
| `ui/BackButton` | 4 | 3 | Navigation crumbs | Replace with breadcrumbs on detail pages | P1 |
| `ThemeToggle` | 1 | global | No DS spec | Gold active state changes | P1 |
| `Logo` | **0** | 0 | | Unused; header has its own image code. Consolidate | P1 |
| `PageContainer` | **0** | 0 | | Unused | P2 |
| `icons/BrandIcons` | 1 | | | Absent on `main`; check the merge | P2 |

---

## 6. Duplicates to consolidate

These are the places where one component would replace several. They are the highest-value standardisation work after the primitives.

| Pattern | Today | Proposed |
|---|---|---|
| **KPI tile** | `StatTile`, `KpiCard`, `ProgressOverview` tiles, `ClassSummaryCards`, hand-rolled attendance tiles | One `StatCard` following `nc-stat` |
| **Status badges** | `AttendanceStatusBadge`, `BatchStatusBadge`, `BatchTypeBadge`, `ClassRequestStatusBadge`, `InvoiceBadges`, `PayrollBadges`, `assignmentBadges`, `ClassStatusBadge` | Keep the domain mapping (enum → tone and label), render through one `Badge` |
| **Hand-rolled chips** | 23 `rounded-full px-… text-xs` spans in feature code | `Badge` |
| **Calendar view** | `StudentScheduleClient` (522 lines), `CoachScheduleCalendar`, schedule detail calendar | One `ScheduleCalendar` |
| **Class row or card** | `ClassCard`, `NextClassCard`, `UpcomingClasses`, `PastClasses`, student live-class list | One `ClassRow` driven by `class-availability.ts` |
| **Attendance screens** | Page-level clients in `app/admin/attendance/**`, `/coach/attendance`, `/student/attendance` | One attendance template, moved out of `app/` |
| **Filter rows** | `AnalyticsFilters`, `ActivityFiltersBar`, `DataTableToolbar`, ad hoc rows | One `FilterBar` |
| **Preset cards** | `/coach/presets`, `/admin/live-class` | One component (already mostly shared) |
| **Settings forms** | Appearance, typography, scoring, policy, retention | One `SettingsSection` layout |
| **Avatars** | `UserAvatar` unused; `ParticipantAvatar` in the room; profile uploader | One `Avatar` per v2, room variant on top |
| **Empty chat states** | `ChatEmptyState`, `EmptyMeetingState` | `EmptyState` |
| **Board frames** | Practice, puzzle solver, analysis, game viewer, room | One `BoardFrame` around existing board components |
| **Logo and header image** | Header's inline images, `Logo` unused, academy's own | One `Logo` |

---

## 7. Gaps in design system v2

The v2 system covers 14 components. These things are used in the app but have no specification. **Before they are built, each needs a design decision, because Patterns is missing from v2 (Decision D4).**

**Components:** tooltip, toast, skeleton detail, popover, date picker, date range picker, time picker, calendar, combobox, file upload, pagination with page-size control, sort indicators, sticky action bar, bulk-action bar, filter bar, scroll overflow shadow, notification list, stepper, tab overflow, chart styling and palette, progress ring, empty chart, QR panel.

**Chess:** board frame with annotations and arrows, promotion picker, position editor and spare pieces, move tree with variations, engine evaluation line and bar, chess clock, captured pieces, board theme picker, drawing toolbar. v2 specifies a board, a move list and playback controls only.

**Live class:** v2 specifies a tile, a controls row and a chat. Everything else needs design:

- pre-join card, connection chip, recording indicator, top bar timer
- stage switch, tab panel with up to 9 tabs, resizers
- people list with moderation actions, waiting room list, pull roster
- hand-raise states, reactions, private chat threads
- leaderboard, puzzle tile, live boards grid
- simul and match boards, clocks, adjudication
- move poll, activity queue, 14 interactive tools, PiP mini player

**Patterns (pages):** dashboard, list and table, detail, form page, settings, analytics, finance, auth, reading, and conversation. The roadmap names these patterns, and they should be added to the design system at milestone 1.

---

## 8. Chess and live-class components to keep stable

These are domain components, listed so that nobody restyles them as generic UI. Change their tokens and frames, not their structure.

| Component | Importers | Note |
|---|---|---|
| `chessboard/board/PracticeBoard` | 21, across 6 features | Includes `PRACTICE_BOARD_GRID` layout contract |
| `chessboard/context/BoardProvider` | 36 | Not visual; do not disturb |
| `chessboard/board/ChessgroundBoard` | 4 | Chessground; `touch-action: none` |
| `chessboard/board/PositionEditor` | 4 | 684 lines; `fill` mode sizes itself in JS |
| `chessboard/board/ReadOnlySyncedBoard` | 2 | Recorder and spectator |
| `chessboard/panels/ChessClock` | 3 | Piece colours stay |
| `chessboard/toolbars/BoardNavigation` | 3 | |
| `chess-appearance/ChessAppearanceProvider` | 10 | Every board reads it |
| `puzzles/solver/PuzzleSolver` | 4 | |
| `assignments/SolutionEditor`, `PgnBoardViewer` | 3, 3 | |
| `live-class/providers/LiveClassProvider` | 43 | Field selectors are a performance rule |
| `live-class/states/ErrorStates` | 4 | Shared by member, board and demo routes |
| `live-class/meeting/PuzzleBoardTile` | 6 | |

### Largest components

These restyles take the most care, since none has been split below the backlog's 300-line guideline:

`AssignmentFormDialog` 929 · `TopicManager` 859 · `MeetingPuzzlePanel` 852 · `ActivityQueueManager` 783 · `PuzzleLibraryClient` 772 · `MeetingParticipants` 761 · `PositionEditor` 684 · `AcademyNavbar` 632 · `SimulCoachView` 597 · `CatalogBrowser` 590 · `DiscountsPanel` 579 · `DiagramImportWorkbench` 578 · `DemoBookingSection` 574 · `AdminInvoicesPanel` 563 · `ChatProvider` 559 · `PuzzleForm` 541

---

## 9. Differences on `main`

**Added:** `ui/TextEditor`, `ui/FormattedText`, `layout/RatingCard`, `home/HeroActions`, plus features `email-admin`, `knowledge`, `retention`.

**Missing compared with `dev`:** `ui/fieldStyles`, `icons/BrandIcons`.

**Merged in M0:** the merged branch has `dev`'s `ui/fieldStyles` and `icons/BrandIcons`, and `main`'s `ui/TextEditor`, `ui/FormattedText` and the `email-admin`, `knowledge` and `retention` features. `home/HeroActions` went with the old landing page. PR #125 added `features/approvals` (11 components).

**Still open:** `layout/RatingCard` is the student drawer's Chess Rating card, which `dev` removed and `main` kept. The merged branch follows `dev`, so students no longer see their rating on their dashboard: item N1. The merged branch also keeps `dev`'s student nav order.

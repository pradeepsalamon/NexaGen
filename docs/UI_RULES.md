# UI Rules — building a consistent Nexa Chess interface

These rules keep every screen looking and behaving like one product. They apply
to everything under `apps/web/src` except the recording template (`app/recorder`).
The academy marketing site (`features/academy`, served at `/`) follows the colour rules;
its layout and type keep their own look. Its Design System v2 rebuild is `features/academy/v2`
at `/academy`, which follows every rule here and reads the same `content.ts`.

**NexaChess Design System v2** is the colour, type and spacing specification
(`docs/ui-redesign/`). Never branch on `useTheme()` to pick a
colour — the variables switch with `data-theme` before first paint; JS only knows
the theme after hydration, so dark mode would paint light first.

**The one rule behind all the others:** use the shared component or the theme
token. If you find yourself typing a hex colour, a Tailwind palette colour
(`gray-500`, `blue-600`), a `dark:` override, or a raw HTML control, stop —
there is a component or token for it. If there genuinely isn't, add one to
`components/ui/` (or a token to `globals.css`) instead of styling locally.

---

## 1. Colour

Tokens live in `src/styles/globals.css` (`:root` + `:root[data-theme="dark"]`)
and are mapped in `tailwind.config.ts`.

- **Page body is plain neutral** in both themes (owner, 2026-11-08): white
  page and cards in light; `#0A0A0A` page and `#171717` cards in dark; grey
  borders and text with no blue tint. Navy stays only on the role nav
  (`surface-brand`); the app header is a plain surface (white in light), as
  in the owner's 2026-11-08 layout mock.
- **Every blue fill is the light theme's royal blue in both themes**
  (owner, 2026-11-08): `primary` / `button` fills and `on-primary` text are
  not redefined under dark, so buttons, active tabs, switches, chips and the
  active nav item never change shade. Only `primary-soft` (tint) and
  `primary-ink` (coloured text, kept readable) switch with the theme.
- **Role nav** (`components/layout/Sidebar.tsx`): from `xl` a full-height navy
  card with the logo and a collapse button on top and the user (name + role)
  at the foot; the header starts beside it. The active link is a solid
  `bg-primary` fill. Below `xl` it is the off-canvas drawer with main's gold
  edge tab.

| Need | Use | Never |
|---|---|---|
| Page / card / soft backgrounds | `bg-app-background`, `bg-app-surface`, `bg-app-soft` | `bg-white`, `bg-gray-50`, `bg-slate-900` |
| Body / secondary text | `text-app-text`, `text-app-muted` | `text-gray-*`, `text-black` |
| Borders / dividers | `border-app-border`, `divide-app-border` | `border-gray-*`, `border-white/20` |
| Brand fills (buttons, chips, active states) | `bg-primary`, `bg-accent`, `bg-brand-800`, `bg-app-danger` | `bg-blue-600`, `bg-yellow-400` |
| Text / icons on a fill | `text-on-primary`, `text-on-accent`, `text-on-brand`, `text-on-danger`, `text-on-success`, `text-on-warning`, `text-on-info` | `text-white` on a fill: several fills turn pale in dark, so their text turns dark |
| **Coloured text or icons on a surface** | the **`-ink`** token: `text-primary-ink`, `text-accent-ink`, `text-success-ink`, `text-app-danger-ink` | `text-primary` or `text-accent` on a surface; gold text on white is 1.7:1 |
| Status | `success`, `warning`, `info` (+ `-ink` for text, `-soft` for backgrounds) | `green-500`, `amber-100`, `orange-800` |
| Tints | the `-soft` tokens, or alpha on a token: `bg-primary/10`, `border-success/40` | a separate pale palette colour |
| Input borders, unchecked controls | `border-app-line-strong` | `border-app-border`, which is too faint at 3:1 |
| Over video, the board or a dimmed page | `bg-scrim/60`, `text-on-scrim`, `border-on-scrim/10`, `text-on-scrim-danger` (fixed in both themes) | `bg-black/60 text-white` |
| Inside the navy nav drawer | Put `surface-brand` on the navy container: everything inside reads the dark palette in both themes, so `text-app-text`, `Button` and `Badge` just work | Hand-picking `text-white` for each child |
| Must stay white (QR code, switch thumb) | `bg-paper` | `bg-white` |
| Chess sides and draws (swatches, result bars) | `bg-side-white`, `bg-side-black`, `bg-side-draw` | `bg-white`, `bg-neutral-900` |
| Charts | `useChartColors()`; extra hues are `--color-chart-1` to `-4` | hex in a chart |

- **Brand hues mean one thing each:** primary (royal blue) = actions, links,
  selected state. Brand navy = navigation and identity only, never a button.
  Accent (gold) = restrained reward and highlight, never a status.
  Success, warning, info = status. Danger = destructive + LIVE only.
- **Every token has its own dark value.** Coloured text comes from the `-ink`
  tokens.
- **Type:** Inter. Body 16/24 (`text-base`), small 14/20 (`text-sm`), captions and
  badges 12/16 (`text-xs`). Chess notation uses `font-mono` (JetBrains Mono).
- **No `dark:` colour overrides in feature code.** Tokens already switch with
  the theme. A hand-written `dark:border-white/10` drifts from the palette and,
  inside a shared component, silently overrides every caller's colour (this is
  exactly how outline buttons ended up with white rings in dark mode).
- **ESLint enforces this** (`apps/web/eslint.config.mjs`): hex, literal `rgb()`,
  palette classes and `dark:` colours fail lint. `dark:hidden` / `dark:block` for
  swapping artwork are fine. `-ink` tokens take no `/opacity`, and a colour name that
  isn't in `tailwind.config.ts` emits nothing, silently.
- **Only these may hold literal colour values**, because they can't read CSS
  variables or aren't theme colours:
  | File | Why |
  |---|---|
  | `styles/globals.css` | Where the tokens are defined |
  | `features/chess-appearance/**` | Board and piece themes people choose, plus SVG piece parsing |
  | `features/chessboard/lib/drawBrushes.ts` | Board arrow palette, stored by name and synced to students |
  | `app/layout.tsx` | `themeColor` metadata is a literal; keep it equal to `--rgb-background` |
  | `lib/ogImage.tsx` | Satori can't read CSS variables; keep it equal to the v2 values |
  | `lib/document-reader/**` | White paper behind a rendered PDF page for OCR |
  | `app/recorder/**` | Recording template, not changed by the redesign |

## 2. Shape and depth

| Element | Radius token |
|---|---|
| Buttons and icon buttons | `rounded-control` (the component already does this; a forced `rounded-full` is a bug; the room converted in M9) |
| Badges, avatars, on/off switches | `rounded-full` |
| Text fields: `Input`, `PasswordInput`, `Select`, `Combobox`, `Textarea`, date/time pickers | `rounded-control`, from `fieldClasses()` in `components/ui/fieldStyles.ts` (the components already do this) |
| Small tiles, chips, list rows, menu items, textareas-in-panels | `rounded-control` (8px) |
| Live-room chips (stage switch, panel tabs, menu rows) | `rounded-chip` (6px); status chips are `rounded-full` |
| Cards, panels, tables, dialogs | `rounded-app` (12px) |
| Large feature panels | `rounded-panel` (16px) |

| Depth | Token |
|---|---|
| Resting card / control | `shadow-card` |
| Hover lift, floating bars, drawers, popovers | `shadow-lift` |
| Large overlays | `shadow-soft` |

Never `rounded-md/lg/xl/2xl/3xl` or `shadow-sm/md/lg/xl/2xl` in feature code —
shadows are brand-tinted tokens, and ad-hoc radii make neighbouring cards
disagree.

## 3. Components — which one to use

| Need | Component | Notes |
|---|---|---|
| Any clickable action | `Button` | Variants: `primary` (main CTA), `neutral` (toolbars, row actions, cancels), `outline` (secondary, blue border), `ghost` (quiet, blue text), `secondary` (gold: reward and the rare secondary CTA, never a status), `destructive`, `danger-soft`. 36px high, 44px on touch screens, through `--control-h`; an explicit `size-*` or `min-h-*` on a control still wins. Never a hand-styled `<button>` for a normal action. Keep one `primary` per area. |
| Confirm / dismiss pairs | `Button` | The positive action (Apply, Save, Confirm, Done) is **filled** — `primary`, or `destructive` when it deletes. The negative one (Cancel, Clear, Reset, Close, Skip, Decline) is **`neutral`**, never `ghost` — a borderless dismiss reads as plain text. |
| Table row actions | `RowActions` | `neutral` icon buttons, `size-8`, right-aligned. `tone` colours the icon only (`default` ink, `warning` amber, `danger` red), so a row isn't a strip of filled shapes. Everything inline by default; `inline={n}` groups the rest behind "⋮" only when asked. An action that opens a page takes `href` instead of `onSelect`, so it stays a real link. A hand-written action button is `variant="neutral"` + `className="size-8"` + the same tone classes. |
| Data lists | `DataTable` (TanStack) or `Table` + `TableHeader/Body/Row/Head/Cell` | Never a raw `<table>`. The header is a sunken `surface-soft` row with 12px muted sentence-case text; don't colour or uppercase `TableHead` yourself. Text is left-aligned by default: right-align numbers you compare (`text-right`), and a `pin="end"` actions column is right-aligned already. A table wider than its card scrolls inside it, and `Table` shades the edge that hides columns. When a row has actions or more than ~4 columns, always pass `stackOnMobile` to `DataTable` and give every function-header column a `meta: { label }`: below `sm` each row becomes a card, so no action sits off-screen. Columns with ids `select` and `actions` go in the card's header and footer. A plain `Table` whose last column holds row actions passes `pin="end"` to that `TableHead`/`TableCell` so it stays on screen below `lg` (`DataTable` does this for an `actions` column automatically). |
| Sortable column header | `DataTableSortButton` (TanStack `column`) / `SortButton` + `useTableSort` (plain `Table`) | Sorting is **opt-in**: lists load in the API's own order and nothing is sorted (no `initialKey` / `initialSorting`) until the user clicks a header. Each sortable header shows ↑ asc / ↓ desc / faint ↕ unsorted; a click cycles asc → desc → unsorted. Server-paginated lists sort on the server (`sort`/`order`; with none sent, `resolveOrderBy` uses the endpoint's fallback order) — client-sorting one page would misorder the rest. Document-order tables (invoice lines, move lists, ranked leaderboards, the topic folder tree) keep their natural order and have no sort arrows. |
| Status labels | `Badge` (`default`, `secondary` (grey), `accent` (gold: reward only), `success`, `warning`, `info`, `destructive`, `live`, `outline`) | Never a hand-rolled `rounded-full px-2 text-xs` span. Text is sentence case: show an API enum through `enumLabel()` (`lib/utils.ts`), never raw `ACTIVE`, and never `uppercase`. A class status is `ClassStatusBadge`; pass `endsAt` so a scheduled class whose slot passed reads "Not held". |
| Avatars | `Avatar` (`components/ui/Avatar.tsx`; `tone` `soft` default, `brand` navy in the live room via `ParticipantAvatar`) | Photo or up to two initials. Decorative beside a printed name; pass `label` when it stands alone. Never hand-build an initials circle. |
| Pick one of several cards (themes, piece sets, sounds, payment method) | `ChoiceTile` / `choiceTileClass(selected)` (`components/ui/ChoiceTile.tsx`) | 1px border; chosen = blue border, soft blue fill, inset ring, `aria-pressed`. Never hand-build a `border-2` selection card. |
| Chessboards | `BoardFrame` (`features/chessboard/components/board/BoardFrame.tsx`) around the board; promotion via `PromotionPicker` (`PromotionDialog` for the board store) | The caller sizes the frame; real pieces in the user's set (`PieceIcon`). Grid tiles (live boards, puzzle tiles) keep their tile frame. |
| On/off setting | `Switch` | "Lock …", "Enabled", "Send WhatsApp", preferences. |
| Pick several / row selection / consent | `Checkbox` | Multi-select lists, table rows, "Remember me", "I understand …". 16px box, 12px tick; the label (`label` prop) gives the 40px tap row. |
| Text / number fields | `Input`, `Textarea`, `PasswordInput`, `Select`, `Combobox` | Never raw `<input>` / `<textarea>` / `<select>` (file, colour, range and radio inputs are the exceptions). They share one look (`fieldClasses()`: surface fill, `line-strong` border, blue border + ring on focus, red border on error); change it there, not per form. `leadingIcon` puts an icon inside; `density="compact"` (Input, PasswordInput, Select) is the dense field of multi-column forms such as registration. |
| Formatted text (messages, announcements, help articles) | `TextEditor`; show the result with `FormattedText` | Toolbar over a `Textarea`, stores readable text, never HTML. Only where the output is displayed through `FormattedText`, `markdownToPlainText`/`markdownToWhatsApp` or the email renderer, or readers see raw `**`. Everything else stays `Textarea`. |
| Showing text someone typed | `LinkedText` (`components/ui/FormattedText.tsx`) | Chat, feedback, notes: addresses become underlined links and nothing else changes. `onColour` on a coloured surface like your own chat bubble. Never `dangerouslySetInnerHTML` or a local URL regex. |
| Dates and times | `DatePicker`, `DateStringPicker` (for `"YYYY-MM-DD"` / `"YYYY-MM-DDTHH:mm"` state), `TimePicker`, `DateRangePicker` | Never `type="date|time|datetime-local"`. |
| Tabs | `Tabs` / `TabsList` / `TabsTrigger` | Segmented style: sunken `bg-app-soft` track, active tab is a solid primary chip that slides between tabs (`useSlidingIndicator`); `TabsContent` fades up (`animate-tab-panel-in`). A two-way switch may slide its content sideways instead (`animate-tab-in-left`/`-right`, register page). |
| Inline messages / load errors | `Alert` (`error`, `warning`, `info`, `success`), `WidgetError` | Soft fill + `-ink` text. Correct `role`/`aria-live` built in. Toasts use the same colours. |
| Confirm before acting | `ConfirmationModal` (+ optional `icon`) | Never `window.confirm`. Undo policy: `lib/undo/README.md`. |
| Forms in a popup | `Dialog` | Confirmations use `ConfirmationModal`/`AlertDialog`. |
| Bulk actions on selected rows | `BulkActionsBar` + `useBulkAction` + `BulkResultDialog` | |
| KPIs / stat tiles | `KpiCard`, `StatTile` | Plain card with a 12px label and a 32/40 value. Numbers use the display font with `tabular-nums`, never `font-mono`. Labels are sentence case. Don't hand-roll a KPI tile. |
| Nothing to show | `EmptyState` | Icon, one headline, one line of next step. Default (`page`) is a dashed framed block for a page or tab with nothing else. Inside a card or `SectionCard` use `variant="inline"` so it isn't framed twice. Where the layout must differ (a card with a link button, a room panel) use `EmptyStateIcon` for the icon circle, never a hand-built one. |
| Loading | `Spinner` (`components/ui/Spinner`) | The one spinner: an arc on a faint track in the current colour, sized like an icon (`size-4` in a button — `Button isLoading` already uses it — `size-8` for a section). Never `Loader2` + `animate-spin`. |
| Loading placeholder | `Skeleton` | A theme-neutral tint with a light sweep (transform only). Shape it like the content that will land (see `BatchSummaryCardSkeleton`), not one big block. |
| Table loading | `DataTable isLoading` / `TableSkeletonRows` | `DataTable` draws skeleton rows (and cards on a phone) by itself, keeping `loadingText` for screen readers. A hand-built `<Table>` uses `<TableSkeletonRows columns={n} />`. Never a single "Loading…" text row. |
| Page loading | `PageLoading` (`components/layout/PageLoading`) | A route's `loading.tsx` and a page's `<Suspense fallback>`. Never plain "Loading…" text. A small area inside a panel or dialog: `Spinner` beside short text. |
| Full-page create/edit | `FormPageShell` | Sticky back + title + actions header. |
| Page title + actions | `PageHeader` | Pass `breadcrumbs` on a detail page instead of a `BackButton`. |
| Batch card on a "My batches" page | `BatchSummaryCard` (`features/batches/components`) | Title + badges, one-line description, facts as one wrapping row, footer with people left and actions right. Student and coach pages use it. |
| Sign-in and account pages (`/login`, `/register`, password reset, email verification) | `AuthSplitShell` + `AuthHeader` + `AuthStatus` (`features/auth/components`) | Navy brand panel (text never on the artwork) beside the form card; below `lg` the panel is a navy bar. `AuthHeader` is the card's only `h1`, the panel tagline a `<p>`. `AuthStatus` is every outcome in the card (sent, verified, incomplete link, waiting). Registration groups fields with `RegistrationFieldset` and uses full-size fields, not `density="compact"`. |
| Analytics page | `AnalyticsPageShell` (`features/analytics/components`) | `PageHeader` with the date range, Refresh and Export as its actions; `breadcrumbs` on a detail report. The admin dashboard uses it too. Never a second hand-built analytics header. |
| Role page frame | `PageContent` | The one ground, padding and `max-w-7xl` content width. Role layouts use it; pages don't add their own. |
| A class in a list | `ClassRow` inside `ClassRowList` | Status and Join come from `class-availability`. Pass `actions` to replace the buttons, `quietJoin` where another control is the page's primary action. Coach lists use `CoachClassRow` (`features/coach/components`): Start while the start window is open, View class, and a ⋮ menu for notes and requests. |
| Month of classes | `ScheduleCalendar` with `groupByDay` (`lib/scheduleCalendar.ts`) | The caller lists the selected day's classes beside it. The coach schedule's Month tab uses it; batch calendars have not adopted it yet. |
| Live-room controls | `features/live-class/components/room-ui/` (`StatusChip`, `RoomTabs`, `ControlBar`, `LeaveButton`, `RequestRow`) and `MeetingControlButton` | 44px control buttons, 28px chips, 36px tab tracks. Any tab row in the room is `RoomTabs` (it moves extra tabs into More). Spec map: [live-class/LIVE_CLASS_COMPONENT_MAPPING.md](live-class/LIVE_CLASS_COMPONENT_MAPPING.md). |
| Tooltips | `SimpleTooltip` | Never `title=` on an interactive element. |
| Icons | `lucide-react` only, sized with classes (`className="size-4"`), `strokeWidth={2.25–2.5}` | No other icon library, no inline `<svg>` icons, no `size={16}` props (they don't follow the text-size setting). |

## 4. Layout

- **Controls go on the right** (owner rule, all screen sizes). Page-level
  tabs, CTAs, primary actions, filters and search sit right-aligned:
  `PageHeader` actions; `TabsList` is `justify-self-end` by default (never
  give a page strip `w-full` — that left empty track on the right; only tabs
  that must fill a dialog or panel set `w-full`/`justify-self-start`);
  `justify-end` on filter/search rows; a lone CTA beside a wrapping text gets
  `ml-auto`. **`DataTableToolbar`** below `sm` is a 2-column grid: search full
  width on top, filters stretching to fill the next row, actions (View) at its
  end; from `sm` one right-aligned row at the callers' widths.
  **`DataTablePagination`** controls are on the right; below `sm` Previous/Next
  are arrow buttons so the row fits. Below `sm` a plain filter row fills the
  width instead (`grid grid-cols-2 … sm:flex sm:justify-end`, fields
  `w-full sm:w-44`), so half the card isn't empty.
  Content (titles, descriptions, tables) reads from the left.
- **Buttons stay on the right on phones too** (owner, 2026-11-06): a stacked
  `flex-col sm:flex-row` row puts its action child on `self-end sm:self-auto`;
  button groups are `justify-end` with the **primary last** (rightmost) and
  Cancel/Reset before it; card footers put people/meta on the left and actions
  on the right (`BatchSummaryCard`). Dialog footers keep `DialogFooter`.
- **Three or more filters collapse into `FilterPopover`** (one "Filters" button,
  Apply/Clear, active ones as `FilterChips`) beside the search box, which
  searches as you type. Examples: admin invoices, game library, puzzle library,
  Lichess catalogue, activity library/history, payments, trash, completed
  classes, analytics filters, the puzzle-set picker.
- **Tabs never scroll sideways.** `TabsList` measures itself: when the tabs
  don't fit on one row it becomes one button showing the selected tab that
  opens a menu of every tab. Nothing to do per page; it needs `Tabs` from
  `components/ui/Tabs` (the menu reads the value from its context) and
  `TabsTrigger`s as direct children (fragments and `.map` are fine).
- **Motion is short and cheap.** Overlays (dialog, popover, menu, tooltip)
  use the `tailwindcss-animate` classes (`animate-in fade-in-0 zoom-in-95` …);
  pages fade in with `animate-fade-in` (opacity only: a transform would trap
  `position: fixed` children); buttons press to 97%. Animate `transform` and
  `opacity`, never a page-wide `padding`/`width` (the docked nav animates only
  its own column). `prefers-reduced-motion` turns it all off (globals.css).
- **KPI / stat tiles are two per row on phones** (`KpiCardRow`, and grids
  holding `StatTile` start at `grid-cols-2`) — never one full-width tile per
  number, never a sideways strip.
- **Page titles** are `<h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">`
  (`PageHeader` / `FormPageShell` render this for you). One `h1` per page — the
  app header's location label is a `<p>`, not a heading.
- **Page names** live in `lib/pageTitles.ts` (`PAGE_TITLES`, sentence case).
  A page exports `metadata = { title: pageTitle("/route") }`; the root layout's
  template adds "| Nexa Chess". A `"use client"` page gets a three-line
  `layout.tsx` using `layoutTitle()` instead (a plain string title in a layout
  would cut the template off its child routes). The header reads the same map,
  and the nav label uses the same wording. A new page = a `PAGE_TITLES` entry.
- **Role layouts** (`app/admin|coach|student/layout.tsx`) give the page its
  padding, background and `<main>`; pages don't add their own outer padding
  or a second `<main>`. A page-level `grid` needs `grid-cols-[minmax(0,1fr)]`,
  or its widest child (a tab row, a toolbar) stretches it past a phone screen.
- `<main>` uses `overflow-x-clip`, never `overflow-x-hidden` — the latter makes
  `main` a scroll container and breaks every `sticky` element inside it.
- Every screen must work at **320px** with no horizontal page scroll; wide
  tables scroll inside their own box. See `docs/RESPONSIVE.md`.

## 5. Interaction and accessibility

- Icon-only buttons need an `aria-label` **and** a visible label via
  `SimpleTooltip`.
- Focus styles: `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus`
  (the shared components include it). Never `focus:outline-none` without a
  visible replacement.
- Every form control has an accessible name: a visible `<label>` (`Field`,
  `FormField`, or a `<label>` around it), or an `aria-label` for a toolbar
  filter with no visible label (`aria-label="Filter by status"`). A hidden
  `<input type="file">` opened by a button still gets an `aria-label`.
- A box that scrolls on its own must be reachable by keyboard. `ScrollShadow`
  (tables) does it: while its content overflows it becomes a focusable, named
  region (`label` prop). A hand-built scroller uses
  `useScrollableRegion(ref, label)` from `hooks/useScrollableRegion.ts`. Don't
  put a second `overflow-x-auto` around a table that already scrolls inside
  its card.
- Check new pages with axe (WCAG 2.1 A/AA) in light and dark: no violations
  is the bar. Coloured text on a soft fill or on a card is `-ink`, never the
  plain `text-app-danger` / `text-app-success` (they fail contrast as text).
- Touch targets are 44px for controls on touch screens (`--control-h`); table
  action icons are 32px (`size-8`) with 8px gaps.
- Animations use `transition-colors` / `transition-transform` for what actually
  changes — not `transition-all` — and respect `motion-safe:` for anything
  continuous (pulses).
- Tab and view switches animate: a hand-built tab row uses
  `useSlidingIndicator` for its selected chip (as `TabsList`, `RoomTabs` and the
  meeting sidebar do); a switched panel fades up with `animate-tab-panel-in`, a
  swapped main stage cross-fades with `animate-stage-in`. Both use `backwards`
  fill so no transform stays on the panel, and are `motion-safe:`.
- Dates/times: `lib/datetime.ts` + `useUserTimeZone()`; never `toLocale*` in a
  component (see CLAUDE.md §3.6).

## 6. Typography

- Fonts and text size come from the typography settings (CLAUDE.md §3.6j):
  headings use the heading font automatically; don't set `font-family` in
  components.
- Prefer rem-based sizes (`text-sm`, `text-base` …). Arbitrary `text-[13px]`
  values don't follow the user's text-size preference.

## 7. Before you open a PR

1. No new hex / palette colours / `dark:` colour overrides: `npm run lint -w apps/web`.
2. No raw `<table>`, `<select>`, native date/time inputs, or hand-rolled badges.
3. Coloured text uses `-ink`.
4. Radii/shadows are tokens.
5. Checked in **light and dark** at phone and laptop width
   (`npm run shots -- --paths <routes> --devices mobile,laptop --theme both`).

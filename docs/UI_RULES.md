# UI Rules — building a consistent Nexa Chess interface

These rules keep every screen looking and behaving like one product. They apply
to everything under `apps/web/src` except the recording template (`app/recorder`).
The academy marketing site (`features/academy`) follows the colour rules; its
layout and type still have their own look until M10.

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
| Inside the navy header or drawer | Put `surface-brand` on the navy container: everything inside reads the dark palette in both themes, so `text-app-text`, `Button` and `Badge` just work | Hand-picking `text-white` for each child |
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
| Buttons and icon buttons | `rounded-control` (the component already does this; a forced `rounded-full` is a bug outside the room, which converts in M9) |
| Badges, avatars, on/off switches | `rounded-full` |
| Text fields: `Input`, `PasswordInput`, `Select`, `Combobox`, `Textarea`, date/time pickers | `rounded-control`, from `fieldClasses()` in `components/ui/fieldStyles.ts` (the components already do this) |
| Small tiles, chips, list rows, menu items, textareas-in-panels | `rounded-control` (8px) |
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
| Table row actions | `RowActions` | `neutral` icon buttons, `size-8`, right-aligned. `tone` colours the icon only (`default` ink, `warning` amber, `danger` red), so a row isn't a strip of filled shapes. Everything inline by default; `inline={n}` groups the rest behind "⋮" only when asked. A hand-written action button is `variant="neutral"` + `className="size-8"` + the same tone classes. |
| Data lists | `DataTable` (TanStack) or `Table` + `TableHeader/Body/Row/Head/Cell` | Never a raw `<table>`. The header is a sunken `surface-soft` row with 12px muted sentence-case text; don't colour or uppercase `TableHead` yourself. Text is left-aligned by default: right-align numbers you compare (`text-right`), and a `pin="end"` actions column is right-aligned already. A table wider than its card scrolls inside it, and `Table` shades the edge that hides columns. When a row has actions or more than ~4 columns, always pass `stackOnMobile` to `DataTable` and give every function-header column a `meta: { label }`: below `sm` each row becomes a card, so no action sits off-screen. Columns with ids `select` and `actions` go in the card's header and footer. A plain `Table` whose last column holds row actions passes `pin="end"` to that `TableHead`/`TableCell` so it stays on screen below `lg` (`DataTable` does this for an `actions` column automatically). |
| Sortable column header | `DataTableSortButton` (TanStack `column`) / `SortButton` + `useTableSort` (plain `Table`) | Sorting is **opt-in**: lists load in the API's own order and nothing is sorted (no `initialKey` / `initialSorting`) until the user clicks a header. Each sortable header shows ↑ asc / ↓ desc / faint ↕ unsorted; a click cycles asc → desc → unsorted. Server-paginated lists sort on the server (`sort`/`order`; with none sent, `resolveOrderBy` uses the endpoint's fallback order) — client-sorting one page would misorder the rest. Document-order tables (invoice lines, move lists, ranked leaderboards, the topic folder tree) keep their natural order and have no sort arrows. |
| Status labels | `Badge` (`default`, `secondary` (grey), `accent` (gold: reward only), `success`, `warning`, `info`, `destructive`, `live`, `outline`) | Never a hand-rolled `rounded-full px-2 text-xs` span. Text is sentence case: show an API enum through `enumLabel()` (`lib/utils.ts`), never raw `ACTIVE`, and never `uppercase`. |
| On/off setting | `Switch` | "Lock …", "Enabled", "Send WhatsApp", preferences. |
| Pick several / row selection / consent | `Checkbox` | Multi-select lists, table rows, "Remember me", "I understand …". |
| Text / number fields | `Input`, `Textarea`, `PasswordInput`, `Select`, `Combobox` | Never raw `<input>` / `<textarea>` / `<select>` (file, colour, range and radio inputs are the exceptions). They share one look (`fieldClasses()`: surface fill, `line-strong` border, blue border + ring on focus, red border on error); change it there, not per form. `leadingIcon` puts an icon inside; `density="compact"` (Input, PasswordInput, Select) is the dense field of multi-column forms such as registration. |
| Formatted text (messages, announcements, help articles) | `TextEditor`; show the result with `FormattedText` | Toolbar over a `Textarea`, stores readable text, never HTML. Only where the output is displayed through `FormattedText`, `markdownToPlainText`/`markdownToWhatsApp` or the email renderer, or readers see raw `**`. Everything else stays `Textarea`. |
| Showing text someone typed | `LinkedText` (`components/ui/FormattedText.tsx`) | Chat, feedback, notes: addresses become underlined links and nothing else changes. `onColour` on a coloured surface like your own chat bubble. Never `dangerouslySetInnerHTML` or a local URL regex. |
| Dates and times | `DatePicker`, `DateStringPicker` (for `"YYYY-MM-DD"` / `"YYYY-MM-DDTHH:mm"` state), `TimePicker`, `DateRangePicker` | Never `type="date|time|datetime-local"`. |
| Tabs | `Tabs` / `TabsList` / `TabsTrigger` | Segmented style: sunken `bg-app-soft` track, active tab is a solid primary chip. |
| Inline messages / load errors | `Alert` (`error`, `warning`, `info`, `success`), `WidgetError` | Soft fill + `-ink` text. Correct `role`/`aria-live` built in. Toasts use the same colours. |
| Confirm before acting | `ConfirmationModal` (+ optional `icon`) | Never `window.confirm`. Undo policy: `lib/undo/README.md`. |
| Forms in a popup | `Dialog` | Confirmations use `ConfirmationModal`/`AlertDialog`. |
| Bulk actions on selected rows | `BulkActionsBar` + `useBulkAction` + `BulkResultDialog` | |
| KPIs / stat tiles | `KpiCard`, `StatTile` | Plain card with a 12px label and a 32/40 value. Numbers use the display font with `tabular-nums`, never `font-mono`. Labels are sentence case. Don't hand-roll a KPI tile. |
| Nothing to show | `EmptyState` | Icon, one headline, one line of next step. Default (`page`) is a dashed framed block for a page or tab with nothing else. Inside a card or `SectionCard` use `variant="inline"` so it isn't framed twice. |
| Full-page create/edit | `FormPageShell` | Sticky back + title + actions header. |
| Page title + actions | `PageHeader` | Pass `breadcrumbs` on a detail page instead of a `BackButton`. |
| Role page frame | `PageContent` | The one ground, padding and `max-w-7xl` content width. Role layouts use it; pages don't add their own. |
| Tooltips | `SimpleTooltip` | Never `title=` on an interactive element. |
| Icons | `lucide-react` only, sized with classes (`className="size-4"`), `strokeWidth={2.25–2.5}` | No other icon library, no inline `<svg>` icons, no `size={16}` props (they don't follow the text-size setting). |

## 4. Layout

- **Controls go on the right.** Page-level tabs, CTAs, filters and search sit
  right-aligned: `PageHeader` actions, `justify-self-end` on a standalone
  `TabsList`, `justify-end` on filter/search rows, `DataTableToolbar`.
  Content (titles, descriptions, tables) reads from the left.
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
- Touch targets are 44px for controls on touch screens (`--control-h`); table
  action icons are 32px (`size-8`) with 8px gaps.
- Animations use `transition-colors` / `transition-transform` for what actually
  changes — not `transition-all` — and respect `motion-safe:` for anything
  continuous (pulses).
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

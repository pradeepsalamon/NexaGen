# UI Rules — building a consistent Nexa Chess interface

These rules keep every screen looking and behaving like one product. They apply
to everything under `apps/web/src` except the academy marketing site
(`app/academy`, `features/academy`), which has its own brand, and the recording
template (`app/recorder`).

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
| Brand fills (buttons, chips, active states) | `bg-primary`, `bg-secondary`, `bg-accent`, `bg-warm`, `bg-app-danger` | `bg-blue-600`, `bg-yellow-400` |
| **Coloured text or icons on a surface** | the **`-ink`** token: `text-primary-ink`, `text-secondary-ink`, `text-accent-ink`, `text-warm-ink`, `text-app-danger-ink` | `text-primary` on a surface — deep blue is unreadable in dark mode |
| Status | `success`, `warning`, `info` (+ `-ink` for text) | `green-500`, `amber-100`, `orange-800` |
| Tints | alpha on a token: `bg-primary/10`, `border-accent/40` (on-scale values, or `bg-primary/[0.06]`) | a separate pale palette colour |

- **Brand hues mean one thing each** (keep them): primary = classes/actions,
  accent (emerald) = success/active, secondary (saffron) = attention/practice,
  warm (coral) = learning/courses, danger = destructive + LIVE only.
- **Brand hues are identical in light and dark.** Readable coloured text in dark
  comes from the `-ink` tokens, which lighten automatically.
- **No `dark:` colour overrides in feature code.** Tokens already switch with
  the theme. A hand-written `dark:border-white/10` drifts from the palette and,
  inside a shared component, silently overrides every caller's colour (this is
  exactly how outline buttons ended up with white rings in dark mode).
- Allowed exceptions: text/chips floating over **video or the chessboard**
  (`bg-black/60 text-white`), where the backdrop is not a theme surface.

## 2. Shape and depth

| Element | Radius token |
|---|---|
| Buttons, inputs, selects, badges, pills, tabs, avatars, icon buttons | `rounded-full` (the components already do this) |
| Small tiles, chips, list rows, menu items, textareas-in-panels | `rounded-control` (12px) |
| Cards, panels, tables, dialogs | `rounded-app` (20px) / `rounded-[20px]` |
| Large feature panels | `rounded-panel` (24px) |

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
| Any clickable action | `Button` | Variants: `primary` (main CTA), `outline` (secondary), `ghost` (quiet), `secondary` (saffron), `destructive`. Never a hand-styled `<button>` for a normal action. Keep one `primary` per area. |
| Confirm / dismiss pairs | `Button` | The positive action (Apply, Save, Confirm, Done) is **filled** — `primary`, or `destructive` when it deletes. The negative one (Cancel, Clear, Reset, Close, Skip, Decline) is **`outline`**, never `ghost` — a borderless dismiss reads as plain text. |
| Table row actions | `RowActions` | Filled round icon buttons by `tone` (`default` blue, `warning` saffron, `danger` red). Everything inline by default; `inline={n}` groups the rest behind "⋮" only when asked. A hand-written action button must use the same filled classes **and `variant="ghost"`** — never `outline`, whose dark styling repaints it. |
| Data lists | `DataTable` (TanStack) or `Table` + `TableHeader/Body/Row/Head/Cell` | Never a raw `<table>`. The header is the blue brand row; don't colour `TableHead` yourself. Body cells that need left/right alignment say so (`text-left`/`text-right`). |
| Status labels | `Badge` (`default`, `secondary`, `success`, `warning`, `info`, `destructive`, `outline`) | Never a hand-rolled `rounded-full px-2 text-xs` span. |
| On/off setting | `Switch` | "Lock …", "Enabled", "Send WhatsApp", preferences. |
| Pick several / row selection / consent | `Checkbox` | Multi-select lists, table rows, "Remember me", "I understand …". |
| Text / number fields | `Input`, `Textarea`, `PasswordInput`, `Select`, `Combobox` | Never raw `<input>` / `<textarea>` / `<select>` (file, colour, range and radio inputs are the exceptions). |
| Dates and times | `DatePicker`, `DateStringPicker` (for `"YYYY-MM-DD"` / `"YYYY-MM-DDTHH:mm"` state), `TimePicker`, `DateRangePicker` | Never `type="date|time|datetime-local"`. |
| Tabs | `Tabs` / `TabsList` / `TabsTrigger` | Pill track, emerald active tab. |
| Inline messages / load errors | `Alert` (`error`, `warning`, `info`, `success`), `WidgetError` | Correct `role`/`aria-live` built in. |
| Confirm before acting | `ConfirmationModal` (+ optional `icon`) | Never `window.confirm`. Undo policy: `lib/undo/README.md`. |
| Forms in a popup | `Dialog` | Confirmations use `ConfirmationModal`/`AlertDialog`. |
| Bulk actions on selected rows | `BulkActionsBar` + `useBulkAction` + `BulkResultDialog` | |
| KPIs / stat tiles | `KpiCard`, `StatTile` | Icon inside the gradient ring. |
| Full-page create/edit | `FormPageShell` | Sticky back + title + actions header. |
| Page title + actions | `PageHeader` | |
| Tooltips | `SimpleTooltip` | Never `title=` on an interactive element. |
| Icons | `lucide-react` only, sized with classes (`className="size-4"`), `strokeWidth={2.25–2.5}` | No other icon library, no inline `<svg>` icons, no `size={16}` props (they don't follow the text-size setting). |

## 4. Layout

- **Controls go on the right.** Page-level tabs, CTAs, filters and search sit
  right-aligned: `PageHeader` actions, `justify-self-end` on a standalone
  `TabsList`, `justify-end` on filter/search rows, `DataTableToolbar`.
  Content (titles, descriptions, tables) reads from the left.
- **Page titles** are `<h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">`
  (`PageHeader` / `FormPageShell` render this for you). One `h1` per page.
- **Role layouts** (`app/admin|coach|student/layout.tsx`) give the page its
  padding and max width; pages don't add their own outer padding.
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
- Touch targets ≥ 40px for primary controls; table action icons are 32px
  (`size-8`) with 8px gaps.
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

1. No new hex / palette colours / `dark:` colour overrides —
   `grep -nE "(gray|slate|zinc|blue|yellow)-[0-9]{2,3}|dark:(bg|text|border)-" <files>`.
2. No raw `<table>`, `<select>`, native date/time inputs, or hand-rolled badges.
3. Coloured text uses `-ink`.
4. Radii/shadows are tokens.
5. Checked in **light and dark** at phone and laptop width
   (`npm run shots -- --paths <routes> --devices mobile,laptop --theme both`).

# NexaChess visual asset library

Hand-authored vector illustrations (no embedded rasters), served as static
files from `/nexachess-assets/...`. Nothing in the app references them yet.

| Folder | Files | viewBox |
|---|---|---|
| `chess-pieces/` | `piece-{king,queen,rook,bishop,knight,pawn}.svg` | `0 0 120 160` |
| `empty-states/` | `empty-{students,courses,assignments,puzzles,search-results,notifications,activity,attendance}.svg` | `0 0 240 200` |

Not yet delivered: `empty-states/empty-schedule.svg` (Phase 1) and
`empty-states/empty-reports.svg` (the delivery was cut off mid-file).

## Constraints before wiring these into the UI

- **Fixed colours.** The SVGs hold literal hex values from the Design System v2
  palette, so they don't switch with the theme. Several have white or
  `#F4F7FC` cards that will glare on the dark theme; check `[data-theme="dark"]`
  before using them, or pair a light/dark variant with `dark:hidden` / `dark:block`.
- **Empty states.** `docs/UI_RULES.md` makes `EmptyState` (lucide icon) the one
  "nothing to show" pattern. Using these illustrations there means extending
  `EmptyState`, not hand-building a new block.
- **Chess pieces** are decorative, single-colour (blue/gold) art. They are not a
  board piece set: board sets live in `public/chess/pieces/<id>/` as
  `w*.svg` + `b*.svg` and are read through `useChessAppearance()`.
- Gradient ids are unique per file, so several pieces can be inlined on one page.

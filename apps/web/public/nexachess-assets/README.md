# NexaChess visual asset library

Hand-authored vector illustrations (no embedded rasters), served as static
files from `/nexachess-assets/...`.

| Folder | Files | viewBox |
|---|---|---|
| `chess-pieces/` | `piece-{king,queen,rook,bishop,knight,pawn}.svg` | `0 0 120 160` |
| `empty-states/` | `empty-{students,courses,assignments,puzzles,search-results,notifications,activity,attendance}.svg`, each with a `-dark.svg` twin | `0 0 240 200` |

Not yet delivered: `empty-states/empty-schedule.svg` (Phase 1) and
`empty-states/empty-reports.svg` (the delivery was cut off mid-file).

## Empty states

Used through `EmptyState` (`illustration="courses"`) or `EmptyStateIllustration`
(`components/ui/EmptyState.tsx`). The SVGs hold fixed palette colours, so they
can't follow the theme tokens: each has a `-dark` twin, and the component shows
one with `dark:hidden` / `hidden dark:block`.

The dark twins swap paper and ink: white and `#F4F7FC` cards become `#132D50`,
navy ink (`#0B1F3B`) becomes `#DBEAFE`, `#DBEAFE` details become `#1E40AF`, and
`#1E40AF` brightens to `#3B82F6`. Large dark fills (the puzzle and activity
boards) stay dark, the attendance calendar header turns `#2563EB`, and ground
shadows deepen to black at 30%. Change an illustration = change both files.

## Chess pieces

Decorative, single-colour (blue/gold) art, not used in the app yet. They are not
a board piece set: board sets live in `public/chess/pieces/<id>/` as `w*.svg` +
`b*.svg` and are read through `useChessAppearance()`. Gradient ids are unique per
file, so several pieces can be inlined on one page.

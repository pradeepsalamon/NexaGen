# Live class: design system notes

The room uses Design System v2 as it is ([docs/UI_RULES.md](../UI_RULES.md)); this file lists only what the room adds or pins down.

- **One new token:** `--radius-chip: 0.375rem` → `rounded-chip` (6px) for chips inside a sunken track and menu rows. Buttons, controls and tabs stay `rounded-control` (8px); cards, panels, tiles and the board frame `rounded-app` (12px); the control bar and dialogs `rounded-panel` (16px); badges, avatars and dots `rounded-full`. No round buttons.
- **Colour roles:** navy only for the top bar (`surface-brand`); blue for selected, open, raised, unread and "Your move"; gold for the Coach tag and the top three ranks; red only for Live, Recording, Leave, End class, Remove and your own muted mic or camera (soft red); status tokens for connection and time left (amber in the last five minutes and over time). Over video, `bg-scrim/80` + `text-on-scrim` in both themes.
- **Sizes:** top bar 56/48, control bar 60, controls 44, tabs 36/28, board tools and row actions 32, people and request rows 48+, engine row 52. Phones keep 44px touch targets.
- **Type:** nothing below 12px (`text-xs`); 13px uses `text-[0.8125rem]` (rem, so the text-size setting still scales it); notation in `font-mono`; scores and clocks `tabular-nums`.
- **Icons:** Lucide, 20px in the control bar, 16px in rows and tools, stroke 1.75–2.
- **Motion:** colour transitions only; no scale-on-hover; the only animation is the reconnecting spinner (`motion-safe`).
- **Light and dark:** every part reads tokens; checked in both at 1440 and 390 (see the test report).

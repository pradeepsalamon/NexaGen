# Live class: component architecture

The redesign keeps the existing structure (`components/meeting/*`, providers, hooks); it adds one folder of presentation-only parts and changes who renders the control bar.

## `components/room-ui/` (new, no room state)

| File | What | Used by |
|---|---|---|
| `StatusChip.tsx` | 28px chip, tones `live`, `recording`, `success`, `warning`, `info`, `neutral` | top bar chips |
| `RoomTabs.tsx` | 36px track, 28px chips, `maxVisible` + More, `iconOnly`, `fill` (phones, 44px) | stage switch, panel tabs, side column, chat threads, phone switch |
| `ControlBar.tsx` | 60px bar + `ControlBarDivider` | `MeetingToolbar` |
| `LeaveButton.tsx` | 44px red Leave | `MeetingToolbar` |
| `RequestRow.tsx` | 48px request row + `RowSectionHeader` | waiting room, screen-share requests |

`MeetingControlButton.tsx` exports `CONTROL_BUTTON_BASE` / `CONTROL_BUTTON_VARIANTS` / `ControlBadge` so menu triggers (More, Students) look like controls.

## Decisions

- **The stage hosts the control bar.** `MeetingLayout` passes `<MeetingToolbar />` to `ClassroomLayout` / `PhoneStage`, which render it inside a `relative` stage column (`data-classroom-stage`). It therefore never covers the panel, in side-by-side or stacked layouts, and `CLASSROOM_PANEL_OFFSET` is gone. The bar is memoised and takes no props, so the stage re-rendering does not re-render it.
- **Overflow by priority, not breakpoints.** `MeetingToolbar` measures its own width (`useElementWidth`) and `fitSlots()` keeps the highest-priority controls; the rest become More rows with the same action (Reactions becomes an emoji row at the top of More; Students and Interactives open a dialog). Phones keep at most seven controls.
- **Stage header.** `classroom/StageHeader.tsx` puts the stage switch first and the coach's presentation controls (from `StagePresentationProvider`) last; every stage (`InlineStage`, `PuzzleStage`, board, gallery) uses it.
- **Top bar.** `ClassroomTopBar` no longer wraps the global `Header`; it reuses `Logo`, `ThemeToggle`, `NotificationBell` and `UserNavMenu`, still with `openLinksInNewTab` in the room. The batch name comes from `GET /live-class/:id` (`batchName`, added to the response; no roster), stored as `batchName` in the room store.
- **No new state, packets, polling or keys.** Saved browser keys, interactive ids and the PiP size index are unchanged (the first PiP size is now 320 × 180).

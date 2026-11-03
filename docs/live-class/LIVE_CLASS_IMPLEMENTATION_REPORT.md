# Live class redesign: implementation report

Branch `feat/live-class-redesign` (not pushed), 2026-11-03. Spec: *NexaChess live class: features, data and UI design spec*. Per-component status: [LIVE_CLASS_COMPONENT_MAPPING.md](LIVE_CLASS_COMPONENT_MAPPING.md).

## What changed for people in the room

- **One navy top bar** (56px, 48px on phones): Live, Recording and queue chips; the topic with "Batch · N here"; connection and time left. The time chip turns amber in the last five minutes and shows "Over by …". The full-width reconnect banner is now a chip.
- **The control bar belongs to the stage.** It is 60px, 16px radius, and centred in the board column, never over the panel. 44px rounded-square controls, soft red when off, blue when active, a lock mark when the class locks them. Whatever doesn't fit moves into **More** by priority, and phones keep at most three optional controls.
- **Students menu.** The coach's five class-wide buttons became one control with a 280px menu: Mute all, Cameras off, Lock microphones, Lock cameras, Reactions.
- **Tabs everywhere are one component** (`RoomTabs`: 36px track, 28px chips, arrow keys, extras under More with a dot). It is used by the stage switch (four visible), panel tabs (three), side column, chat threads and the phone Board / Video / Puzzle switch.
- **Board frame** (6px padding, 12px radius) with the tools row under the board; students get flip only.
- **People rows:**
  - presence dot, badges (Coach, Hand up, Moves white/black, Sharing, Weak connection), mic and camera controls;
  - a ⋮ menu: Message privately, Stop share, board control, Remove from class (confirmed);
  - waiting-room and share requests as 48px request rows, plus Admit all.
- **Video tiles:** navy camera-off fallback, scrim name pill, gold Coach tag, "Hand raised" flag.
- **Activities:**
  - leaderboard with gold chips for the top three and a You badge;
  - live boards two per row, with red wrong-move chips;
  - queue steps as numbered 48px rows (Done / Now / Next / Could not start);
  - "Your move" in blue in simul;
  - interactives say "Students see this" / "Only you" and have Back to board.
- **Mini player** opens at 320 × 180 with its controls on the scrim.
- **Type and shape:** nothing below 12px, 13px rem steps instead of pixel sizes, a new `rounded-chip` (6px) token, and no round buttons left in the room.

## Code

- **Created:**
  - in `room-ui/`: `StatusChip`, `LeaveButton`, `ControlBar`, `RoomTabs`, `RequestRow`;
  - `classroom/StageHeader` (with the presentation context);
  - `StudentControlsMenu` / `StudentControlsList`, `InteractivesGrid` (extracted), `AdmitAllButton`, `PresenceDot`.
- **Refactored:** `MeetingControlButton`, `MoreControlsMenu`, `MeetingToolbar` (priority slots + `fitSlots`), `ClassroomTopBar`, `MeetingTopBar`, `MeetingStatus`, `MeetingLayout`, `ClassroomLayout`, `ClassroomPanel`, `MeetingParticipants`, `ActivityQueueManager`, `MiniPlayer`.
- **Improved:** about 40 other room files (chat, video grid, puzzles, simul, match, interactives, chessboard panels).
- **API:** `GET /live-class/:id` also returns `batchName`, the name only (new unit test). There are no migrations and no other API change.
- **Permissions:** unchanged. Every coach action still goes through the existing API checks. The UI only hides what a role can't do, and no answer key or private data reaches a student.

## Fixed during QA

- Send position was cut off in the title.
- Students and People had the same icon.
- "Cameras off" was cut off.
- The time chip was too long on phones.
- The red hover on the sheet close button.
- The leaderboard name column was squeezed to nothing.
- The "Live boards" title was cut off (the tab already names it).
- The student's puzzle board sat smaller than its frame (`PracticeBoard`'s 440px cap).

## Limitations

See [LIVE_CLASS_TEST_REPORT.md](LIVE_CLASS_TEST_REPORT.md) § "Not tested" and [LIVE_CLASS_IMPLEMENTATION_ROADMAP.md](LIVE_CLASS_IMPLEMENTATION_ROADMAP.md) § "Still open". Most importantly:
- no real class has been run;
- the seven spec decisions are waiting for the owner;
- lowering a hand and allowing a share unasked have no backend;
- coach phones stay video-only, as before.

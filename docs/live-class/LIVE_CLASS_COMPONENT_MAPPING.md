# Live class: the 28 spec components, mapped to code

Source: *NexaChess live class: features, data and UI design spec* (2026-11-03). Status is as of branch `feat/live-class-redesign`.
Paths are under `apps/web/src/features/live-class/components/` unless they start with `features/`.

**Status key.** *Reused*: kept as it was, already on spec. *Improved*: same component, restyled to spec. *Refactored*: structure changed. *Created*: new.

| # | Component | Spec size | Status | Where |
|---|---|---|---|---|
| 1 | Top bar | 56px, 48px phones | Refactored: own navy bar instead of the global `Header` | `meeting/ClassroomTopBar.tsx`, `meeting/MeetingTopBar.tsx` |
| 2 | Status chip | 28px, full radius | Created | `room-ui/StatusChip.tsx`; Live, Recording, connection in `meeting/MeetingStatus.tsx`; queue pill in `activity-queue/ActivityQueueStatusPill.tsx` |
| 3 | Control button | 44 × 44, 8px radius | Refactored (was a 40/48px circle) | `meeting/MeetingControlButton.tsx` |
| 4 | Leave | 44px tall | Created | `room-ui/LeaveButton.tsx` (dialog logic stays in `meeting/LeaveClassControl.tsx`) |
| 5 | Control bar | 60px, 16px radius | Refactored: hosted by the stage, overflow into More by priority | `room-ui/ControlBar.tsx`, `meeting/MeetingToolbar.tsx` |
| 6 | Student controls menu | 280px popover | Refactored from the five-button strip | `meeting/CoachRoomControls.tsx` (`StudentControlsMenu`, `StudentControlsList`) |
| 7 | Stage switch and panel tabs | 36px track, 28px chips | Created; adopted by stage switch, panel, side column, chat threads, phone switch | `room-ui/RoomTabs.tsx` |
| 8 | More menu | 200px | Refactored to a Radix menu with counts | `meeting/MoreControlsMenu.tsx` |
| 9 | Panel | 300–760px | Improved: raised surface, hairline, no toolbar padding | `meeting/classroom/ClassroomPanel.tsx` |
| 10 | Video tile | 16:9, 12px radius | Improved: navy fallback, scrim name, gold Coach tag, hand flag | `meeting/video-grid/VideoTile.tsx`, `meeting/ParticipantAvatar.tsx` |
| 11 | Board frame | square, 6px padding, 12px radius | Created around the existing board (sizing untouched) | `meeting/classroom/ClassroomBoard.tsx` (`data-board-frame`) |
| 12 | Board tools | 32px, 8px radius | Improved: moved under the board; students get flip only | `ClassroomBoard.tsx`; tools in `features/chessboard/components/toolbars/` |
| 13 | Chess clock | 32px chips | Improved: running blue, low time amber, spoken label | `features/chessboard/components/panels/ChessClock.tsx` |
| 14 | Engine summary | 52px row | Improved | `features/chessboard/components/panels/EngineEvalSummary.tsx` |
| 15 | Move list | 13px mono rows | Improved | `features/chessboard/components/panels/MoveTreeView.tsx` |
| 16 | People row | 48–64px | Refactored: badges, two actions, ⋮ menu, confirmed Remove | `meeting/MeetingParticipants.tsx` (`ParticipantListItem`) |
| 17 | Request row | 48px | Created; waiting room + screen-share requests, "Admit all" | `room-ui/RequestRow.tsx` |
| 18 | Chat | panel width | Improved | `meeting/MeetingChat.tsx`, `meeting/chat/*` |
| 19 | Leaderboard row | 48px | Improved: gold chip for the top three, avatar, You badge | `meeting/MeetingPuzzlePanel.tsx` |
| 20 | Puzzle card and tile | card or grid tile | Reused (tokens already on v2); text-size sweep | `meeting/MeetingPuzzlePanel.tsx`, `meeting/video-grid/PuzzleGridTile.tsx` |
| 21 | Live board tile | quarter of the stage | Improved: two per row, avatar, red wrong-move chips | `meeting/PuzzleLiveBoardsPanel.tsx` |
| 22 | Move poll | card | Reused (bars, mono, reveal rules already on spec) | `meeting/move-poll/*` |
| 23 | Queue step | 48px row | Refactored: number or tick, kind, Done / Now / Next / Could not start | `activity-queue/ActivityQueueManager.tsx` |
| 24 | Simul and match cards | grid of small boards | Improved: "Your move" in blue | `meeting/simul/SimulCoachView.tsx`, `meeting/match/MatchCoachView.tsx` |
| 25 | Interactive frame | stage size | Improved: "Students see this" / "Only you", Back to board | `meeting/interactives/InteractiveStage.tsx` |
| 26 | Mini player | 320 × 180 | Refactored: first size 320 × 180, controls on the scrim | `meeting/MiniPlayer.tsx`, `providers/PipProvider.tsx` |
| 27 | Entry screen | centred, 448px | Reused from M9b (`max-w-md`, round icon chip, 24/32 heading) | `states/ErrorStates.tsx`, `states/ClassroomStateShell.tsx` |
| 28 | Notices and toasts | inline or corner | Reused (green gained, grey neutral, amber taken away) | `lib/meetingToasts.ts`, `meeting/MeetingEventToasts.tsx` |

Internal primitives that are not in the inventory: `room-ui/ControlBar.tsx` (`ControlBarDivider`), `meeting/classroom/StageHeader.tsx`, the `rounded-chip` (6px) radius token.

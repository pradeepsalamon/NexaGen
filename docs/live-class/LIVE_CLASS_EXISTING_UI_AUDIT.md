# Live class: audit of the room before the redesign

Snapshot of `dev` at 1f811203 (2026-11-03), the base of `feat/live-class-redesign`. Short on purpose: [docs/LIVE_CLASS.md](../LIVE_CLASS.md) is the full technical reference.

## Stack

- Next.js 15 / React 19, Tailwind on the v2 tokens (`src/styles/globals.css`, `tailwind.config.ts`), Radix primitives in `components/ui/`.
- Room state: a Zustand store per room (`providers/LiveClassProvider.tsx`, read with `useLiveClassState("a", "b")` selectors) and the board store (`features/chessboard/context/BoardProvider`).
- Media: LiveKit (`@livekit/components-react`), mounted once in `components/room/MeetingRoom.tsx`; rosters through `useRoster()` / `useGridTracks()`.
- Real time: LiveKit data topics (board sync, chat, hand raise, reactions as peer topics; API-only topics drop packets that carry a sender). Every decision goes through the API first.
- Routes: `/live-class/[roomId]` (members), `/demo/[classId]` (guests), `/live-class/[roomId]/board` (legacy board), `/recorder/*` (egress, untouched).

## Layout (unchanged by the redesign)

- Below 768px: `PhoneStage` (video grid with a board tile; the board, a puzzle or a tool takes the stage when opened) and full-height sheets (`MeetingSidebar`).
- From 768px: `ClassroomLayout`, a stage beside the panel (`room` screen = `ROOM_ROW_QUERY`), stacked on tall tablets. The coach's side column (Chapters/Members over Leaderboard/Chat) appears only when the spare width fits 320px.

## What did not match the spec

| Area | Before |
|---|---|
| Top bar | The global 64px app header with slots; no batch or head count; one colour-coded "Live" pill doubled as the connection signal |
| Controls | Round 40/48px buttons with scale-on-hover; muted mic and camera as solid red; Leave as an icon circle |
| Control bar | Floated over the whole page; below 1280px it covered the bottom of the panel |
| Coach class controls | A five-button strip at the top of the panel |
| Tabs | Three different tab styles (stage pills, panel icon tabs, side-column pills); every tab shown, so rows scrolled |
| Board | Stage-switch row above the board held the tools; no frame |
| People | Row icons for every action; board control as a crown popover; Remove as a popover |
| Requests | Round tick and cross icons |
| Type | 76 sizes below 12px (`text-[8px]` to `text-[11px]`), fixed pixel sizes |
| Badges | Unread counts in red (red is reserved for Live, Recording and destructive actions) |

Everything else (permissions, data rules, packet handling, recording, PiP mechanics, the activity engines) was already right and was left alone.

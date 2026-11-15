# Live class redesign: roadmap

Branch `feat/live-class-redesign`, 2026-11-03. One part per commit, each verified before the next.

| Part | Scope | State |
|---|---|---|
| 9a | Chess surfaces: board panels, clock, engine, move list | Done (`acdfd976`) |
| 9b | Entry states: pre-join, waiting, errors, summary | Done (`ece978b5`); 448px for waiting/error, pre-join kept two-column (BACKLOG) |
| 9c | Chrome: top bar, status chips, 44px controls, control bar with overflow, stage switch, panel tabs, Students menu | Done (`ccf8a174`, `cc26cb91`) |
| 9d | People rows + ⋮ menu, request rows, Admit all, chat | Done (`8ce58107`) |
| 9e | Leaderboard, live boards, queue steps, simul/match "Your move" | Done (`8ce58107`) |
| 9f | Interactive frame, mini player 320 × 180, text-size sweep | Done (`8ce58107`) |
| QA | Browser pass at 360–1920, light + dark, coach + student | Done; see TEST_REPORT |

## Still open

1. **A real class** (coach + students on real devices, real network). Every part of M9 needs one before `dev`.
2. **The seven spec decisions** in BACKLOG § "Questions for the owner": the Proposed option is built for each. Changing one is a local edit (variant, `maxVisible`, menu vs buttons).
3. **No backend for**: a coach lowering a hand, and allowing a screen share without a request (BACKLOG).
4. **The Playwright e2e suite** was not run on this branch. Its live-class specs look up controls by accessible name; names that changed are listed in TEST_REPORT.
5. **Not in this pass**: a shared `BoardFrame` for every board outside the room, plus the legacy board's `SidebarTabs` underline tabs outside the room.

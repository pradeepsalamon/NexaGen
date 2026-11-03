# Live class redesign: test report

2026-11-03, branch `feat/live-class-redesign`. Everything ran against an isolated stack:
- the `nexa_gen_int` database;
- a private LiveKit on :7990;
- the API on :3201 and the web app on :3200.

No production or `vps_dev` data was touched.

## Automated

| Check | Result |
|---|---|
| `tsc --noEmit` (web) | Clean |
| `eslint src/features/live-class` | 0 errors, 1 warning that was already there (`<img>` in `ParticipantAvatar`) |
| `next build` (web, production) | Passed |
| API Jest, live-class + security suites | 19 suites, 287 tests passed |
| New: `live-class-start-window.spec.ts` "getLiveClass top-bar fields" | Passed (`batchName` returned, no `batch` relation leaked) |

## Browser (Playwright, a real coach and a real student in one LiveKit room)

Sizes covered:
- coach: 1920 × 1080, 1440 × 900, 1280 × 800, 1024 × 768, 768 × 1024, 430 × 932, 390 × 844;
- student: 1920 × 1080, 1280 × 800, 390 × 844, 360 × 740.

Each was checked in light and dark. **Horizontal overflow: 0 at every size.**

Exercised end to end:
- join from pre-join;
- top bar chips and the head count;
- the control bar fitting and overflowing into More;
- the Students menu, More menu and reactions in More;
- raise hand (shown on the tile and in People);
- room chat send and receive;
- the phone Board / Video switch with the coach popup;
- the coach shares a puzzle; the student's Puzzle stage, leaderboard and solve board;
- the coach's Live boards and Activity tabs;
- the Interactives grid from the control bar;
- coach Leave → "End class for everyone" → the student lands on the class summary.

## Not tested

- **The Playwright e2e suite** (`e2e/live-*.spec.ts`) was not run. The control bar's accessible name changed from "Meeting controls" to "Class controls", and both specs were updated to match. `live-board-sync.spec.ts` also looks for "Share board", "Grant board control" and "Participants" buttons. None of those exist on `main` either: the spec was already stale before this branch.
- A **real class**: real devices, several students, a weak network, iOS Safari, touch tablets.
- **Recording**, simul, matches, move poll, the activity queue running live, PiP / mini player in Chromium's document PiP, the waiting room with real knocks, screen-share requests, and spectator / demo guest views were not run live. They were type-checked and built only.
- **Screen reader** pass (VoiceOver / NVDA). Keyboard was checked only for the tabs and menus (arrow keys, Escape).

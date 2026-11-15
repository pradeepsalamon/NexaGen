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

## 2026-11-04 re-test (merged into `dev`, with the follow-ups)

Same kind of isolated stack (`nexa_gen_int`, private LiveKit with `node_ip` set to the host's LAN address, web :3110, API :3111).

- **API:** 184 suites, 2,782 unit tests; 33 suites, 530 integration tests, including the new cross-user rows for lower hand and grant share.
- **Browser QA, 16/16:**
  - the coach's phone Board tab with its header tools;
  - the promotion picker drawing the user's piece set;
  - the coach lowering a student's hand (the student gets a toast);
  - the coach allowing a share unasked (the student gets a toast);
  - the new LiveClassFab in light and dark.
- **Playwright e2e suite, one spec at a time:** 11 of 12 specs, 45 tests, passed: `live-board-sync`, `live-board-recovery`, `live-class-puzzle`, `pre-class-settings`, `puzzle-activities`, `recording-flow`, `attendance-flow` and the rest. The specs were brought up to date with the redesign in the same change (People-tab member menu, Board stage, tabs under "More views"). `analysis-board` fails only at "Save to Cloud", which needs Cloudinary credentials (BACKLOG P2).

## Not tested

- **The Playwright e2e suite** (`e2e/live-*.spec.ts`) was not run on 2026-11-03 (it was on 2026-11-04, above). The control bar's accessible name changed from "Meeting controls" to "Class controls", and both specs were updated to match. `live-board-sync.spec.ts` also looks for "Share board", "Grant board control" and "Participants" buttons. None of those exist on `main` either: the spec was already stale before this branch.
- A **real class**: real devices, several students, a weak network, iOS Safari, touch tablets.
- **Recording**, simul, matches, move poll, the activity queue running live, PiP / mini player in Chromium's document PiP, the waiting room with real knocks, screen-share requests, and spectator / demo guest views were not run live. They were type-checked and built only.
- **Screen reader** pass (VoiceOver / NVDA). Keyboard was checked only for the tabs and menus (arrow keys, Escape).

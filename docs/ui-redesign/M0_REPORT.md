# M0 summary

Branch `redesign/design-system-v2`, merge commit `173a1771` (local, not pushed). 0 commits behind `main` and `dev`.

| Check at `173a1771` | Result |
|---|---|
| Migrations from empty | 111 applied, no drift |
| Typecheck, lint | Pass; lint has 0 errors, 19 API `any` warnings in the last full run |
| API unit tests | 183 suites passed, 2 skipped; 2,762 tests passed, 8 skipped |
| Integration tests | 31 suites passed, 1 skipped; 512 tests passed, 2 skipped |
| E2E | 22 passed, 9 failed, 8 skipped, 8 did not run. None traced to the merge: 4 need LiveKit, 3 have labels already out of date on `main`, 2 pass when run alone |
| Baseline screenshots | 1,858 of 2,664 in `scripts/responsive/shots/m0-baseline/` (gitignored). Public, student and coach complete. Admin stopped early: no dark shots, light incomplete |

Not run: LiveKit e2e specs and the real-class script, because Docker and LiveKit were not available.

## Open items

| # | Item | Recommendation |
|---|---|---|
| N1 | The drawer's Chess Rating card is gone on `dev`, so students don't see their rating on their dashboard | Show it on the dashboard during M5 |
| N2 | `Lead.email` (schema, API, migration `20261029060503_lead_email`) reaches `main` through this branch | Keep: additive and already on `dev` |
| N3 | Owner's body 16/24 differs from v2's 14/20 | Applied in M1 |
| N4 | Header colour: v2 says navy, the Patterns board shows white | Decided by the owner: navy |
| N5 | Only raster logos exist | Skipped by the owner, 2026-11-02: the app keeps the PNGs and M3 is unblocked |

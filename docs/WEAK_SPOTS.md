# Weak spots

What a student keeps missing in their play, judged by the chess engine, with
example positions. **Phase A built 2026-11-26** (coach / admin tab); phases B–C
are in [WEAK_SPOTS_PLAN.md](WEAK_SPOTS_PLAN.md).

## Where things are

| Piece | Path |
|---|---|
| The rule (pure, shared) | `packages/types/src/weak-spots.ts`: `buildWeakSpotProfile`, `WEAK_SPOT_THRESHOLDS`, `WEAK_SPOT_LICHESS_THEMES`, `WEAK_SPOT_TIPS` |
| Chance counts per review | `play-review/play-review.rules.ts` `buildPlayReview` → `ai_play_reviews.tacticsJson` |
| API | `play-review/weak-spots.service.ts`, `GET API_ROUTES.playReview.weakSpots(id)` |
| Web | `features/weak-spots/` (`WeakSpotsPanel`), tab **Weak spots** in `StudentProgressWorkspace` (staff view only) |
| Tests | `weak-spots.rules.spec.ts`, `weak-spots.service.spec.ts`, `play-review.job.spec.ts`, `play-review.int-spec.ts`, access rows |

## The rule

- **Source**: the nightly play review ([AI_PLAY_REVIEW.md](AI_PLAY_REVIEW.md))
  of every board the student played: class board, Storm/Racer, homework,
  puzzles, matches, tournaments, own and imported games. Game-analysis rows are
  **not** added on top: the same games are already `OWN_GAME` play items, so
  they would count twice.
- **Chances, not games**: each review stores, per tactic motif, how often the
  student had the chance and found it / missed it / played an alternative that
  cost less than a mistake, and how often their own move handed the opponent
  one (`tacticsJson`, the same counting as game analysis's `MotifStats`).
- **Weak spot** = at least 5 chances, missed ≥ 50 %, ≥ 3 misses, in ≥ 3
  different items (the "recurring weakness" bar of game insights).
  **Strength** = at least 5 chances, found ≥ 70 %. Fewer chances: "not enough
  to judge". Top 3 of each; weak spots ranked by misses × average loss.
- **Window**: the last 60 days; **trend** = the latest 30 days vs the 30 before,
  only with 5+ chances in both, ±15 points of miss rate.
- **Puzzles**: finished attempts in the window whose themes match the motif
  (`WEAK_SPOT_LICHESS_THEMES`), clean solves among them. MATERIAL_GAIN has no
  theme.
- **Examples**: the review's MISSED_TACTIC findings of that motif, newest
  first, one per item, at most 3; the API adds the played and best moves as
  UCI for the board arrows (dropped when the SAN doesn't play from the FEN).
- Computed on every read; nothing is stored about the profile itself.

## Older reviews

Reviews written before 2026-11-26 have `tacticsJson = NULL`. The nightly job
reviews them again **after** all new play, within its usual caps
(`unreviewedSql` returns `refresh = true` for them). A refresh the engine can't
do keeps the old review and sets `tacticsJson = {}` so it isn't retried. Until
then their misses show as examples, and the motif shows "Not counted yet".

## Access and plans

- Phase A: the student's coach (`assertCanViewStudent`) and admins; a student
  gets 403, even for their own (WS-1: the student card is phase B).
- No plan feature of its own (WS-2): it reads the play review, which runs only
  where the academy's plan has `aiPlayReview` and the engine review is on.

## Decisions (2026-11-26, owner: "go with recommended")

WS-1 coach + admin first, student card in B · WS-2 no separate gate (the
deterministic part follows the engine review) · WS-3 AI notes later, Groq with
consent, after the recap test · WS-4 tips written by us, a coach reviews them
before students see them · WS-5 Make homework creates a draft · WS-6 60 days.

## Rolling back

Additive only: one nullable column (`20261126151542_play_review_tactic_stats`).
Rolling the image back leaves the column unused.

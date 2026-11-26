# Weak spots

What a student keeps missing in their play, judged by the chess engine, with
example positions. **Phase A built 2026-11-26** (coach / admin tab); **phase B
built 2026-11-26** (tip reading, Make homework, the student's card, training
aimed at the weak spot). Phase C (AI coach notes) and the rest of phase B's
plan (weekly snapshot, batch view) are in [WEAK_SPOTS_PLAN.md](WEAK_SPOTS_PLAN.md).

## Where things are

| Piece | Path |
|---|---|
| The rule (pure, shared) | `packages/types/src/weak-spots.ts`: `buildWeakSpotProfile`, `resolveWeakSpotTip`, `WEAK_SPOT_THRESHOLDS`, `WEAK_SPOT_LICHESS_THEMES`, `WEAK_SPOT_TIPS`, `weakSpotHomeworkBands`, `weakSpotTrainingThemes` |
| Chance counts per review | `play-review/play-review.rules.ts` `buildPlayReview` → `ai_play_reviews.tacticsJson` |
| Profile loader (shared by the API services) | `play-review/weak-spot-profile.ts` `loadWeakSpotProfile` (a plain function, so puzzle training and weekly reports use it without a module cycle) |
| API | `play-review/weak-spots.service.ts`; routes `API_ROUTES.playReview.weakSpots(id)`, `.weakSpotsMine`, `.weakSpotHomework(id)`, `.weakSpotTips`, `.weakSpotTip(motif)` |
| Tip readings | `weak_spot_tip_reviews` (`WeakSpotTipReview`, one row per academy and motif) |
| Training | `puzzle/puzzle-training.service.ts` (`weakSpot` request, WEAK slot, `pickPracticePuzzles`); policy `weakSpotTheme` in `puzzle-training.ts` |
| Web | `features/weak-spots/`: `WeakSpotsPanel` (tab **Weak spots** in `StudentProgressWorkspace`, staff), `WeakSpotTipsDialog`, `WeakSpotDashboardCard` (student dashboard); `/student/training?weakSpot=<MOTIF>`; `?edit=<assignmentId>` on the assignments pages |
| Tests | `weak-spots.rules.spec.ts`, `weak-spots.service.spec.ts`, `puzzle-training.service.spec.ts`, `play-review.job.spec.ts`, `play-review.int-spec.ts`, access rows |

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

## Tips (WS-4)

Each motif has a short, child-friendly tip (`WEAK_SPOT_TIPS`, written by us).
**A student sees a tip only after a coach or admin of their academy read it**
(staff tab → **Tips students see**). The reader may keep our wording or write
the academy's own (20–400 characters); one reading counts for the whole
academy. `resolveWeakSpotTip` is the one rule:

- no reading → `NOT_READ`, the student gets no tip (the card still shows the
  weak spot and the Practise button);
- a reading whose `baseText` is today's built-in text → `READ`, the student
  sees the reading's `text`;
- a reading of an older built-in text → `CHANGED`: hidden again until someone
  reads the new wording. So **changing a text in `WEAK_SPOT_TIPS` asks every
  academy to read it again.**

"Hide from students" deletes the reading. Staff always see a tip (the
academy's wording when read), with a note when the student doesn't.

## Make homework (WS-5)

On each weak spot with puzzle themes, **Make homework** (coach or admin of the
student) creates a **puzzle-set assignment in the author's library, assigned to
nobody**, and opens it in the assignments page (`?edit=<id>`) to check and then
assign to a batch.

- Puzzles: `PuzzleTrainingService.pickPracticePuzzles` — 10 by default (3–20),
  the motif's Lichess themes in turn, rating bands from 100 below to 150 above
  the student's puzzle rating (nearest first), quality-gated, **never one the
  student has opened** (by id or content). Catalogue copies land in the hidden
  Lichess folder (GLOBAL), then the academy's own GLOBAL published puzzles —
  never a coach's private puzzle or a game puzzle, so an admin's set (a shared
  library item) can hold them too.
- Saved through `AssignmentService.create`, so every assignment rule applies
  (409 when nothing new is found; 400 for MATERIAL_GAIN, which has no theme).
- **The title and description never name the student** ("Fork practice";
  "Puzzles on fork, around puzzle rating 1320." + the built-in tip): the set
  may go to the whole batch, and students see the description.

## The student's card and training

- `GET API_ROUTES.playReview.weakSpotsMine` (students only): the same profile
  with `audience: "STUDENT"` — tips only once read, `others` empty.
- Dashboard card **Your weak spot** (`WeakSpotDashboardCard`, hidden while
  there is none): the top weak spot, misses of chances, "Getting better" when
  the trend says so, the tip once read, the next weak spots and the top
  strength. **Practise** (only when their batch allows puzzle training) opens
  `/student/training?weakSpot=<MOTIF>`: every pick on that motif's themes in
  turn, with a banner back to the usual mix.
- The ordinary mix: training's WEAK slots (half of all picks, and a REVIEW slot
  with nothing due) now aim at the profile's weak-spot themes first
  (`weakSpotTheme`, worst weak spot first, rotated, only themes open at the
  rating), then the weakest puzzle theme as before. A profile that can't be
  read never blocks a pick.

## Access and plans

- Staff view, tips and Make homework: the student's coach
  (`assertCanViewStudent`) and admins; a student gets 403 there.
- The card: the student themselves only (`weakSpotsMine`); a coach gets 403.
- No plan feature of its own (WS-2): it reads the play review, which runs only
  where the academy's plan has `aiPlayReview` and the engine review is on.

## Decisions (2026-11-26, owner: "go with recommended")

WS-1 coach + admin first, student card in B · WS-2 no separate gate (the
deterministic part follows the engine review) · WS-3 AI notes later, Groq with
consent, after the recap test · WS-4 tips written by us, a coach reviews them
before students see them (built as a per-academy reading, rewording allowed) ·
WS-5 Make homework creates a draft · WS-6 60 days.

## Older reviews

Reviews written before 2026-11-26 have `tacticsJson = NULL`. The nightly job
reviews them again **after** all new play, within its usual caps
(`unreviewedSql` returns `refresh = true` for them). A refresh the engine can't
do keeps the old review and sets `tacticsJson = {}` so it isn't retried. Until
then their misses show as examples, and the motif shows "Not counted yet".

## Rolling back

Additive only: `20261126151542_play_review_tactic_stats` (one nullable column)
and `20261126160428_weak_spot_tips_weekly_reports` (new tables). Rolling the
image back leaves them unused.

# Weak spots and practice picks — plan

**Status: phases A and B built 2026-11-26 ([WEAK_SPOTS.md](WEAK_SPOTS.md));
from B, the weekly snapshot (`StudentWeakSpotWeek`, trend chart) and the batch
view are not built; C not started.** Owner 2026-11-26: "go with recommended" for WS-1…WS-6. Phase A
differs from §3.2 in one way: game-analysis rows are not added (the same games
are already play-review `OWN_GAME` items), and older reviews get their chance
counts by a nightly re-review. Roadmap phase 4
("chess explanations and deterministic recommendations",
[ai/architecture/ROADMAP.md](ai/architecture/ROADMAP.md)), narrowed to what the
data we already collect can support. Owner decisions are at the end (WS-1…WS-6).

## 1. Goal

For every student, one answer to "what keeps going wrong, and what should they
practise next?", that a coach can trust and act on in one click:

- **Coach**: the student's top weak spots with evidence (how often, in which
  play, example positions), their strengths, and whether each is getting
  better; "Make homework" turns the picks into a puzzle-set draft.
- **Student**: "Your weak spots this week" with a Practise button.
- **Weekly report** ([FAMILY_PROGRESS_REPORT_PLAN.md](FAMILY_PROGRESS_REPORT_PLAN.md))
  reuses the top weak spot and strength.

The engine decides what is wrong; nothing is guessed by a language model. AI
(optional, phase C) only puts the engine's findings into words.

## 2. What already exists (reuse, don't rebuild)

| Piece | Where | What it gives us |
|---|---|---|
| Play feed + nightly engine review | `play-review/`, [AI_PLAY_REVIEW.md](AI_PLAY_REVIEW.md) | `ai_play_reviews.findingsJson` for all 10 play sources (class board, Storm/Racer, assignments, matches, tournaments, own games…): BLUNDER / MISTAKE / INACCURACY / MISSED_MATE / MISSED_WIN / MISSED_TACTIC with `motif`, `fenBefore`, `bestMoveSan`, `winPercentLoss` |
| Game insights | `game-analysis/insights.ts` `aggregateInsights`, [GAME_ANALYSIS.md](GAME_ANALYSIS.md) §8 | Per-motif opportunities / misses over analysed games, "recurring weakness" and "strength" thresholds (`INSIGHT_THRESHOLDS`), phase error rates, accuracy trend |
| Puzzle training | `packages/types/src/puzzle-training.ts` | Per-theme results of rated practice; a `WEAK` slot (half of all picks) near the student's puzzle rating |
| Lichess catalogue | `LichessPuzzle` (6.15M, `themes`, `ratingBand`, `randKey`), [PUZZLE_CATALOGUE_IMPLEMENTATION_SPEC.md](PUZZLE_CATALOGUE_IMPLEMENTATION_SPEC.md) §6–7, §11 | Theme + rating picks without `ORDER BY random()`, "not seen before", adoption into a course/assignment |
| Own-mistake puzzles | `revisionEligibility`, `PuzzleSource.GAME`, [SMART_REVISION.md](SMART_REVISION.md) | A missed tactic with a verifiable answer becomes a private puzzle for that student |
| Motif names | `TACTIC_MOTIFS` (`game-tactics.ts`), `lichess-themes.ts` | Two vocabularies, no mapping between them yet |

**The gap**: these four sources are never combined, the motif and Lichess theme
vocabularies don't meet, and a coach has no single screen or one-click action.

## 3. Design

### 3.1 One vocabulary: weak-spot keys

A new pure table in `@nexa-chess/types` `weak-spots.ts`:

- `WEAK_SPOT_KEYS`: the tactic motifs (FORK, PIN, SKEWER, HANGING_PIECE,
  BACK_RANK_MATE, DISCOVERED_ATTACK, …) plus a few non-motif keys the data
  supports: `MISSED_MATE`, `BLUNDER_UNDER_TIME` (only where clocks exist),
  `OPENING_ERRORS`, `ENDGAME_ERRORS` (phase rates from game analysis).
- `WEAK_SPOT_LICHESS_THEMES`: key → Lichess theme keys (FORK → `fork`;
  BACK_RANK_MATE → `backRankMate`; MISSED_MATE → `mateIn1`, `mateIn2`;
  ENDGAME_ERRORS → `endgame`; …). A spec checks every key maps to at least one
  real theme.
- Labels and a one-line, child-friendly "what it means / how to practise"
  text per key (written by us, reviewed by a coach — WS-4). This is the
  explanation in phases A–B; no model.

### 3.2 The profile: computed, never guessed

`buildWeakSpotProfile(signals, now)` — pure, in `@nexa-chess/types`, unit-tested:

- **Signals** (loaded by `WeakSpotService`, each capped, last 60 days):
  play-review findings, game-analysis side rows (per-motif opportunities /
  misses), puzzle-training attempts by theme, Smart Revision lapses.
- **Denominators are opportunities**, as in game insights: a motif the student
  never met is "not enough data", not "strong".
- **Weak spot** = miss rate ≥ 50 % **and** ≥ 3 misses **in** ≥ 3 different
  items (games / puzzles / boards), the same bar as "recurring weakness".
  **Strength** = ≥ 5 opportunities, found ≥ 70 %. Thresholds in one constant
  (`WEAK_SPOT_THRESHOLDS`), shared with the existing insight thresholds where
  they mean the same thing.
- Ranked by misses × average `winPercentLoss` (how much it costs them), top 3
  shown; each carries up to 3 example positions (links to the item at that ply).
- **Trend**: this 30 days vs the 30 before (same thresholds, "better / same /
  worse" only when both windows have enough data).
- Every number shown says where it came from ("5 of 8 forks missed — class
  board, Storm, 2 games").

Computed on read (like pending feedback and the streak: never stored), with a
weekly snapshot row (`StudentWeakSpotWeek`: student, week, top keys + counts,
JSON ≤ 2 KB) written by the nightly job on the academy's Sunday — only for the
trend chart and the weekly report, never as a source of truth.

### 3.3 Practice picks (deterministic)

`pickWeakSpotPractice(profile, student)` per top weak spot:

1. **Their own missed positions first**: findings that pass
   `revisionEligibility` → offered as "Add to Smart Revision" (creates the
   `GAME` puzzle, the existing flow).
2. **Catalogue puzzles**: the key's Lichess themes, rating band around the
   student's puzzle rating (−100…+150), unseen, quality-gated — the
   puzzle-training picker's filters, not a new query.
3. Each pick has a "why" line from the key's text ("Forks: missed 5 of 8 in
   the last month").

### 3.4 Where it shows

- **Coach / admin**: student progress workspace → new **Weak spots** tab
  (`StudentProgressWorkspace`): top 3 + strengths + trend + examples;
  **Make homework** → a PUZZLE_SET assignment **draft** with the picks (catalogue
  adoption §11 + `AssignmentPuzzle`), opened for the coach to edit and publish.
  Batch view (phase B): the batch's most common weak spots, for planning a
  class topic.
- **Student**: a card on the dashboard / Insights page with the top weak spot
  and **Practise** → puzzle training with the `WEAK` slot fed from the profile
  (today it uses puzzle-attempt themes only).
- Access: `assertCanViewStudent` (coach = own batches, admin = academy,
  student = self); a row per new id-taking route in
  `cross-user-access.int-spec.ts`.

### 3.5 AI explanation (phase C, optional)

A short paragraph per weak spot for the **coach** ("In 3 of the 5 missed forks
the knight was the forking piece; the student moved the attacked queen and
missed the reply…"), from the counts + up to 2 example positions with the
engine's best line:

- route via `resolveAiFeatureRoute` (new `AI_FEATURES` row `weakSpotNotes`),
  `completeOnRoute`, Auto = Groq;
- **every SAN in the answer is replayed from the FEN** and the answer is
  dropped if one is illegal (roadmap phase 4 acceptance: 0 illegal moves);
  names never sent (positions + counts only);
- positions of a student's play going to an outside service is exactly what
  the play-review consent covers, so **only for students whose outside-AI
  switch is on, and only to the providers their consent named** — or with the
  local model (WS-3).

## 4. Phases

| Phase | Ships | Size |
|---|---|---|
| **A** | `weak-spots.ts` (keys, theme map, texts, thresholds, `buildWeakSpotProfile`), `WeakSpotService` + `GET /students/:id/weak-spots` and `/me/weak-spots`, coach **Weak spots** tab, student card (read only) | 1 session |
| **B** | Practice picks, **Make homework** draft, student Practise → training `WEAK` slot, weekly snapshot + trend, batch view | 1 session |
| **C** | AI coach notes behind consent / local model (WS-3) | ½ session |

Each phase: additive migration only (B: `student_weak_spot_weeks`), plan
feature gate (WS-2), unit specs for every pure rule, int-spec for the queries,
access rows, `npm run shots` for the tab and card, docs (`docs/WEAK_SPOTS.md`
replaces this plan; CLAUDE.md gets a 2-line §3.6 entry).

## 5. Risks

- **Thin data early on**: many students have few reviewed items. The
  thresholds say "not enough data yet" instead of guessing; the tab shows what
  would make it work ("3 more reviewed games").
- **Play review runs nightly**: a weak spot appears the day after the play.
- **Catalogue themes are Lichess's**: some motifs (REMOVAL_OF_DEFENDER,
  INTERMEDIATE_MOVE) map to `capturingDefender` / `intermezzo`; MATERIAL_GAIN
  has no clean theme and is shown but not practised from the catalogue.

## 6. Owner decisions

- **WS-1 Who sees it**: coach + admin only in phase A, student card in B
  (recommended), or students from the start?
- **WS-2 Plan**: a new feature `weakSpots` on Enterprise only (like
  `aiPlayReview`), or on every plan with the AI notes Enterprise-only
  (recommended: the deterministic part on every plan — it's our engine, no
  outside cost)?
- **WS-3 AI notes**: skip, local model only, or outside (Groq) for consenting
  students only (recommended: Groq + consent, after the recap test)?
- **WS-4 The per-key texts**: written by me, reviewed by a coach before
  release (recommended), or written by a coach?
- **WS-5 Make homework**: a draft the coach publishes (recommended) or publish
  directly?
- **WS-6 Window**: last 60 days (recommended) or 30 / 90?

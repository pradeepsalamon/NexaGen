# Smart Revision (spaced repetition)

Students revise puzzles they got wrong and topics their coach picked, each one
brought back just before they would forget it. Built 2026-10-16 (Priority 5).

- Contract + scheduler: `packages/types/src/revision.ts` (pure, shared)
- API: `apps/api/src/revision/` (`RevisionService`, `RevisionController`)
- Web: `apps/web/src/features/revision/`, page `/student/revision`, dashboard
  card, and a **Revision** tab in the progress workspace (student's own
  `/student/progress`, coach `/coach/students/[id]`, admin `/admin/students/[id]`)
- Schema: `RevisionItem`, `RevisionReview`, enum value `PuzzleAttemptContext.REVISION`
  (migration `20261019100000_smart_revision`)

## What can be revised

| Item kind | What it references | How it is reviewed | Where it comes from |
|---|---|---|---|
| `PUZZLE` | one library `Puzzle` (FK, Cascade on a Trash purge) | solve that puzzle | the student's own mistakes (seeded), or a coach/admin recommendation |
| `TOPIC` | one `PuzzleTopic` folder (FK, Cascade) | solve one of its published puzzles (subfolders included) — never-opened ones first, rotating, else the one met longest ago | coach/admin recommendation ("concept") |

Nothing is copied: no FEN, no solution line, no answer key is stored on an item.
Every review is an ordinary `PuzzleAttempt` with `context: REVISION`, graded by
`PuzzleAttemptService` on the same routes as practice and training — there is no
second solver.

**Mistakes** are seeded on read (`syncMistakes`, on the dashboard summary,
session, next and report) from the student's finished attempts that show one:

- `FAILED` after actually trying (at least one move played, or a wrong move), or
- `SOLVED` with at least one server-counted wrong move.

Not a mistake: a solve that only used a hint, "view solution" with no move
played, a training skip. Nothing is seeded from a homework puzzle set the
student can still retry (its `StudentAssignment` isn't `COMPLETED`). A seeded
item is first due at local midnight the day after the (first) miss. The unique
`(studentId, contentKey)` (`puzzle:<id>` / `topic:<id>`) makes seeding
idempotent — and a recommendation a coach removed (`status: REMOVED`) is never
re-seeded.

Seeding is **bounded and incremental**: one SQL query applies every rule above
*and* "this puzzle has no item yet", so each row it returns becomes an item. A
call seeds at most `MISTAKE_BATCH` (200) puzzles, newest misses first, and the
next call carries on — a long history is covered completely over a few loads,
and newer non-mistakes (e.g. hundreds of "view solution" give-ups) can't crowd
older mistakes out. (The first version scanned the newest 500 candidate rows
and filtered afterwards, which could exclude older mistakes for good — fixed in
the 2026-10-16 pre-release review.) Cost per call: one query over that
student's own completed attempts, using the `(studentId, …)` indexes.

**Deferred** (documented limitation): lessons / PGN `REPLAY` assignments,
course modules and live-class chapters. None has an objectively graded
attempt to cap a self-rating with, and chapters are coach-only because a saved
line can hold a puzzle answer. They can be added as new item kinds later.

## The scheduling algorithm

`scheduleRevision()` in `packages/types/src/revision.ts` — deterministic, every
number in `REVISION_POLICY`. A simplified SM-2:

| State field | Meaning |
|---|---|
| `intervalDays` | current interval, whole days; 0 while (re)learning |
| `easeFactor` | ×100, starts 250, clamped 130–300 |
| `repetitions` | successful reviews in a row since the last Again |
| `lapses` | times graded Again |
| `reviewCount` | reviews in all |

| Grade | First success (or first after a lapse) | Later | Ease |
|---|---|---|---|
| **Again** | back in **10 min**; from the item's **2nd Again in one local day**, at tomorrow's local midnight (no immediate retry loop) | interval → 0, repetitions → 0 | −20 |
| **Hard** | **1 day** | interval × 1.2 (min 1 day) | −15 |
| **Good** | **3 days** | interval × ease (at least +1 day) | 0 |
| **Easy** | **7 days** | interval × ease × 1.3 (at least +1 day) | +15 |

Intervals are capped at 180 days. A day-scale due date lands on **local
midnight in the student's own `User.timezone`** (DST-correct), so "due today"
means the whole of that day where the student lives. Missing / NaN / negative
state is treated as a new item. Good, Good, Good, Good from new gives 3 → 8 →
20 → 50 days; three Agains first lowers the ease, so the same Goods afterwards
give shorter intervals.

### Grades are capped by the graded attempt

`revisionOutcome()` → `allowedRevisionGrades()`:

| What the server graded | Student may pick | Button focused first (UI only — never recorded on its own) |
|---|---|---|
| not solved (`FAILED`) | Again only | Again |
| solved with a hint or a wrong move (`ASSISTED`) | Again, Hard | Hard |
| solved cleanly (`CLEAN`) | Again, Hard, Good, Easy | Good |

A self-rating can lower the grade but never raise it past the evidence. The
API enforces this (`POST /revision/me/review` → 400); the buttons the UI
disables are only a convenience.

### Due status and session order

`revisionDueStatus()`: `NEW` (never reviewed, its time has come), `OVERDUE`
(due before today began), `DUE` (due now), `LATER_TODAY` (an Again coming back
later today), `SCHEDULED`.

`orderRevisionQueue()`: due reviews first, most urgent first —
`(now − dueAt) / interval + 0.25 × lapses + 0.5 if a coach recommended it` —
then never-reviewed items (coach picks first, oldest first), at most
`newPerDay` (10) introduced per local day. Items skipped today go last. A
session is at most `sessionLimit` (20); the rest of a backlog **stays due** and
the page says how many are waiting. Ties break on id.

### Long-term recall (the only "mastery" label)

`hasLongTermRecall()`: **3+ successful reviews in a row with the current
interval ≥ 21 days**. Never from a single correct answer. Shown as "long-term
recall", with the criteria in the UI.

## Flow and race safety

1. `GET /revision/me/session` — summary + queue (no FEN / line / title of an
   unseen puzzle) + the open item, if any.
2. `POST /revision/me/next` — returns the open item, else opens a `REVISION`
   attempt for the queue head. The check-create-claim runs in one transaction
   holding the item's row lock (`SELECT … FOR UPDATE`), so racing calls (a
   double click, two tabs) queue behind each other: the first opens the
   attempt, the rest resume it. No attempt is created and thrown away.
3. The web solver runs `POST /puzzles/:id/attempts` (resumes that attempt),
   `PATCH …/:attemptId` per move (wrong moves counted server-side), `POST …/submit`.
4. `POST /revision/me/review { attemptId, grade }` — refuses an unfinished
   attempt or a grade above the cap; schedules and logs in one transaction,
   claimed by `updateMany where currentAttemptId = attemptId`;
   `revision_reviews.attemptId` is unique. A replay returns the recorded review
   (same grade), never a second one.
5. `POST /revision/me/skip { itemId }` — back of today's queue, schedule
   untouched; the attempt is closed `ABANDONED`. If a wrong move had already
   been played, it is recorded as Again instead (the evidence isn't erased).

**A missing rating is never inferred.** An item whose attempt finished but was
never rated (the tab closed) stays open: `session` / `next` return it first
with `pendingRating` (the server-graded outcome and the grades it accepts), the
page asks only for the rating, and nothing about its schedule changes until the
student answers. It can't be skipped past (409) — rating a missed puzzle is a
single "Again". (The first version recorded the outcome's default grade, which
turned a closed tab into a "Good" for a clean solve — fixed in the 2026-10-16
pre-release review.) The rating buttons always come from `pendingRating`; the
browser never works out which grades are allowed.

An item whose puzzle was
archived, unpublished, soft-deleted or is no longer visible to the student
(e.g. a coach's private puzzle after the student left that batch) is
**unavailable**: kept, excluded from the queue and counts, flagged in the
report.

## Coach and admin

- `GET /revision/students/:id` — the student's report (items with titles,
  weekly reviews/recall, 30-day grade counts, attempt accuracy, most-missed
  themes, concepts graded Again 2+ times). Scope = `assertCanViewStudent`
  (admin any student; coach only students in a live batch they coach).
- `POST /revision/students/:id/recommendations { puzzleIds?, topicId?, note? }`
  — every puzzle must be PUBLISHED with a solution, openable by the student
  (GLOBAL, or PRIVATE by one of the student's coaches) **and** visible to the
  recommending coach (GLOBAL or their own); a folder must hold at least one such
  puzzle; system folders are refused. An existing item is re-activated and
  brought forward to now — never duplicated.
- `DELETE /revision/students/:id/recommendations/:itemId` — only the coach who
  recommended it, or an admin. A coach-sourced item becomes `REMOVED`; a
  mistake the coach had flagged stays as the student's own mistake.

## Metrics — what each number means

| Number | Definition |
|---|---|
| Due today | reviewed-before items due before the end of the student's local today (overdue included) |
| Overdue | subset due before today began |
| New to learn | never-reviewed items whose time has come |
| Done today | reviews recorded today |
| Revision streak | consecutive local days with ≥1 review, ending today or yesterday |
| Estimate | Σ `puzzle.estimatedSeconds` (default 90s) over the next session |
| Recall rate | reviews rated Hard/Good/Easy ÷ all reviews, last 30 days |
| Reviews by week | a fixed 8-week window (local Monday weeks), oldest first, empty weeks shown as 0 — a deliberate trend window, not pagination; older reviews still count everywhere else |
| Attempt accuracy | revision attempts solved ÷ revision attempts graded (all time) — independent of the self-rating |

Activity history lists revision attempts as `REVISION_PUZZLE`, grouped per
puzzle like every other setting (one entry per puzzle, retries counted on it),
so a review is never a second, independent activity. The puzzle rating rule is
unchanged: only a student's first finished attempt at a puzzle is rated, so
revising a known puzzle can't farm rating.

## Tests

- `apps/api/src/revision/revision-schedule.spec.ts` — the scheduler: all four
  grades, growth, lapses, same-day retry limit, determinism, invalid state,
  time zones and DST, due status, grade caps, long-term recall, queue order,
  streak.
- `apps/api/src/revision/revision.int-spec.ts` — real app + Postgres: seeding
  rules, batched seeding over a long history (+ newer non-mistakes, + racing
  loads), the next → solve → rate loop on the real attempt routes, an unrated
  review staying pending, idempotent replay, concurrent ratings and concurrent
  `next` calls, forged grades / a forged "correct" flag / a hint refused,
  rating an attempt that isn't the item's, skip, unavailable content, folder
  items, activity-history entries (one per setting and puzzle), every access
  rule.
- `test/integration/access/cross-user-access.int-spec.ts` — revision rows.

## Rollout

1. Review, then apply the migration (`npm run db:migrate:deploy`) — additive
   only: two new tables, five enums, one enum value.
2. Nothing to backfill: mistake items appear on each student's first visit.
3. To tune, change `REVISION_POLICY` and re-run `revision-schedule.spec.ts`;
   existing items keep their stored state and pick up the new numbers on their
   next review.

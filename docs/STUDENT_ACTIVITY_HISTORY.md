# Student activity history & progress summary

Coach page `/coach/students/[studentId]` (from the progress icon on `/coach/students`),
admin page `/admin/students/[studentId]` (Users → student row → "Progress & activity"),
and the student's own `/student/progress`. Three tabs: **Overview** (the existing
rating/streak `ProgressView`), **Performance** (summary, chart, insights, by-type
table) and **Activity history** (filtered, paged list).

Routes: `API_ROUTES.progress.historyMine` / `.summaryMine` (student) and
`.history(id)` / `.summary(id)`. Code: `apps/api/src/progress/activity-history.{sql,service}.ts`,
contract `packages/types/src/student-activity.ts`, web `features/progress/`.

## No tables of its own

Everything is derived at read time from records the features already keep, so
there is nothing to backfill or keep in sync:

| Activity type | Source |
|---|---|
| Practice / training / class / homework puzzle | `puzzle_attempts` (by `context`) |
| Class question | `live_class_move_poll_answers` + `live_class_move_polls` |
| Assignment (solve line, engine, analysis, replay) | `student_assignments` + `student_assignment_attempts` |
| Puzzle Storm / Racer | `live_class_puzzle_rush_entries` |
| Class MCQ | `live_class_mcq_attempts` + `live_class_activity_runs` |
| Class Playout | `live_class_playout_games` + `live_class_activity_runs` |
| Unanswered class puzzle / question / MCQ / Playout | `live_class_puzzle_assignments` / polls / runs × `class_attendance` |
| Queue linkage (display only) | `live_class_activity_queue_items.puzzleAssignmentId` / `movePollId` / `activityRunId` |

Not included: simul and student-match games (they are game results, not graded
activities — see the Game Library) and course-module completion.

## Definitions

- **One history entry = one activity**, retries grouped. Puzzle attempts group by
  *(setting, puzzle)* where setting is the class, the homework deployment, practice
  or training. So a puzzle shared twice in one class, or run by the activity queue,
  is one entry — the queue never creates a second row. A puzzle-set assignment is
  represented by its puzzles; it appears as an assignment row only while none of
  its puzzles has been opened (`NOT_STARTED`).
- **Attempt** = a try that played at least one move (or was finished). An attempt
  opened and left with no move is not counted anywhere.
- **Outcomes**: `CORRECT`, `PARTIAL` (solve-the-line passed without the full line),
  `INCORRECT`, `UNGRADED` (unmarked question, engine game, analysis, replay, rush),
  `INCOMPLETE` (moves played, unfinished), `NOT_STARTED`, `SKIPPED` (closed with no
  move — a training skip), `UNANSWERED` (shared while the student was in the room —
  between their first join and last leave — and they never responded; only once
  the share/question closed).
- A class puzzle left open with a wrong move after its share closed is
  `INCORRECT` — the same rule as the activity queue's progress grid.
- **MCQ / Playout**: one entry per run, tries grouped. A Playout is `CORRECT` when
  any try reached the goal, `INCORRECT` when a try finished without it, and
  `INCOMPLETE` when the class moved on mid-game (never counted as wrong). The entry
  carries the game's start and final position and PGN. A student sees an MCQ's
  result only once its reveal rule allows; until then it reads `UNGRADED`.
- **Accuracy** = correct graded attempts ÷ graded attempts × 100, *per attempt*.
  Graded attempts: puzzle tries SOLVED (✓) / FAILED / given up after a move /
  the class rule above (✗); answers to questions with a marked answer; solve-the-line
  attempts (✓ only when the whole line was solved). Ungraded, not-started, skipped
  and unanswered never count. Flagged as a small sample under 10 graded tries.
- **Right first try** = graded activities correct on their first attempt ÷ graded
  activities. **Puzzles solved** = distinct puzzles solved ÷ distinct attempted,
  across every setting.
- **Students never see an unrevealed answer**: for a student viewer a question is
  graded only once the coach revealed it; staff see the marked result.

## Insights (evidence only)

- **Repeated mistakes**: puzzles with ≥ 2 wrong graded attempts, and whether the
  student has solved that puzzle since.
- **Weaker themes**: accuracy per puzzle type, theme tag (Lichess length/origin tags
  excluded) and non-system folder; only with ≥ 5 graded attempts, flagged when ≥ 10
  points under the student's overall accuracy. Themes measuring the identical tries
  are shown once. Otherwise a neutral message.
- **Trend**: the two halves of the chosen period (or the last 30 days vs the 30
  before); needs ≥ 8 graded attempts each side; ≥ 10 points = improving / declining.
- **Left unfinished**: counts of incomplete, not started, unanswered and skipped.

## Access

Same rule as `/progress/students/:id` (`progress/student-access.ts`): admin any
student; coach only students enrolled in a batch they coach (then the student's
whole history — practice and training included, as with the rating view); student
only themselves. The role comes from the session. Rows exist in
`cross-user-access.int-spec.ts`; `activity-history.int-spec.ts` checks every count.

## Time and paging

Filters take calendar days (`from`/`to`) in the **viewer's** `User.timezone`;
buckets (day ≤ 31 days, week ≤ ~6 months, else month) are computed in SQL with
`(col AT TIME ZONE 'UTC') AT TIME ZONE tz`. History is keyset-paged on
`(occurredAt, id)`, 25 per page (max 100), with a separate total count.

## Known limits

- `durationSeconds` is what the board reports, not a server measurement.
- Presence for `UNANSWERED` uses first join / last leave, so a student who stepped
  out mid-class can still be listed as having missed something shared then.
- A coach who shares one student with another coach sees that student's activity
  from the other coach's classes too (the existing progress rule).

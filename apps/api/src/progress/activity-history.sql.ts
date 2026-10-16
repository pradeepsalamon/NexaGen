import { Prisma } from "@prisma/client";
import { SYSTEM_PUZZLE_FOLDER_SLUGS, type StudentActivityStatusFilter, type StudentActivityType } from "@nexa-chess/types";

// ──────────────────────────────────────────────────────────────
// The activity history is a read model over records the features already
// keep — nothing here writes. Two derived relations, both per student:
//
//   activity  one row per ACTIVITY (retries grouped)            → history, totals
//   graded    one row per GRADED ATTEMPT (right or wrong)       → accuracy, insights
//
// Every timestamp column is `timestamp WITHOUT time zone` holding UTC
// (CLAUDE.md §3.4): bounds are bound as `${iso}::timestamp`, never a Date, and
// bucketing converts with `(col AT TIME ZONE 'UTC') AT TIME ZONE <tz>`.
// ──────────────────────────────────────────────────────────────

export type HistoryContext = {
  studentId: string;
  /**
   * Staff see whether a question's answer was right even before the coach
   * revealed it; a student only once it was revealed to the class (the move
   * poll's own visibility rule).
   */
  staffViewer: boolean;
};

/** Resolved scope: date bounds already turned into UTC instants. */
export type ResolvedScope = {
  start?: Date;
  end?: Date;
  type?: StudentActivityType;
  batchId?: string;
  classId?: string;
  assignmentId?: string;
};

export const ATTEMPTED_SQL = Prisma.sql`('CORRECT', 'PARTIAL', 'INCORRECT', 'UNGRADED', 'INCOMPLETE')`;

const ts = (d: Date) => Prisma.sql`${d.toISOString()}::timestamp`;

/** "Played at least one move" for a jsonb moves column (an attempt that was only opened has none). */
function movesPlayed(column: string): Prisma.Sql {
  return Prisma.raw(`(CASE WHEN jsonb_typeof(${column}) = 'array' THEN jsonb_array_length(${column}) ELSE 0 END > 0)`);
}

/** A question is graded when it has a marked answer the viewer may see. */
function pollGraded(ctx: HistoryContext): Prisma.Sql {
  return Prisma.sql`(p."correctUci" IS NOT NULL AND (${ctx.staffViewer}::boolean OR (p.revealed AND p.status <> 'OPEN')))`;
}

/**
 * The CTE prefix: `pa` (puzzle attempts, flagged), `activity`, `graded`.
 *
 * Puzzle attempts group by (setting, puzzle) — setting = the class, the
 * homework deployment, practice or training — so a puzzle re-shared in the
 * same class, or run by the activity queue, is ONE activity, never two.
 */
export function historyCtes(ctx: HistoryContext): Prisma.Sql {
  const s = ctx.studentId;
  const paMoves = movesPlayed(`pa."movesJson"`);
  const attMoves = movesPlayed(`att."movesJson"`);
  return Prisma.sql`
WITH pa0 AS (
  SELECT pa.id,
         pa."puzzleId" AS puzzle_id,
         pa.context::text AS context,
         pa."liveClassId" AS class_id,
         pa."studentAssignmentId" AS sa_id,
         pa.status::text AS status,
         pa."hintsUsed" AS hints,
         pa."wrongMoves" AS wrong,
         pa."durationSeconds" AS dur,
         pa."startedAt" AS started_at,
         COALESCE(pa."completedAt", pa."startedAt") AS happened_at,
         CASE pa.context
           WHEN 'LIVE_CLASS' THEN 'class:' || COALESCE(pa."liveClassId", '-')
           WHEN 'ASSIGNMENT' THEN 'hw:' || COALESCE(pa."studentAssignmentId", '-')
           ELSE lower(pa.context::text)
         END AS setting,
         (pa.status IN ('SOLVED', 'FAILED') OR ${paMoves} OR pa."wrongMoves" > 0) AS attempted,
         CASE
           WHEN pa.status = 'SOLVED' THEN true
           WHEN pa.status = 'FAILED' THEN false
           -- Gave up after playing: wrong. Closed without a move (a training skip): not an attempt.
           WHEN pa.status = 'ABANDONED' AND (${paMoves} OR pa."wrongMoves" > 0) THEN false
           -- Same rule as the activity queue: a class puzzle left open with a wrong
           -- move once its share closed is a (wrong) answer.
           WHEN pa.status = 'IN_PROGRESS' AND pa.context = 'LIVE_CLASS' AND pa."wrongMoves" > 0
                AND NOT EXISTS (
                  SELECT 1 FROM live_class_puzzle_assignments sh
                  WHERE sh."liveClassId" = pa."liveClassId" AND sh."puzzleId" = pa."puzzleId" AND sh.status = 'ACTIVE'
                ) THEN false
         END AS correct
  FROM puzzle_attempts pa
  WHERE pa."studentId" = ${s}
),
pa AS (
  SELECT pa0.*,
         CASE pa0.context
           WHEN 'LIVE_CLASS' THEN 'CLASS_PUZZLE'
           WHEN 'ASSIGNMENT' THEN 'HOMEWORK_PUZZLE'
           WHEN 'TRAINING' THEN 'TRAINING_PUZZLE'
           ELSE 'PRACTICE_PUZZLE'
         END AS type,
         COALESCE(c."batchId", ab."batchId") AS batch_id,
         sa."assignmentBatchId" AS assignment_id,
         min(pa0.started_at) FILTER (WHERE pa0.status = 'SOLVED')
           OVER (PARTITION BY pa0.setting, pa0.puzzle_id) AS first_solved
  FROM pa0
  LEFT JOIN classes c ON c.id = pa0.class_id
  LEFT JOIN student_assignments sa ON sa.id = pa0.sa_id
  LEFT JOIN assignment_batches ab ON ab.id = sa."assignmentBatchId"
),
hw_att AS (
  SELECT att."studentAssignmentId" AS sa_id,
         count(*) FILTER (WHERE att.status <> 'IN_PROGRESS' OR ${attMoves})::int AS attempts,
         bool_or(att.status = 'COMPLETED' AND att.result = 'SOLVED') AS solved,
         bool_or(att.status = 'COMPLETED') AS passed,
         bool_or(att.status = 'FAILED') AS failed,
         bool_or(att.status IN ('COMPLETED', 'FAILED')) AS finished,
         sum(att."durationSeconds")::int AS dur,
         sum(att."hintsUsed")::int AS hints,
         max(COALESCE(att."completedAt", att."startedAt")) AS last_at,
         min(att."startedAt") AS first_at,
         min(att."startedAt") FILTER (WHERE att.status = 'COMPLETED' AND att.result = 'SOLVED') AS first_solved,
         (array_agg(att.result ORDER BY att."completedAt" DESC NULLS LAST)
            FILTER (WHERE att.status IN ('COMPLETED', 'FAILED')))[1] AS last_result
  FROM student_assignment_attempts att
  JOIN student_assignments sa ON sa.id = att."studentAssignmentId"
  WHERE sa."studentId" = ${s}
  GROUP BY att."studentAssignmentId"
),
activity AS (
  -- Puzzles (practice, training, class, homework puzzle sets)
  SELECT 'puzzle:' || setting || ':' || puzzle_id AS key,
         min(type) AS type,
         CASE
           WHEN bool_or(status = 'SOLVED') THEN 'CORRECT'
           WHEN bool_or(correct = false) THEN 'INCORRECT'
           WHEN bool_or(attempted) THEN 'INCOMPLETE'
           WHEN bool_or(status = 'ABANDONED') THEN 'SKIPPED'
           ELSE 'NOT_STARTED'
         END AS outcome,
         bool_or(correct IS NOT NULL) AS completed,
         max(happened_at) AS occurred_at,
         min(started_at) AS started_at,
         (count(*) FILTER (WHERE attempted))::int AS attempts,
         CASE WHEN bool_or(status = 'SOLVED')
           THEN ((count(*) FILTER (WHERE attempted AND started_at < first_solved)) + 1)::int
         END AS solved_on,
         sum(hints)::int AS hints,
         sum(wrong)::int AS wrong,
         NULLIF(sum(dur) FILTER (WHERE attempted), 0)::int AS dur,
         NULL::int AS score,
         NULL::int AS max_score,
         NULL::text AS detail,
         puzzle_id,
         min(class_id) AS class_id,
         min(assignment_id) AS assignment_id,
         min(batch_id) AS batch_id,
         NULL::text AS poll_id,
         NULL::text AS sa_id,
         NULL::text AS rush_id
  FROM pa
  GROUP BY setting, puzzle_id

  UNION ALL
  -- Live-class questions: one stored answer per student per question
  SELECT 'poll:' || ans.id, 'CLASS_QUESTION',
         CASE WHEN ${pollGraded(ctx)}
           THEN CASE WHEN ans.uci = p."correctUci" THEN 'CORRECT' ELSE 'INCORRECT' END
           ELSE 'UNGRADED'
         END,
         true, ans."answeredAt", ans."answeredAt", 1,
         CASE WHEN ${pollGraded(ctx)} AND ans.uci = p."correctUci" THEN 1 END,
         0, 0, NULL, NULL, NULL, ans.san,
         NULL, p."liveClassId", NULL, c."batchId", p.id, NULL, NULL
  FROM live_class_move_poll_answers ans
  JOIN live_class_move_polls p ON p.id = ans."pollId"
  JOIN classes c ON c.id = p."liveClassId"
  WHERE ans."studentId" = ${s}

  UNION ALL
  -- Class puzzles shared while the student was in the room, never touched.
  -- Only once the share closed (or the class ended); one row per (class, puzzle).
  SELECT 'missed-puzzle:' || sh."liveClassId" || ':' || sh."puzzleId", 'CLASS_PUZZLE', 'UNANSWERED',
         false, min(sh."startedAt"), min(sh."startedAt"), 0, NULL, 0, 0, NULL, NULL, NULL, NULL,
         sh."puzzleId", sh."liveClassId", NULL, c."batchId", NULL, NULL, NULL
  FROM live_class_puzzle_assignments sh
  JOIN classes c ON c.id = sh."liveClassId"
  JOIN class_attendance ca ON ca."classId" = sh."liveClassId" AND ca."studentId" = ${s}
  WHERE (sh.status = 'ENDED' OR c.status NOT IN ('LIVE', 'IN_PROGRESS'))
    AND ca.status <> 'ABSENT'
    AND ca."joinedAt" IS NOT NULL
    AND ca."joinedAt" <= COALESCE(sh."endedAt", sh."startedAt")
    AND (ca."leftAt" IS NULL OR ca."leftAt" >= sh."startedAt")
    AND NOT EXISTS (
      SELECT 1 FROM puzzle_attempts x
      WHERE x."studentId" = ${s} AND x."liveClassId" = sh."liveClassId" AND x."puzzleId" = sh."puzzleId"
    )
  GROUP BY sh."liveClassId", sh."puzzleId", c."batchId"

  UNION ALL
  -- Questions asked while the student was in the room, never answered (once closed).
  SELECT 'missed-poll:' || p.id, 'CLASS_QUESTION', 'UNANSWERED',
         false, p."startedAt", p."startedAt", 0, NULL, 0, 0, NULL, NULL, NULL, NULL,
         NULL, p."liveClassId", NULL, c."batchId", p.id, NULL, NULL
  FROM live_class_move_polls p
  JOIN classes c ON c.id = p."liveClassId"
  JOIN class_attendance ca ON ca."classId" = p."liveClassId" AND ca."studentId" = ${s}
  WHERE p.status <> 'OPEN'
    AND ca.status <> 'ABSENT'
    AND ca."joinedAt" IS NOT NULL
    AND ca."joinedAt" <= COALESCE(p."closedAt", p."endedAt", p."startedAt")
    AND (ca."leftAt" IS NULL OR ca."leftAt" >= p."startedAt")
    AND NOT EXISTS (
      SELECT 1 FROM live_class_move_poll_answers x WHERE x."pollId" = p.id AND x."studentId" = ${s}
    )

  UNION ALL
  -- Assignments. A PUZZLE_SET is represented by its puzzles (above); it only
  -- appears here while none of them has been opened, so it is never counted twice.
  SELECT 'hw:' || sa.id, 'HOMEWORK',
         CASE
           WHEN a."activityType" = 'PUZZLE_SET' THEN 'NOT_STARTED'
           WHEN a."activityType" = 'REPLAY' THEN
             CASE sa.status WHEN 'COMPLETED' THEN 'UNGRADED' WHEN 'IN_PROGRESS' THEN 'INCOMPLETE' ELSE 'NOT_STARTED' END
           WHEN a."activityType" = 'SOLVE_LINE' THEN
             CASE
               WHEN x.solved THEN 'CORRECT'
               WHEN x.passed THEN 'PARTIAL'
               WHEN x.failed THEN 'INCORRECT'
               WHEN COALESCE(x.attempts, 0) > 0 THEN 'INCOMPLETE'
               ELSE 'NOT_STARTED'
             END
           ELSE
             CASE WHEN x.finished THEN 'UNGRADED' WHEN COALESCE(x.attempts, 0) > 0 THEN 'INCOMPLETE' ELSE 'NOT_STARTED' END
         END,
         CASE WHEN a."activityType" = 'REPLAY' THEN sa.status = 'COMPLETED' ELSE COALESCE(x.finished, false) END,
         COALESCE(sa.completed_at, x.last_at, sa."createdAt"),
         COALESCE(x.first_at, CASE WHEN sa.status <> 'PENDING' THEN sa."updatedAt" END),
         COALESCE(x.attempts, 0),
         CASE WHEN x.solved THEN (
           SELECT (count(*) + 1)::int FROM student_assignment_attempts y
           WHERE y."studentAssignmentId" = sa.id AND y."startedAt" < x.first_solved
             AND (y.status <> 'IN_PROGRESS' OR ${movesPlayed(`y."movesJson"`)})
         ) END,
         COALESCE(x.hints, 0), 0,
         NULLIF(COALESCE(sa.time_spent_seconds, x.dur, 0), 0),
         CASE WHEN a."activityType" IN ('SOLVE_LINE', 'PLAY_VS_ENGINE') THEN sa."bestScorePercent" END,
         CASE WHEN a."activityType" IN ('SOLVE_LINE', 'PLAY_VS_ENGINE') AND sa."bestScorePercent" IS NOT NULL THEN 100 END,
         CASE WHEN a."activityType" = 'PLAY_VS_ENGINE' THEN x.last_result END,
         NULL, NULL, ab.id, ab."batchId", NULL, sa.id, NULL
  FROM student_assignments sa
  JOIN assignment_batches ab ON ab.id = sa."assignmentBatchId"
  JOIN assignments a ON a.id = ab."assignmentId"
  LEFT JOIN hw_att x ON x.sa_id = sa.id
  WHERE sa."studentId" = ${s}
    AND (a."activityType" <> 'PUZZLE_SET'
         OR NOT EXISTS (SELECT 1 FROM puzzle_attempts z WHERE z."studentAssignmentId" = sa.id))

  UNION ALL
  -- Puzzle Storm / Racer rounds the student actually played
  SELECT 'rush:' || e.id, 'PUZZLE_RUSH', 'UNGRADED',
         (e."finishedAt" IS NOT NULL OR r."endedAt" IS NOT NULL),
         COALESCE(e."finishedAt", e."updatedAt"), e."startedAt", 1, NULL, 0, 0,
         NULL, e.score, NULL,
         e.solved || ' solved · ' || e.errors || CASE WHEN e.errors = 1 THEN ' error' ELSE ' errors' END,
         NULL, r."liveClassId", NULL, c."batchId", NULL, NULL, r.id
  FROM live_class_puzzle_rush_entries e
  JOIN live_class_puzzle_rushes r ON r.id = e."rushId"
  JOIN classes c ON c.id = r."liveClassId"
  WHERE e."studentId" = ${s} AND e.moves > 0
),
graded AS (
  SELECT happened_at, type, batch_id, class_id, assignment_id, puzzle_id, correct
  FROM pa
  WHERE correct IS NOT NULL

  UNION ALL
  SELECT ans."answeredAt", 'CLASS_QUESTION', c."batchId", p."liveClassId", NULL, NULL, ans.uci = p."correctUci"
  FROM live_class_move_poll_answers ans
  JOIN live_class_move_polls p ON p.id = ans."pollId"
  JOIN classes c ON c.id = p."liveClassId"
  WHERE ans."studentId" = ${s} AND ${pollGraded(ctx)}

  UNION ALL
  -- Solve-the-line attempts: right only when the whole line was solved.
  SELECT COALESCE(att."completedAt", att."startedAt"), 'HOMEWORK', ab."batchId", NULL, ab.id, NULL,
         (att.status = 'COMPLETED' AND att.result = 'SOLVED')
  FROM student_assignment_attempts att
  JOIN student_assignments sa ON sa.id = att."studentAssignmentId"
  JOIN assignment_batches ab ON ab.id = sa."assignmentBatchId"
  JOIN assignments a ON a.id = ab."assignmentId"
  WHERE sa."studentId" = ${s} AND a."activityType" = 'SOLVE_LINE' AND att.status IN ('COMPLETED', 'FAILED')
)`;
}

/** Scope conditions on `activity` (dateColumn occurred_at) or `graded` (dateColumn happened_at). */
export function scopeWhere(alias: string, dateColumn: string, scope: ResolvedScope): Prisma.Sql {
  const col = (name: string) => Prisma.raw(`${alias}.${name}`);
  const parts: Prisma.Sql[] = [];
  if (scope.start) parts.push(Prisma.sql`${col(dateColumn)} >= ${ts(scope.start)}`);
  if (scope.end) parts.push(Prisma.sql`${col(dateColumn)} < ${ts(scope.end)}`);
  if (scope.type) parts.push(Prisma.sql`${col("type")} = ${scope.type}`);
  if (scope.batchId) parts.push(Prisma.sql`${col("batch_id")} = ${scope.batchId}`);
  if (scope.classId) parts.push(Prisma.sql`${col("class_id")} = ${scope.classId}`);
  if (scope.assignmentId) parts.push(Prisma.sql`${col("assignment_id")} = ${scope.assignmentId}`);
  return parts.length ? Prisma.join(parts, " AND ") : Prisma.sql`TRUE`;
}

export function statusWhere(alias: string, status: StudentActivityStatusFilter | undefined): Prisma.Sql {
  if (!status) return Prisma.sql`TRUE`;
  if (status === "COMPLETED") return Prisma.raw(`${alias}.completed`);
  return Prisma.sql`${Prisma.raw(`${alias}.outcome`)} = ${status}`;
}

export function cursorWhere(alias: string, cursor: { at: Date; key: string } | null): Prisma.Sql {
  if (!cursor) return Prisma.sql`TRUE`;
  return Prisma.sql`(${Prisma.raw(`${alias}.occurred_at`)}, ${Prisma.raw(`${alias}.key`)}) < (${ts(cursor.at)}, ${cursor.key})`;
}

export type HistoryRow = {
  key: string;
  type: StudentActivityType;
  outcome: string;
  completed: boolean;
  occurred_at: Date;
  started_at: Date | null;
  attempts: number;
  solved_on: number | null;
  hints: number;
  wrong: number;
  dur: number | null;
  score: number | null;
  max_score: number | null;
  detail: string | null;
  puzzle_id: string | null;
  class_id: string | null;
  assignment_id: string | null;
  batch_id: string | null;
  poll_id: string | null;
  sa_id: string | null;
  rush_id: string | null;
  puzzle_title: string | null;
  puzzle_difficulty: string | null;
  puzzle_type: string | null;
  topic_name: string | null;
  topic_slug: string | null;
  class_title: string | null;
  class_topic: string | null;
  class_starts_at: Date | null;
  batch_name: string | null;
  assignment_title: string | null;
  due_date: Date | null;
  student_note: string | null;
  poll_prompt: string | null;
  rush_mode: string | null;
  queue_title: string | null;
  queue_position: number | null;
};

/** One page of `activity`, decorated with titles only after the LIMIT. */
export function historyPageSql(
  ctx: HistoryContext,
  scope: ResolvedScope,
  status: StudentActivityStatusFilter | undefined,
  cursor: { at: Date; key: string } | null,
  take: number
): Prisma.Sql {
  return Prisma.sql`${historyCtes(ctx)}
SELECT r.*,
       pz.title AS puzzle_title, pz.difficulty::text AS puzzle_difficulty, pz."puzzleType"::text AS puzzle_type,
       t.name AS topic_name, t.slug AS topic_slug,
       c.title AS class_title, c.topic AS class_topic, c."startsAt" AS class_starts_at,
       b.name AS batch_name,
       a.title AS assignment_title, ab."dueDate" AS due_date,
       sa.note AS student_note,
       poll.prompt AS poll_prompt,
       rush.mode::text AS rush_mode,
       q.queue_title, q.queue_position
FROM (
  SELECT * FROM activity h
  WHERE ${scopeWhere("h", "occurred_at", scope)} AND ${statusWhere("h", status)} AND ${cursorWhere("h", cursor)}
  ORDER BY h.occurred_at DESC, h.key DESC
  LIMIT ${take}
) r
LEFT JOIN puzzles pz ON pz.id = r.puzzle_id
LEFT JOIN puzzle_topics t ON t.id = pz."topicId"
LEFT JOIN classes c ON c.id = r.class_id
LEFT JOIN batches b ON b.id = r.batch_id
LEFT JOIN assignment_batches ab ON ab.id = r.assignment_id
LEFT JOIN assignments a ON a.id = ab."assignmentId"
LEFT JOIN student_assignments sa ON sa.id = r.sa_id
LEFT JOIN live_class_move_polls poll ON poll.id = r.poll_id
LEFT JOIN live_class_puzzle_rushes rush ON rush.id = r.rush_id
LEFT JOIN LATERAL (
  SELECT u.queue_title, u.queue_position FROM (
    SELECT q1.title AS queue_title, i1.position + 1 AS queue_position, i1."activatedAt" AS activated_at
    FROM live_class_activity_queue_items i1
    JOIN live_class_activity_queues q1 ON q1.id = i1."queueId"
    WHERE r.poll_id IS NOT NULL AND i1."movePollId" = r.poll_id
    UNION ALL
    SELECT q2.title, i2.position + 1, i2."activatedAt"
    FROM live_class_puzzle_assignments sh
    JOIN live_class_activity_queue_items i2 ON i2."puzzleAssignmentId" = sh.id
    JOIN live_class_activity_queues q2 ON q2.id = i2."queueId"
    WHERE r.type = 'CLASS_PUZZLE' AND sh."liveClassId" = r.class_id AND sh."puzzleId" = r.puzzle_id
  ) u
  ORDER BY u.activated_at NULLS LAST
  LIMIT 1
) q ON true
ORDER BY r.occurred_at DESC, r.key DESC`;
}

export function historyCountSql(
  ctx: HistoryContext,
  scope: ResolvedScope,
  status: StudentActivityStatusFilter | undefined
): Prisma.Sql {
  return Prisma.sql`${historyCtes(ctx)}
SELECT count(*)::int AS total FROM activity h
WHERE ${scopeWhere("h", "occurred_at", scope)} AND ${statusWhere("h", status)}`;
}

export type TotalsRow = {
  type: StudentActivityType;
  activities: number;
  attempted: number;
  completed: number;
  incomplete: number;
  not_started: number;
  skipped: number;
  unanswered: number;
  graded_activities: number;
  first_try: number;
  last_at: Date | null;
};

export function totalsSql(ctx: HistoryContext, scope: ResolvedScope): Prisma.Sql {
  return Prisma.sql`${historyCtes(ctx)}
SELECT h.type,
       count(*)::int AS activities,
       (count(*) FILTER (WHERE h.outcome IN ${ATTEMPTED_SQL}))::int AS attempted,
       (count(*) FILTER (WHERE h.completed))::int AS completed,
       (count(*) FILTER (WHERE h.outcome = 'INCOMPLETE'))::int AS incomplete,
       (count(*) FILTER (WHERE h.outcome = 'NOT_STARTED'))::int AS not_started,
       (count(*) FILTER (WHERE h.outcome = 'SKIPPED'))::int AS skipped,
       (count(*) FILTER (WHERE h.outcome = 'UNANSWERED'))::int AS unanswered,
       (count(*) FILTER (WHERE h.outcome IN ('CORRECT', 'PARTIAL', 'INCORRECT')))::int AS graded_activities,
       (count(*) FILTER (WHERE h.outcome = 'CORRECT' AND h.solved_on = 1))::int AS first_try,
       max(h.occurred_at) FILTER (WHERE h.outcome IN ${ATTEMPTED_SQL}) AS last_at
FROM activity h
WHERE ${scopeWhere("h", "occurred_at", scope)}
GROUP BY h.type`;
}

export function uniquePuzzlesSql(ctx: HistoryContext, scope: ResolvedScope): Prisma.Sql {
  return Prisma.sql`${historyCtes(ctx)}
SELECT (count(DISTINCT h.puzzle_id) FILTER (WHERE h.outcome IN ${ATTEMPTED_SQL}))::int AS attempted,
       (count(DISTINCT h.puzzle_id) FILTER (WHERE h.outcome = 'CORRECT'))::int AS solved
FROM activity h
WHERE h.puzzle_id IS NOT NULL AND ${scopeWhere("h", "occurred_at", scope)}`;
}

export function gradedByTypeSql(ctx: HistoryContext, scope: ResolvedScope): Prisma.Sql {
  return Prisma.sql`${historyCtes(ctx)}
SELECT g.type, count(*)::int AS graded, (count(*) FILTER (WHERE g.correct))::int AS correct
FROM graded g
WHERE ${scopeWhere("g", "happened_at", scope)}
GROUP BY g.type`;
}

export function seriesSql(
  ctx: HistoryContext,
  scope: ResolvedScope,
  granularity: "day" | "week" | "month",
  timeZone: string
): Prisma.Sql {
  const bucket = (column: string) =>
    Prisma.sql`to_char(date_trunc(${granularity}, (${Prisma.raw(column)} AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}), 'YYYY-MM-DD')`;
  return Prisma.sql`${historyCtes(ctx)}
SELECT x.bucket,
       sum(x.activities)::int AS activities,
       sum(x.graded)::int AS graded,
       sum(x.correct)::int AS correct
FROM (
  SELECT ${bucket("h.occurred_at")} AS bucket, 1 AS activities, 0 AS graded, 0 AS correct
  FROM activity h
  WHERE h.outcome IN ${ATTEMPTED_SQL} AND ${scopeWhere("h", "occurred_at", scope)}
  UNION ALL
  SELECT ${bucket("g.happened_at")}, 0, 1, CASE WHEN g.correct THEN 1 ELSE 0 END
  FROM graded g
  WHERE ${scopeWhere("g", "happened_at", scope)}
) x
GROUP BY x.bucket
ORDER BY x.bucket`;
}

export function repeatedMistakesSql(ctx: HistoryContext, scope: ResolvedScope, limit: number): Prisma.Sql {
  return Prisma.sql`${historyCtes(ctx)}
SELECT g.puzzle_id, pz.title,
       (count(*) FILTER (WHERE NOT g.correct))::int AS incorrect,
       count(*)::int AS graded,
       max(g.happened_at) AS last_at,
       EXISTS (
         SELECT 1 FROM puzzle_attempts x
         WHERE x."studentId" = ${ctx.studentId} AND x."puzzleId" = g.puzzle_id AND x.status = 'SOLVED'
       ) AS solved
FROM graded g
JOIN puzzles pz ON pz.id = g.puzzle_id
WHERE g.puzzle_id IS NOT NULL AND ${scopeWhere("g", "happened_at", scope)}
GROUP BY g.puzzle_id, pz.title
HAVING count(*) FILTER (WHERE NOT g.correct) >= 2
ORDER BY incorrect DESC, last_at DESC
LIMIT ${limit}`;
}

/** Accuracy per puzzle type, per theme tag and per (non-system) library folder. */
export function themesSql(ctx: HistoryContext, scope: ResolvedScope): Prisma.Sql {
  const where = scopeWhere("g", "happened_at", scope);
  const systemSlugs = Prisma.join([...SYSTEM_PUZZLE_FOLDER_SLUGS]);
  return Prisma.sql`${historyCtes(ctx)}
SELECT x.kind, x.key, max(x.label) AS label, count(*)::int AS graded, (count(*) FILTER (WHERE x.correct))::int AS correct
FROM (
  SELECT 'TYPE' AS kind, pz."puzzleType"::text AS key, NULL::text AS label, g.correct
  FROM graded g JOIN puzzles pz ON pz.id = g.puzzle_id
  WHERE ${where} AND pz."puzzleType" <> 'CUSTOM'
  UNION ALL
  SELECT 'THEME', tag, NULL, g.correct
  FROM graded g JOIN puzzles pz ON pz.id = g.puzzle_id CROSS JOIN LATERAL unnest(pz.tags) AS tag
  WHERE ${where}
  UNION ALL
  SELECT 'FOLDER', t.id, t.name, g.correct
  FROM graded g JOIN puzzles pz ON pz.id = g.puzzle_id JOIN puzzle_topics t ON t.id = pz."topicId"
  WHERE ${where} AND t.slug NOT IN (${systemSlugs})
) x
GROUP BY x.kind, x.key`;
}

export function trendSql(ctx: HistoryContext, scope: ResolvedScope, start: Date, split: Date, end: Date): Prisma.Sql {
  return Prisma.sql`${historyCtes(ctx)}
SELECT (g.happened_at < ${ts(split)}) AS earlier, count(*)::int AS graded, (count(*) FILTER (WHERE g.correct))::int AS correct
FROM graded g
WHERE ${scopeWhere("g", "happened_at", { ...scope, end: undefined, start: undefined })}
  AND g.happened_at >= ${ts(start)} AND g.happened_at < ${ts(end)}
GROUP BY 1`;
}

export function facetsSql(ctx: HistoryContext): Prisma.Sql {
  return Prisma.sql`${historyCtes(ctx)}
SELECT 'batch' AS kind, b.id, b.name AS label, NULL::timestamp AS happened_at
FROM (SELECT DISTINCT batch_id FROM activity WHERE batch_id IS NOT NULL) x JOIN batches b ON b.id = x.batch_id
UNION ALL
SELECT 'class', c.id, COALESCE(c.title, c.topic), c."startsAt"
FROM (SELECT DISTINCT class_id FROM activity WHERE class_id IS NOT NULL) x JOIN classes c ON c.id = x.class_id
UNION ALL
SELECT 'assignment', ab.id, a.title, ab."dueDate"
FROM (SELECT DISTINCT assignment_id FROM activity WHERE assignment_id IS NOT NULL) x
JOIN assignment_batches ab ON ab.id = x.assignment_id
JOIN assignments a ON a.id = ab."assignmentId"`;
}

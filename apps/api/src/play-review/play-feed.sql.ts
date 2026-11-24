import { Prisma } from "@prisma/client";
import type { PlaySource } from "@nexa-chess/types";
import type { PrismaService } from "../prisma/prisma.service";
import { tenantFilter } from "../tenancy/tenant-sql";

// ──────────────────────────────────────────────────────────────
// The play feed is a read model over the records the features already keep
// (docs/AI_PLAY_REVIEW.md §3.2) — nothing here writes. One branch per source,
// each yielding (source, source_id, student_id, played_at) for FINISHED play
// only; the service loads each page's rows through Prisma afterwards.
//
// Raw SQL bypasses the tenant extension: every branch filters its driving
// table with `tenantFilter` (listed in tenancy/raw-sql-review.spec.ts).
// Timestamps are `timestamp WITHOUT time zone` holding UTC: bound as
// `${iso}::timestamp`, never a Date.
// ──────────────────────────────────────────────────────────────

export type FeedRow = { source: PlaySource; source_id: string; student_id: string; played_at: Date };

export type FeedFilter = {
  /** One student, or every student of the academy (the nightly review). */
  studentId?: string;
  source?: PlaySource;
  /** Played at or after (UTC). */
  since?: Date;
};

/** A class-board game still open this long after its last save counts as finished. */
export const CLASS_BOARD_SETTLE_HOURS = 6;

const ts = (d: Date) => Prisma.sql`${d.toISOString()}::timestamp`;

function student(column: string, filter: FeedFilter): Prisma.Sql {
  return filter.studentId ? Prisma.sql`AND ${Prisma.raw(column)} = ${filter.studentId}` : Prisma.empty;
}

function since(column: string, filter: FeedFilter): Prisma.Sql {
  return filter.since ? Prisma.sql`AND ${Prisma.raw(column)} >= ${ts(filter.since)}` : Prisma.empty;
}

const moves = (column: string) =>
  Prisma.raw(`(CASE WHEN jsonb_typeof(${column}) = 'array' THEN jsonb_array_length(${column}) ELSE 0 END > 0)`);

/** One SELECT per source; only the requested source when filtered. */
function branches(filter: FeedFilter): Prisma.Sql[] {
  const all: Record<PlaySource, () => Prisma.Sql> = {
    // Puzzles everywhere (practice, class, homework sets, training, revision, daily).
    PUZZLE: () => Prisma.sql`
      SELECT 'PUZZLE'::text AS source, pa.id AS source_id, pa."studentId" AS student_id,
             COALESCE(pa."completedAt", pa."updatedAt") AS played_at
      FROM puzzle_attempts pa
      WHERE ${tenantFilter("pa")}
        AND (pa.status IN ('SOLVED', 'FAILED') OR (pa.status = 'ABANDONED' AND ${moves(`pa."movesJson"`)}))
        ${student(`pa."studentId"`, filter)} ${since(`COALESCE(pa."completedAt", pa."updatedAt")`, filter)}`,
    // Homework lines and games against the engine (REPLAY / FREE_ANALYSIS are not play).
    ASSIGNMENT: () => Prisma.sql`
      SELECT 'ASSIGNMENT'::text, att.id, sa."studentId", att."completedAt"
      FROM student_assignment_attempts att
      JOIN student_assignments sa ON sa.id = att."studentAssignmentId"
      JOIN assignment_batches ab ON ab.id = sa."assignmentBatchId"
      JOIN assignments a ON a.id = ab."assignmentId"
      WHERE ${tenantFilter("att")}
        AND att."completedAt" IS NOT NULL AND ${moves(`att."movesJson"`)}
        AND a."activityType" IN ('SOLVE_LINE', 'PLAY_VS_ENGINE') AND a."isDeleted" = false
        ${student(`sa."studentId"`, filter)} ${since(`att."completedAt"`, filter)}`,
    PLAYOUT: () => Prisma.sql`
      SELECT 'PLAYOUT'::text, g.id, g."studentId", g."finishedAt"
      FROM live_class_playout_games g
      WHERE ${tenantFilter("g")} AND g."finishedAt" IS NOT NULL AND g.ply > 0
        ${student(`g."studentId"`, filter)} ${since(`g."finishedAt"`, filter)}`,
    // A poll answer counts once the question is closed.
    POLL: () => Prisma.sql`
      SELECT 'POLL'::text, a.id, a."studentId", a."answeredAt"
      FROM live_class_move_poll_answers a
      JOIN live_class_move_polls p ON p.id = a."pollId"
      WHERE ${tenantFilter("a")} AND p.status <> 'OPEN'
        ${student(`a."studentId"`, filter)} ${since(`a."answeredAt"`, filter)}`,
    MATCH: () => gameBranch("MATCH", "MATCH", filter),
    SIMUL: () => gameBranch("SIMUL", "SIMUL", filter),
    TOURNAMENT: () => gameBranch("TOURNAMENT", "TOURNAMENT", filter),
    // The student's own games (PGN upload, linked Lichess / Chess.com account).
    OWN_GAME: () => Prisma.sql`
      SELECT 'OWN_GAME'::text, g.id, g."ownerId", COALESCE(g."endedAt", g."startedAt")
      FROM chess_games g
      WHERE ${tenantFilter("g")} AND g."ownerId" IS NOT NULL AND g."isDeleted" = false AND g."moveCount" > 0
        ${student(`g."ownerId"`, filter)} ${since(`COALESCE(g."endedAt", g."startedAt")`, filter)}`,
    // Storm / Racer, solo runs (s-) and class rounds (c-), once their moves are on record.
    RUSH: () => Prisma.sql`
      SELECT 'RUSH'::text, 's-' || r.id, r."studentId", r."finishedAt"
      FROM solo_puzzle_rush_runs r
      WHERE ${tenantFilter("r")} AND r."finishedAt" IS NOT NULL AND ${moves(`r."movesJson"`)}
        ${student(`r."studentId"`, filter)} ${since(`r."finishedAt"`, filter)}
      UNION ALL
      SELECT 'RUSH'::text, 'c-' || e.id, e."studentId", e."finishedAt"
      FROM live_class_puzzle_rush_entries e
      -- The class's coach may play along; only students' rounds are play to review.
      JOIN users u ON u.id = e."studentId" AND u.role = 'STUDENT'
      WHERE ${tenantFilter("e")} AND e."finishedAt" IS NOT NULL AND ${moves(`e."movesJson"`)}
        ${student(`e."studentId"`, filter)} ${since(`e."finishedAt"`, filter)}`,
    // The coach's class board, for a student who played moves on it with control.
    CLASS_BOARD: () => Prisma.sql`
      SELECT 'CLASS_BOARD'::text, g.id, bm."studentId", COALESCE(g."endedAt", g."updatedAt")
      FROM (
        SELECT DISTINCT m."chessGameId", m."studentId" FROM live_class_board_moves m
        WHERE ${tenantFilter("m")} ${student(`m."studentId"`, filter)}
      ) bm
      JOIN chess_games g ON g.id = bm."chessGameId"
      WHERE ${tenantFilter("g")} AND g."isDeleted" = false
        AND (g.status = 'COMPLETED'
             OR g."updatedAt" < (now() AT TIME ZONE 'UTC') - make_interval(hours => ${CLASS_BOARD_SETTLE_HOURS}::int))
        ${since(`COALESCE(g."endedAt", g."updatedAt")`, filter)}`
  };
  const sources = filter.source ? [filter.source] : (Object.keys(all) as PlaySource[]);
  return sources.map((source) => all[source]());
}

/** Live-class matches, simuls and tournaments: one row per student on either side. */
function gameBranch(source: PlaySource, gameSource: string, filter: FeedFilter): Prisma.Sql {
  return Prisma.sql`
    SELECT ${source}::text, g.id, side.student_id, COALESCE(g."endedAt", g."startedAt")
    FROM chess_games g
    CROSS JOIN LATERAL (VALUES (g."whitePlayerId"), (g."blackPlayerId")) AS side(student_id)
    JOIN users u ON u.id = side.student_id AND u.role = 'STUDENT'
    WHERE ${tenantFilter("g")} AND g.source = ${gameSource}::"ChessGameSource"
      AND g.status = 'COMPLETED' AND g."isDeleted" = false AND g."moveCount" > 0
      ${student("side.student_id", filter)} ${since(`COALESCE(g."endedAt", g."startedAt")`, filter)}`;
}

function feedUnion(filter: FeedFilter): Prisma.Sql {
  return Prisma.join(branches(filter), " UNION ALL ");
}

export type FeedCursor = { playedAt: string; key: string };

/** One page, newest first, keyset on (played_at, source:source_id). */
export function feedPageSql(filter: FeedFilter, cursor: FeedCursor | null, take: number): Prisma.Sql {
  const after = cursor
    ? Prisma.sql`WHERE (f.played_at, f.source || ':' || f.source_id) < (${ts(new Date(cursor.playedAt))}, ${cursor.key})`
    : Prisma.empty;
  return Prisma.sql`
    SELECT f.source, f.source_id, f.student_id, f.played_at
    FROM (${feedUnion(filter)}) AS f (source, source_id, student_id, played_at)
    ${after}
    ORDER BY f.played_at DESC, f.source || ':' || f.source_id DESC
    LIMIT ${take}`;
}

/**
 * The nightly review's to-do list: finished play since `filter.since` with no
 * review yet (or a FAILED one still under `maxAttempts`), newest first.
 */
export function unreviewedSql(filter: FeedFilter, maxAttempts: number, take: number): Prisma.Sql {
  return Prisma.sql`
    SELECT f.source, f.source_id, f.student_id, f.played_at
    FROM (${feedUnion(filter)}) AS f (source, source_id, student_id, played_at)
    WHERE NOT EXISTS (
      SELECT 1 FROM ai_play_reviews r
      WHERE ${tenantFilter("r")}
        AND r."studentId" = f.student_id AND r.source::text = f.source AND r."sourceId" = f.source_id
        AND (r.status <> 'FAILED' OR r.attempts >= ${maxAttempts}::int)
    )
    ORDER BY f.played_at DESC, f.source || ':' || f.source_id DESC
    LIMIT ${take}`;
}

type RawRunner = PrismaService;

/** One feed page (the caller asks for one extra row to know if there's a next page). */
export function queryFeedPage(prisma: RawRunner, filter: FeedFilter, cursor: FeedCursor | null, take: number) {
  return prisma.$queryRaw<FeedRow[]>(feedPageSql(filter, cursor, take));
}

/** The nightly review's to-do list. */
export function queryUnreviewed(prisma: RawRunner, filter: FeedFilter, maxAttempts: number, take: number) {
  return prisma.$queryRaw<FeedRow[]>(unreviewedSql(filter, maxAttempts, take));
}

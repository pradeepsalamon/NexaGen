import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  ACCURACY_MIN_SAMPLE,
  STUDENT_ACTIVITY_PAGE_SIZE,
  STUDENT_ACTIVITY_TYPES,
  TREND_DEFAULT_HALF_DAYS,
  accuracyStats,
  activityGranularity,
  classifyTrend,
  isAttemptedOutcome,
  isSystemPuzzleFolder,
  lichessTheme,
  lichessThemeLabel,
  pickWeakThemes,
  studentActivityHistoryQuerySchema,
  studentActivityScopeSchema,
  type ActivityGranularity,
  type ActivityThemeStat,
  type PuzzleDifficulty,
  type PuzzleType,
  type StudentActivityEntry,
  type StudentActivityHistoryResponse,
  type StudentActivityOutcome,
  type StudentActivityScope,
  type StudentActivitySummaryResponse,
  type StudentActivityType,
  type StudentActivityTypeStats
} from "@nexa-chess/types";
import { UserRole, type User } from "@prisma/client";
import type { z } from "zod";
import { authenticateUser } from "../auth/authenticate";
import { DEFAULT_TIME_ZONE, zonedDateToUtc, zonedYmd } from "../common/time";
import { PrismaService } from "../prisma/prisma.service";
import {
  facetsSql,
  gradedByTypeSql,
  historyCountSql,
  historyPageSql,
  repeatedMistakesSql,
  seriesSql,
  themesSql,
  totalsSql,
  trendSql,
  uniquePuzzlesSql,
  type HistoryContext,
  type HistoryRow,
  type ResolvedScope,
  type TotalsRow
} from "./activity-history.sql";
import { assertCanViewStudent } from "./student-access";

const DAY_MS = 86_400_000;
const REPEATED_MISTAKES_LIMIT = 5;
const FACET_CLASS_LIMIT = 100;
const FACET_ASSIGNMENT_LIMIT = 100;
/** Lichess theme groups that describe a puzzle's length or source, not what it teaches. */
const NON_TEACHING_THEME_GROUPS = new Set(["length", "origin", "special"]);

type Query = Record<string, unknown>;

/**
 * Activity history + progress summary for one student — a read model over the
 * attempt/answer records the features already keep (see activity-history.sql.ts).
 */
@Injectable()
export class ActivityHistoryService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async historyMine(accessToken: string | undefined, query: Query): Promise<StudentActivityHistoryResponse> {
    const viewer = await this.authenticate(accessToken);
    this.assertStudent(viewer);
    return this.history(viewer, viewer.id, query);
  }

  async historyFor(accessToken: string | undefined, studentId: string, query: Query): Promise<StudentActivityHistoryResponse> {
    const viewer = await this.authenticate(accessToken);
    await assertCanViewStudent(this.prisma, viewer, studentId);
    return this.history(viewer, studentId, query);
  }

  async summaryMine(accessToken: string | undefined, query: Query): Promise<StudentActivitySummaryResponse> {
    const viewer = await this.authenticate(accessToken);
    this.assertStudent(viewer);
    return this.summary(viewer, viewer.id, query);
  }

  async summaryFor(accessToken: string | undefined, studentId: string, query: Query): Promise<StudentActivitySummaryResponse> {
    const viewer = await this.authenticate(accessToken);
    await assertCanViewStudent(this.prisma, viewer, studentId);
    return this.summary(viewer, studentId, query);
  }

  // ── History ────────────────────────────────────────────────

  private async history(viewer: User, studentId: string, rawQuery: Query): Promise<StudentActivityHistoryResponse> {
    const query = this.parse(studentActivityHistoryQuerySchema, rawQuery);
    await this.loadStudent(studentId);
    const timeZone = this.timeZoneOf(viewer);
    const scope = this.resolveScope(query, timeZone);
    const ctx = this.context(viewer, studentId);
    const take = query.limit ?? STUDENT_ACTIVITY_PAGE_SIZE;
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;

    const [rows, counted] = await Promise.all([
      this.prisma.$queryRaw<HistoryRow[]>(historyPageSql(ctx, scope, query.status, cursor, take + 1)),
      this.prisma.$queryRaw<{ total: number }[]>(historyCountSql(ctx, scope, query.status))
    ]);

    const page = rows.slice(0, take);
    const last = page[page.length - 1];
    return {
      entries: page.map((row) => this.toEntry(row)),
      nextCursor: rows.length > take && last ? this.encodeCursor(last.occurred_at, last.key) : null,
      total: counted[0]?.total ?? 0
    };
  }

  private toEntry(row: HistoryRow): StudentActivityEntry {
    const outcome = row.outcome as StudentActivityOutcome;
    const systemFolder = row.topic_slug ? isSystemPuzzleFolder({ slug: row.topic_slug }) : false;
    return {
      assignment:
        row.assignment_id && row.assignment_title && row.due_date
          ? { dueDate: row.due_date.toISOString(), id: row.assignment_id, title: row.assignment_title }
          : null,
      attempted: isAttemptedOutcome(outcome),
      attempts: row.attempts,
      batch: row.batch_id && row.batch_name ? { id: row.batch_id, name: row.batch_name } : null,
      completed: row.completed,
      detail: row.detail,
      durationSeconds: row.dur,
      hintsUsed: row.hints,
      id: row.key,
      liveClass:
        row.class_id && row.class_starts_at
          ? {
              id: row.class_id,
              startsAt: row.class_starts_at.toISOString(),
              title: row.class_title ?? row.class_topic ?? null
            }
          : null,
      maxScore: row.max_score,
      occurredAt: row.occurred_at.toISOString(),
      outcome,
      puzzle:
        row.puzzle_id && row.puzzle_difficulty && row.puzzle_type
          ? {
              difficulty: row.puzzle_difficulty as PuzzleDifficulty,
              id: row.puzzle_id,
              puzzleType: row.puzzle_type as PuzzleType,
              topicName: systemFolder ? null : row.topic_name
            }
          : null,
      queue: row.queue_title && row.queue_position ? { position: row.queue_position, title: row.queue_title } : null,
      score: row.score,
      solvedOnAttempt: row.solved_on,
      startedAt: row.started_at ? row.started_at.toISOString() : null,
      studentNote: row.student_note,
      title: this.titleOf(row),
      type: row.type,
      wrongMoves: row.wrong
    };
  }

  private titleOf(row: HistoryRow): string {
    if (row.puzzle_title) return row.puzzle_title;
    if (row.type === "CLASS_QUESTION") return row.poll_prompt?.trim() || "What would you play?";
    if (row.type === "PUZZLE_RUSH") return row.rush_mode === "RACER" ? "Puzzle Racer" : "Puzzle Storm";
    if (row.assignment_title) return row.assignment_title;
    return "Activity";
  }

  // ── Summary ────────────────────────────────────────────────

  private async summary(viewer: User, studentId: string, rawQuery: Query): Promise<StudentActivitySummaryResponse> {
    const query = this.parse(studentActivityScopeSchema, rawQuery);
    const student = await this.loadStudent(studentId);
    const timeZone = this.timeZoneOf(viewer);
    const scope = this.resolveScope(query, timeZone);
    const ctx = this.context(viewer, studentId);
    const today = this.dayString(zonedYmd(timeZone));
    const granularity = activityGranularity(query.from, query.to ?? today);
    const trendWindow = this.trendWindow(scope);

    const [totals, unique, gradedByType, series, mistakes, themes, trend, facets] = await Promise.all([
      this.prisma.$queryRaw<TotalsRow[]>(totalsSql(ctx, scope)),
      this.prisma.$queryRaw<{ attempted: number; solved: number }[]>(uniquePuzzlesSql(ctx, scope)),
      this.prisma.$queryRaw<{ type: StudentActivityType; graded: number; correct: number }[]>(gradedByTypeSql(ctx, scope)),
      this.prisma.$queryRaw<{ bucket: string; activities: number; graded: number; correct: number }[]>(
        seriesSql(ctx, scope, granularity, timeZone)
      ),
      this.prisma.$queryRaw<
        { puzzle_id: string; title: string; incorrect: number; graded: number; last_at: Date; solved: boolean }[]
      >(repeatedMistakesSql(ctx, scope, REPEATED_MISTAKES_LIMIT)),
      this.prisma.$queryRaw<
        { kind: ActivityThemeStat["kind"]; key: string; label: string | null; graded: number; correct: number; puzzle_set: string }[]
      >(
        themesSql(ctx, scope)
      ),
      this.prisma.$queryRaw<{ earlier: boolean; graded: number; correct: number }[]>(
        trendSql(ctx, scope, trendWindow.start, trendWindow.split, trendWindow.end)
      ),
      this.prisma.$queryRaw<{ kind: string; id: string; label: string | null; happened_at: Date | null }[]>(facetsSql(ctx))
    ]);

    const totalsByType = new Map(totals.map((t) => [t.type, t]));
    const gradedMap = new Map(gradedByType.map((g) => [g.type, g]));
    const byType: StudentActivityTypeStats[] = STUDENT_ACTIVITY_TYPES.filter(
      (type) => totalsByType.has(type) || gradedMap.has(type)
    ).map((type) => {
      const t = totalsByType.get(type);
      const g = gradedMap.get(type);
      return {
        ...accuracyStats(g?.graded ?? 0, g?.correct ?? 0),
        activities: t?.activities ?? 0,
        attempted: t?.attempted ?? 0,
        completed: t?.completed ?? 0,
        type
      };
    });

    const sum = (pick: (t: TotalsRow) => number) => totals.reduce((acc, t) => acc + pick(t), 0);
    const graded = gradedByType.reduce((acc, g) => acc + g.graded, 0);
    const correct = gradedByType.reduce((acc, g) => acc + g.correct, 0);
    const accuracy = accuracyStats(graded, correct);
    const gradedActivities = sum((t) => t.graded_activities);
    const firstTryCorrect = sum((t) => t.first_try);
    const lastActivity = totals
      .map((t) => t.last_at)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    const themeStats: (ActivityThemeStat & { attemptSetKey: string })[] = themes
      .filter((t) => t.kind !== "THEME" || !NON_TEACHING_THEME_GROUPS.has(lichessTheme(t.key)?.group ?? ""))
      .map((t) => ({
        ...accuracyStats(t.graded, t.correct),
        attemptSetKey: t.puzzle_set,
        key: t.key,
        kind: t.kind,
        label: t.kind === "TYPE" ? this.typeLabel(t.key) : t.kind === "THEME" ? lichessThemeLabel(t.key) : (t.label ?? t.key)
      }));
    const weak = pickWeakThemes(themeStats, accuracy.accuracyPercent);

    const earlier = trend.find((r) => r.earlier);
    const recent = trend.find((r) => !r.earlier);
    const earlierStats = accuracyStats(earlier?.graded ?? 0, earlier?.correct ?? 0);
    const recentStats = accuracyStats(recent?.graded ?? 0, recent?.correct ?? 0);

    const classes = facets
      .filter((f) => f.kind === "class" && f.happened_at)
      .sort((a, b) => (b.happened_at as Date).getTime() - (a.happened_at as Date).getTime())
      .slice(0, FACET_CLASS_LIMIT)
      .map((f) => ({ id: f.id, startsAt: (f.happened_at as Date).toISOString(), title: f.label }));
    const assignments = facets
      .filter((f) => f.kind === "assignment")
      .sort((a, b) => (b.happened_at?.getTime() ?? 0) - (a.happened_at?.getTime() ?? 0))
      .slice(0, FACET_ASSIGNMENT_LIMIT)
      .map((f) => ({ id: f.id, title: f.label ?? "Assignment" }));
    const batches = facets
      .filter((f) => f.kind === "batch")
      .map((f) => ({ id: f.id, name: f.label ?? "Batch" }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      summary: {
        accuracy: { ...accuracy, smallSample: graded < ACCURACY_MIN_SAMPLE },
        byType,
        facets: { assignments, batches, classes },
        firstTry: {
          firstTryCorrect,
          gradedActivities,
          percent: gradedActivities > 0 ? Math.round((firstTryCorrect / gradedActivities) * 100) : null
        },
        granularity,
        insights: {
          comparableThemes: weak.comparable,
          repeatedMistakes: mistakes.map((m) => ({
            eventuallySolved: m.solved,
            gradedAttempts: m.graded,
            incorrectAttempts: m.incorrect,
            lastAt: m.last_at.toISOString(),
            puzzleId: m.puzzle_id,
            title: m.title
          })),
          trend: {
            earlier: earlierStats,
            recent: recentStats,
            splitAt: trendWindow.split.toISOString(),
            status: classifyTrend(earlierStats, recentStats)
          },
          weakThemes: weak.weak.map(({ attemptSetKey: _attemptSetKey, ...stat }) => stat)
        },
        lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
        puzzles: { uniqueAttempted: unique[0]?.attempted ?? 0, uniqueSolved: unique[0]?.solved ?? 0 },
        series: this.fillSeries(series, granularity, query.from, query.to ?? today),
        studentId,
        studentName: `${student.firstName} ${student.lastName ?? ""}`.trim(),
        timeZone,
        totals: {
          activities: sum((t) => t.activities),
          attempted: sum((t) => t.attempted),
          completed: sum((t) => t.completed),
          incomplete: sum((t) => t.incomplete),
          notStarted: sum((t) => t.not_started),
          skipped: sum((t) => t.skipped),
          unanswered: sum((t) => t.unanswered)
        }
      }
    };
  }

  /**
   * The trend compares the two halves of the chosen range (capped at now), or
   * — with no start chosen — the last TREND_DEFAULT_HALF_DAYS days with the ones before.
   */
  private trendWindow(scope: ResolvedScope): { start: Date; split: Date; end: Date } {
    const now = new Date();
    const end = scope.end && scope.end < now ? scope.end : now;
    const start = scope.start ?? new Date(end.getTime() - 2 * TREND_DEFAULT_HALF_DAYS * DAY_MS);
    const split = new Date(start.getTime() + Math.max(0, end.getTime() - start.getTime()) / 2);
    return { end, split, start };
  }

  /** Empty buckets between the range's ends are filled, so the chart's spacing is honest. */
  private fillSeries(
    rows: { bucket: string; activities: number; graded: number; correct: number }[],
    granularity: ActivityGranularity,
    fromDay: string | undefined,
    toDay: string
  ) {
    const byBucket = new Map(rows.map((r) => [r.bucket, r]));
    const first = fromDay ? this.truncDay(fromDay, granularity) : rows[0]?.bucket;
    const keys: string[] = [];
    if (first) {
      const last = this.truncDay(toDay, granularity);
      for (let key = first; key <= last && keys.length < 400; key = this.nextBucket(key, granularity)) keys.push(key);
    }
    for (const r of rows) if (!keys.includes(r.bucket)) keys.push(r.bucket);
    keys.sort();
    return keys.map((bucket) => {
      const r = byBucket.get(bucket);
      const { accuracyPercent, correctAttempts, gradedAttempts } = accuracyStats(r?.graded ?? 0, r?.correct ?? 0);
      return { accuracyPercent, activities: r?.activities ?? 0, bucket, correctAttempts, gradedAttempts };
    });
  }

  /** PostgreSQL's date_trunc on a calendar day: weeks start on Monday. */
  private truncDay(day: string, granularity: ActivityGranularity): string {
    if (granularity === "month") return `${day.slice(0, 7)}-01`;
    if (granularity === "day") return day;
    const d = new Date(`${day}T00:00:00Z`);
    const offset = (d.getUTCDay() + 6) % 7;
    return new Date(d.getTime() - offset * DAY_MS).toISOString().slice(0, 10);
  }

  private nextBucket(day: string, granularity: ActivityGranularity): string {
    const d = new Date(`${day}T00:00:00Z`);
    if (granularity === "month") d.setUTCMonth(d.getUTCMonth() + 1);
    else d.setUTCDate(d.getUTCDate() + (granularity === "week" ? 7 : 1));
    return d.toISOString().slice(0, 10);
  }

  private typeLabel(key: string): string {
    const words = key.toLowerCase().replace(/_/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  // ── Plumbing ───────────────────────────────────────────────

  private context(viewer: User, studentId: string): HistoryContext {
    return { staffViewer: viewer.role !== UserRole.STUDENT, studentId };
  }

  /** Calendar days in the viewer's zone → UTC instants (`end` exclusive). */
  private resolveScope(query: StudentActivityScope, timeZone: string): ResolvedScope {
    const toUtc = (day: string, plusDays = 0) => {
      const [y, m, d] = day.split("-").map(Number);
      const shifted = new Date(Date.UTC(y, m - 1, d + plusDays));
      return zonedDateToUtc(timeZone, shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
    };
    return {
      assignmentId: query.assignmentId,
      batchId: query.batchId,
      classId: query.classId,
      end: query.to ? toUtc(query.to, 1) : undefined,
      start: query.from ? toUtc(query.from) : undefined,
      type: query.type
    };
  }

  private timeZoneOf(viewer: User): string {
    const tz = viewer.timezone || DEFAULT_TIME_ZONE;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    } catch {
      return DEFAULT_TIME_ZONE;
    }
  }

  private dayString({ year, month, day }: { year: number; month: number; day: number }): string {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  private encodeCursor(at: Date, key: string): string {
    return Buffer.from(JSON.stringify([at.toISOString(), key])).toString("base64url");
  }

  private decodeCursor(cursor: string): { at: Date; key: string } {
    try {
      const [iso, key] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown[];
      const at = typeof iso === "string" ? new Date(iso) : null;
      if (!at || Number.isNaN(at.getTime()) || typeof key !== "string" || key.length > 200) throw new Error();
      return { at, key };
    } catch {
      throw new BadRequestException("That page link has expired — reload the history.");
    }
  }

  private parse<S extends z.ZodType>(schema: S, raw: Query): z.output<S> {
    const result = schema.safeParse(raw);
    if (!result.success) {
      throw new BadRequestException(result.error.issues[0]?.message ?? "Invalid filters.");
    }
    return result.data;
  }

  private async loadStudent(studentId: string) {
    const student = await this.prisma.user.findFirst({
      where: { id: studentId, role: UserRole.STUDENT },
      select: { firstName: true, lastName: true }
    });
    if (!student) throw new NotFoundException("Student not found.");
    return student;
  }

  private assertStudent(viewer: User): void {
    if (viewer.role !== UserRole.STUDENT) throw new ForbiddenException("Only students have an activity history.");
  }

  private authenticate(accessToken: string | undefined): Promise<User> {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  REVISION_GRADES,
  REVISION_POLICY,
  addLocalDays,
  allowedRevisionGrades,
  collectPuzzleTopicSubtreeIds,
  hasLongTermRecall,
  isSystemPuzzleFolder,
  lichessThemeLabel,
  orderRevisionQueue,
  revisionDayBounds,
  revisionDueStatus,
  revisionLocalDay,
  revisionOutcome,
  scheduleRevision,
  type RevisionCurrent,
  type RevisionGrade,
  type RevisionItemReport,
  type RevisionNextResponse,
  type RevisionPendingRating,
  type RevisionQueueEntry,
  type RevisionRecommendRequest,
  type RevisionRecommendResponse,
  type RevisionReportResponse,
  type RevisionReviewRequest,
  type RevisionReviewResponse,
  type RevisionSessionResponse,
  type RevisionSkipRequest,
  type RevisionSummary,
  type RevisionSummaryResponse,
  type RevisionWeekPoint
} from "@nexa-chess/types";
import {
  Prisma,
  PuzzleAttemptContext,
  PuzzleStatus,
  PuzzleVisibility,
  RevisionItemKind,
  RevisionItemSource,
  RevisionItemStatus,
  UserRole,
  UserStatus,
  type PuzzleAttempt,
  type RevisionItem,
  type User
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { assertCanViewStudent } from "../progress/student-access";
import { authenticateUser, fullName, isAdminRole } from "../puzzle/puzzle-auth.helper";

// ──────────────────────────────────────────────────────────────
// Smart Revision (docs/SMART_REVISION.md). Items reference library puzzles and
// folders; every review is an ordinary PuzzleAttempt (context REVISION) graded
// by PuzzleAttemptService — this service only picks what is due, opens the
// attempt, and schedules the item once the student rates their recall. The
// schedule itself is the pure scheduleRevision() in @nexa-chess/types.
// ──────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
/** Mistake seeding adds at most this many puzzles per call; the next call continues (see syncMistakes). */
export const MISTAKE_BATCH = 200;
/** A folder item draws from at most this many of its puzzles. */
const TOPIC_CANDIDATES = 500;
const STREAK_LOOKBACK_DAYS = 366;
const REPORT_WEEKS = 8;
const MISSED_THEMES_DAYS = 90;

const itemInclude = {
  recommendedBy: { select: { firstName: true, lastName: true } }
} satisfies Prisma.RevisionItemInclude;
type ItemRow = Prisma.RevisionItemGetPayload<{ include: typeof itemInclude }>;

type PuzzleInfo = { id: string; title: string; estimatedSeconds: number | null; tags: string[]; available: boolean };
type TopicInfo = { id: string; name: string; candidateIds: string[]; estimate: number };

/** Everything one request needs about the student's revision, computed once. */
type RevisionState = {
  student: User;
  now: Date;
  items: ItemRow[];
  puzzles: Map<string, PuzzleInfo>;
  topics: Map<string, TopicInfo>;
  available: (item: ItemRow) => boolean;
  /** Session order (current item first, if any). */
  sessionIds: string[];
  summary: RevisionSummary;
};

@Injectable()
export class RevisionService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  // ── Student ──

  async summaryMine(accessToken: string | undefined): Promise<RevisionSummaryResponse> {
    const student = await this.authStudent(accessToken);
    await this.syncMistakes(student);
    const state = await this.loadState(student);
    return { summary: state.summary };
  }

  async sessionMine(accessToken: string | undefined): Promise<RevisionSessionResponse> {
    const student = await this.authStudent(accessToken);
    await this.syncMistakes(student);
    let state = await this.loadState(student);
    if (await this.releaseDeadCurrent(state)) state = await this.loadState(student);
    const byId = new Map(state.items.map((i) => [i.id, i]));
    const open = state.items.find((i) => i.currentAttemptId);
    return {
      current: open ? this.toCurrent(state, open, await this.openAttemptInfo(open.currentAttemptId)) : null,
      queue: state.sessionIds.map((id) => this.toQueueEntry(state, byId.get(id) as ItemRow)),
      summary: state.summary
    };
  }

  /**
   * The item to review now: the open one if there is one, else the head of the
   * queue, with a fresh REVISION attempt. Racing calls (a double click, two
   * tabs) serialize on the item's row lock in openOnItem: the first opens the
   * attempt, the rest find it and resume it.
   */
  async next(accessToken: string | undefined): Promise<RevisionNextResponse> {
    const student = await this.authStudent(accessToken);
    await this.syncMistakes(student);
    let state = await this.loadState(student);
    if (await this.releaseDeadCurrent(state)) state = await this.loadState(student);

    // An open item — still being solved, or finished and waiting for its rating — always comes first.
    const open = state.items.find((i) => i.currentAttemptId);
    if (open) {
      return { current: this.toCurrent(state, open, await this.openAttemptInfo(open.currentAttemptId)), summary: state.summary };
    }
    const headId = state.sessionIds[0];
    if (!headId) return { current: null, summary: state.summary };
    const item = state.items.find((i) => i.id === headId) as ItemRow;

    const puzzleId = item.kind === RevisionItemKind.PUZZLE ? item.puzzleId : await this.pickTopicPuzzle(state, item);
    if (!puzzleId) return { current: null, summary: state.summary };

    await this.openOnItem(student.id, item.id, puzzleId);
    const after = await this.loadState(student);
    const opened = after.items.find((i) => i.id === item.id && i.currentAttemptId);
    return {
      current: opened ? this.toCurrent(after, opened, await this.openAttemptInfo(opened.currentAttemptId)) : null,
      summary: after.summary
    };
  }

  /**
   * Rate a finished review. The grade is capped by the attempt the server
   * graded: a miss is always Again, a solve with a wrong move or a hint at
   * most Hard. A replay of an already recorded review returns that review.
   */
  async review(accessToken: string | undefined, dto: RevisionReviewRequest): Promise<RevisionReviewResponse> {
    const student = await this.authStudent(accessToken);
    const replay = await this.recordedReview(student, dto.attemptId);
    if (replay) return replay;

    const item = await this.prisma.revisionItem.findFirst({
      where: { currentAttemptId: dto.attemptId, studentId: student.id }
    });
    if (!item) {
      // A racing request (a double click) may have recorded this very review
      // between the check above and this lookup — answer with that one.
      const raced = await this.recordedReview(student, dto.attemptId);
      if (raced) return raced;
      throw new NotFoundException("This revision item isn't open any more.");
    }
    const attempt = await this.prisma.puzzleAttempt.findUnique({ where: { id: dto.attemptId } });
    if (!attempt || attempt.studentId !== student.id || attempt.context !== PuzzleAttemptContext.REVISION) {
      throw new NotFoundException("Attempt not found.");
    }
    if (attempt.status !== "SOLVED" && attempt.status !== "FAILED") {
      throw new BadRequestException("Finish the puzzle before rating it.");
    }
    const outcome = revisionOutcome({
      hintsUsed: attempt.hintsUsed,
      solved: attempt.status === "SOLVED",
      wrongMoves: attempt.wrongMoves
    });
    if (!allowedRevisionGrades(outcome).includes(dto.grade)) {
      throw new BadRequestException(
        outcome === "FAILED"
          ? "A puzzle you didn't solve is always rated Again."
          : "You used a hint or played a wrong move, so the most you can rate it is Hard."
      );
    }

    try {
      await this.recordReview(student, item, attempt, dto.grade);
    } catch (error) {
      if (error instanceof ConflictException) {
        // A racing request recorded it a moment ago: answer with that one.
        const winner = await this.recordedReview(student, dto.attemptId);
        if (winner) return winner;
      }
      throw error;
    }
    return this.reviewResponse(student, item.id, dto.grade, outcome, attempt.puzzleId);
  }

  /** The review already recorded for this attempt, if it is the caller's (anyone else's is a 404). */
  private async recordedReview(student: User, attemptId: string): Promise<RevisionReviewResponse | null> {
    const recorded = await this.prisma.revisionReview.findUnique({ where: { attemptId } });
    if (!recorded) return null;
    if (recorded.studentId !== student.id) throw new NotFoundException("Review not found.");
    return this.reviewResponse(student, recorded.itemId, recorded.grade, recorded.outcome, recorded.puzzleId);
  }

  /**
   * "Not now": the item goes to the back of today's session; its schedule is
   * untouched. An attempt with a wrong move already played is evidence it
   * wasn't recalled, so that skip is recorded as Again rather than erased.
   */
  async skip(accessToken: string | undefined, dto: RevisionSkipRequest): Promise<RevisionSummaryResponse> {
    const student = await this.authStudent(accessToken);
    const item = await this.prisma.revisionItem.findFirst({
      where: { id: dto.itemId, status: RevisionItemStatus.ACTIVE, studentId: student.id }
    });
    if (!item) throw new NotFoundException("Revision item not found.");

    if (item.currentAttemptId) {
      const attempt = await this.prisma.puzzleAttempt.findUnique({ where: { id: item.currentAttemptId } });
      if (attempt && (attempt.status === "SOLVED" || attempt.status === "FAILED")) {
        throw new ConflictException("You've finished this puzzle — rate it instead.");
      }
      if (attempt?.status === "IN_PROGRESS") {
        if (attempt.wrongMoves > 0) {
          const closed = await this.prisma.puzzleAttempt.updateMany({
            where: { id: attempt.id, status: "IN_PROGRESS" },
            data: { accuracyPercent: 0, completedAt: new Date(), result: "FAILED", scorePercent: 0, status: "FAILED" }
          });
          if (closed.count > 0) {
            const failed = await this.prisma.puzzleAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
            await this.recordReview(student, item, failed, "AGAIN").catch((e) => {
              if (!(e instanceof ConflictException)) throw e;
            });
          }
        } else {
          await this.prisma.puzzleAttempt.updateMany({
            where: { id: attempt.id, status: "IN_PROGRESS" },
            data: { completedAt: new Date(), status: "ABANDONED" }
          });
        }
      }
    }
    await this.prisma.revisionItem.updateMany({
      where: { currentAttemptId: item.currentAttemptId, id: item.id },
      data: { currentAttemptId: null, skippedAt: new Date() }
    });
    const state = await this.loadState(student);
    return { summary: state.summary };
  }

  async reportMine(accessToken: string | undefined): Promise<RevisionReportResponse> {
    const student = await this.authStudent(accessToken);
    await this.syncMistakes(student);
    return this.report(student, student);
  }

  // ── Coach / admin ──

  async reportFor(accessToken: string | undefined, studentId: string): Promise<RevisionReportResponse> {
    const viewer = await this.authStaff(accessToken);
    const student = await this.loadStudent(viewer, studentId);
    await this.syncMistakes(student);
    return this.report(student, viewer);
  }

  /**
   * Recommend library puzzles or one folder. Every puzzle must be published,
   * openable by the student, and visible to the recommending coach; a folder
   * must hold at least one such puzzle. An item the student already has is
   * re-activated and brought forward to now — never duplicated.
   */
  async recommend(
    accessToken: string | undefined,
    studentId: string,
    dto: RevisionRecommendRequest
  ): Promise<RevisionRecommendResponse> {
    const viewer = await this.authStaff(accessToken);
    const student = await this.loadStudent(viewer, studentId);
    const coachIds = await this.studentCoachIds(student.id);
    const now = new Date();

    const keys: { contentKey: string; kind: RevisionItemKind; puzzleId?: string; topicId?: string }[] = [];
    const puzzleIds = [...new Set(dto.puzzleIds ?? [])];
    if (puzzleIds.length > 0) {
      const rows = await this.prisma.puzzle.findMany({
        where: { id: { in: puzzleIds }, status: PuzzleStatus.PUBLISHED },
        select: { createdById: true, id: true, solutionMovesJson: true, visibility: true }
      });
      const ok = rows.filter(
        (p) =>
          hasSolution(p.solutionMovesJson) &&
          studentCanOpen(p, coachIds) &&
          (isAdminRole(viewer.role) || p.visibility === PuzzleVisibility.GLOBAL || p.createdById === viewer.id)
      );
      if (ok.length !== puzzleIds.length) {
        const bad = puzzleIds.length - ok.length;
        throw new BadRequestException(
          `${bad} of these puzzles can't be recommended — unpublished, without a solution, or not open to this student.`
        );
      }
      for (const p of ok) keys.push({ contentKey: `puzzle:${p.id}`, kind: RevisionItemKind.PUZZLE, puzzleId: p.id });
    }
    if (dto.topicId) {
      const topic = await this.prisma.puzzleTopic.findUnique({ where: { id: dto.topicId } });
      if (!topic || isSystemPuzzleFolder(topic)) throw new NotFoundException("Folder not found.");
      const candidates = await this.topicCandidates([topic.id], coachIds);
      if ((candidates.get(topic.id)?.length ?? 0) === 0) {
        throw new BadRequestException("That folder has no published puzzles this student can open.");
      }
      keys.push({ contentKey: `topic:${topic.id}`, kind: RevisionItemKind.TOPIC, topicId: topic.id });
    }

    const existing = await this.prisma.revisionItem.findMany({
      where: { contentKey: { in: keys.map((k) => k.contentKey) }, studentId: student.id },
      select: { contentKey: true, dueAt: true, id: true }
    });
    const existingKeys = new Set(existing.map((e) => e.contentKey));
    const fresh = keys.filter((k) => !existingKeys.has(k.contentKey));
    const note = dto.note?.trim() || null;

    const created = fresh.length
      ? await this.prisma.revisionItem.createMany({
          data: fresh.map((k) => ({
            contentKey: k.contentKey,
            dueAt: now,
            kind: k.kind,
            note,
            puzzleId: k.puzzleId ?? null,
            recommendedAt: now,
            recommendedById: viewer.id,
            source: RevisionItemSource.COACH,
            studentId: student.id,
            topicId: k.topicId ?? null
          })),
          skipDuplicates: true
        })
      : { count: 0 };
    for (const row of existing) {
      await this.prisma.revisionItem.update({
        where: { id: row.id },
        data: {
          dueAt: row.dueAt.getTime() > now.getTime() ? now : row.dueAt,
          note,
          recommendedAt: now,
          recommendedById: viewer.id,
          removedAt: null,
          removedById: null,
          status: RevisionItemStatus.ACTIVE
        }
      });
    }
    return { added: created.count, updated: existing.length };
  }

  /**
   * Withdraw a recommendation: the coach who made it, or an admin. A
   * coach-sourced item stops being revised; a mistake the coach had flagged
   * stays in the student's revision, just no longer marked as recommended.
   */
  async removeRecommendation(
    accessToken: string | undefined,
    studentId: string,
    itemId: string
  ): Promise<{ removed: true }> {
    const viewer = await this.authStaff(accessToken);
    const student = await this.loadStudent(viewer, studentId);
    const item = await this.prisma.revisionItem.findFirst({ where: { id: itemId, studentId: student.id } });
    if (!item || !item.recommendedById || item.status !== RevisionItemStatus.ACTIVE) {
      throw new NotFoundException("Recommendation not found.");
    }
    if (!isAdminRole(viewer.role) && item.recommendedById !== viewer.id) {
      throw new ForbiddenException("Only the coach who recommended this (or an admin) can remove it.");
    }
    const now = new Date();
    const claimed = await this.prisma.revisionItem.updateMany({
      where: { id: item.id, recommendedById: item.recommendedById, status: RevisionItemStatus.ACTIVE },
      data:
        item.source === RevisionItemSource.COACH
          ? { currentAttemptId: null, removedAt: now, removedById: viewer.id, status: RevisionItemStatus.REMOVED }
          : { note: null, recommendedAt: null, recommendedById: null }
    });
    if (claimed.count === 0) throw new NotFoundException("Recommendation not found.");
    return { removed: true };
  }

  // ── internals: auth ──

  private async authStudent(accessToken: string | undefined): Promise<User> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.STUDENT) throw new ForbiddenException("Only students have a revision queue.");
    return user;
  }

  private async authStaff(accessToken: string | undefined): Promise<User> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.COACH && !isAdminRole(user.role)) {
      throw new ForbiddenException("Only coaches and admins can manage a student's revision.");
    }
    return user;
  }

  /** Scope first (403 for a student outside the coach's batches), then existence. */
  private async loadStudent(viewer: User, studentId: string): Promise<User> {
    await assertCanViewStudent(this.prisma, viewer, studentId);
    const student = await this.prisma.user.findUnique({ where: { id: studentId } });
    if (
      !student ||
      student.role !== UserRole.STUDENT ||
      student.status === UserStatus.ARCHIVED ||
      student.status === UserStatus.DELETED
    ) {
      throw new NotFoundException("Student not found.");
    }
    return student;
  }

  private async studentCoachIds(studentId: string): Promise<string[]> {
    const rows = await this.prisma.batchStudent.findMany({
      where: { isDeleted: false, studentId },
      select: { batch: { select: { coaches: { where: { isDeleted: false }, select: { coachId: true } } } } }
    });
    return [...new Set(rows.flatMap((r) => r.batch.coaches.map((c) => c.coachId)))];
  }

  // ── internals: seeding ──

  /**
   * Seed MISTAKE items from graded attempts that show one: a failed puzzle
   * the student actually tried (a move played or a wrong move), or a solve
   * with a wrong move. A hint alone is not a mistake, and nothing is seeded
   * from a homework set the student can still retry. First due the local day
   * after the (first) miss.
   *
   * Bounded and incremental: every filter is in SQL — including "this puzzle
   * has no item yet" — so each row returned becomes an item. A call seeds at
   * most MISTAKE_BATCH puzzles (newest misses first); the next call continues
   * with the rest, so a long history is fully covered across a few loads and
   * nothing older is ever skipped for good. Idempotent: the unique (student,
   * contentKey) also absorbs a racing call — and a recommendation a coach
   * removed is never re-seeded.
   */
  private async syncMistakes(student: User): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ id: string; puzzleId: string; completedAt: Date }[]>`
      SELECT first.id, first."puzzleId", first."completedAt"
      FROM (
        SELECT DISTINCT ON (pa."puzzleId") pa.id, pa."puzzleId", pa."completedAt"
        FROM puzzle_attempts pa
        LEFT JOIN student_assignments sa ON sa.id = pa."studentAssignmentId"
        WHERE pa."studentId" = ${student.id}
          AND pa.context <> 'REVISION'
          AND pa.status IN ('SOLVED', 'FAILED')
          AND pa."completedAt" IS NOT NULL
          AND (
            pa."wrongMoves" > 0
            OR (pa.status = 'FAILED' AND jsonb_typeof(pa."movesJson") = 'array' AND jsonb_array_length(pa."movesJson") > 0)
          )
          AND (pa."studentAssignmentId" IS NULL OR sa.status = 'COMPLETED')
          AND NOT EXISTS (
            SELECT 1 FROM revision_items ri
            WHERE ri."studentId" = ${student.id} AND ri."contentKey" = 'puzzle:' || pa."puzzleId"
          )
        ORDER BY pa."puzzleId", pa."completedAt" ASC, pa.id ASC
      ) first
      ORDER BY first."completedAt" DESC, first.id ASC
      LIMIT ${MISTAKE_BATCH}`;
    if (rows.length === 0) return 0;
    const created = await this.prisma.revisionItem.createMany({
      data: rows.map((a) => ({
        contentKey: `puzzle:${a.puzzleId}`,
        dueAt: addLocalDays(a.completedAt, 1, student.timezone),
        kind: RevisionItemKind.PUZZLE,
        puzzleId: a.puzzleId,
        source: RevisionItemSource.MISTAKE,
        sourceAttemptId: a.id,
        studentId: student.id
      })),
      skipDuplicates: true
    });
    return created.count;
  }

  // ── internals: state ──

  private async loadState(student: User, now: Date = new Date()): Promise<RevisionState> {
    const tz = student.timezone;
    const { start, end } = revisionDayBounds(now, tz);
    const [items, coachIds, reviewsToday, streakRows] = await Promise.all([
      this.prisma.revisionItem.findMany({
        where: { status: RevisionItemStatus.ACTIVE, studentId: student.id },
        include: itemInclude,
        orderBy: { id: "asc" }
      }),
      this.studentCoachIds(student.id),
      this.prisma.revisionReview.findMany({
        where: { reviewedAt: { gte: start }, studentId: student.id },
        select: { itemId: true }
      }),
      this.prisma.revisionReview.findMany({
        where: { reviewedAt: { gte: new Date(now.getTime() - STREAK_LOOKBACK_DAYS * DAY_MS) }, studentId: student.id },
        select: { reviewedAt: true }
      })
    ]);

    const puzzleIds = items.flatMap((i) => (i.puzzleId ? [i.puzzleId] : []));
    const topicIds = items.flatMap((i) => (i.topicId ? [i.topicId] : []));
    const [puzzleRows, topicRows, candidates] = await Promise.all([
      puzzleIds.length
        ? this.prisma.puzzle.findMany({
            where: { id: { in: puzzleIds } },
            select: {
              createdById: true,
              estimatedSeconds: true,
              id: true,
              solutionMovesJson: true,
              status: true,
              tags: true,
              title: true,
              visibility: true
            }
          })
        : Promise.resolve([]),
      topicIds.length
        ? this.prisma.puzzleTopic.findMany({ where: { id: { in: topicIds } }, select: { id: true, name: true, slug: true } })
        : Promise.resolve([]),
      this.topicCandidates(topicIds, coachIds)
    ]);

    const puzzles = new Map<string, PuzzleInfo>(
      puzzleRows.map((p) => [
        p.id,
        {
          available: p.status === PuzzleStatus.PUBLISHED && hasSolution(p.solutionMovesJson) && studentCanOpen(p, coachIds),
          estimatedSeconds: p.estimatedSeconds,
          id: p.id,
          tags: p.tags,
          title: p.title
        }
      ])
    );
    const topics = new Map<string, TopicInfo>(
      topicRows
        .filter((t) => !isSystemPuzzleFolder(t))
        .map((t) => [
          t.id,
          { candidateIds: candidates.get(t.id) ?? [], estimate: REVISION_POLICY.defaultItemSeconds, id: t.id, name: t.name }
        ])
    );
    const available = (item: ItemRow) =>
      item.kind === RevisionItemKind.PUZZLE
        ? !!(item.puzzleId && puzzles.get(item.puzzleId)?.available)
        : !!(item.topicId && (topics.get(item.topicId)?.candidateIds.length ?? 0) > 0);

    // New items introduced today = items whose first review was today.
    const reviewedTodayIds = [...new Set(reviewsToday.map((r) => r.itemId))];
    const firstReviews = reviewedTodayIds.length
      ? await this.prisma.revisionReview.groupBy({
          by: ["itemId"],
          where: { itemId: { in: reviewedTodayIds } },
          _min: { reviewedAt: true }
        })
      : [];
    const introducedToday = firstReviews.filter((r) => (r._min.reviewedAt as Date).getTime() >= start.getTime()).length;
    const newRemaining = Math.max(0, REVISION_POLICY.newPerDay - introducedToday);

    const usable = items.filter(available);
    const open = usable.find((i) => i.currentAttemptId);
    const ordered = orderRevisionQueue(
      usable
        .filter((i) => i.id !== open?.id)
        .map((i) => ({
          dueAt: i.dueAt,
          id: i.id,
          intervalDays: i.intervalDays,
          lapses: i.lapses,
          recommended: !!i.recommendedById,
          reviewCount: i.reviewCount,
          skippedToday: !!i.skippedAt && i.skippedAt.getTime() >= start.getTime()
        })),
      now,
      { limit: REVISION_POLICY.sessionLimit - (open ? 1 : 0), newRemaining: newRemaining - (open && open.reviewCount === 0 ? 1 : 0) }
    );
    const sessionIds = open ? [open.id, ...ordered] : ordered;

    const byId = new Map(items.map((i) => [i.id, i]));
    const estimateSeconds = sessionIds.reduce((sum, id) => {
      const item = byId.get(id) as ItemRow;
      const seconds =
        item.kind === RevisionItemKind.PUZZLE
          ? puzzles.get(item.puzzleId as string)?.estimatedSeconds ?? REVISION_POLICY.defaultItemSeconds
          : REVISION_POLICY.defaultItemSeconds;
      return sum + seconds;
    }, 0);

    const reviewed = usable.filter((i) => i.reviewCount > 0);
    const future = usable.filter((i) => i.dueAt.getTime() > now.getTime()).map((i) => i.dueAt.getTime());
    const summary: RevisionSummary = {
      activeItems: usable.length,
      completedToday: reviewsToday.length,
      dueToday: reviewed.filter((i) => i.dueAt.getTime() < end.getTime()).length,
      estimatedMinutes: Math.ceil(estimateSeconds / 60),
      longTermRecall: usable.filter((i) => hasLongTermRecall(i)).length,
      newAvailable: usable.filter((i) => i.reviewCount === 0 && i.dueAt.getTime() <= now.getTime()).length,
      newRemainingToday: newRemaining,
      nextDueAt: sessionIds.length === 0 && future.length ? new Date(Math.min(...future)).toISOString() : null,
      overdue: reviewed.filter((i) => i.dueAt.getTime() < start.getTime()).length,
      sessionSize: sessionIds.length,
      streakDays: reviewStreak(
        streakRows.map((r) => revisionLocalDay(r.reviewedAt, tz)),
        revisionLocalDay(now, tz)
      ),
      unavailableItems: items.length - usable.length
    };
    return { available, items, now, puzzles, sessionIds, student, summary, topics };
  }

  /** Visible, published, solvable puzzles per folder (subfolders included). */
  private async topicCandidates(topicIds: string[], coachIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (topicIds.length === 0) return result;
    const links = await this.prisma.puzzleTopic.findMany({ select: { id: true, parentId: true } });
    const subtree = new Map(topicIds.map((id) => [id, collectPuzzleTopicSubtreeIds(links, id)]));
    const all = [...new Set([...subtree.values()].flat())];
    const rows = await this.prisma.puzzle.findMany({
      where: {
        status: PuzzleStatus.PUBLISHED,
        topicId: { in: all },
        OR: [
          { visibility: PuzzleVisibility.GLOBAL },
          ...(coachIds.length ? [{ createdById: { in: coachIds }, visibility: PuzzleVisibility.PRIVATE }] : [])
        ]
      },
      select: { id: true, solutionMovesJson: true, topicId: true },
      orderBy: { id: "asc" },
      take: TOPIC_CANDIDATES * topicIds.length
    });
    for (const [topicId, ids] of subtree) {
      const inTree = new Set(ids);
      result.set(
        topicId,
        rows
          .filter((r) => inTree.has(r.topicId) && hasSolution(r.solutionMovesJson))
          .slice(0, TOPIC_CANDIDATES)
          .map((r) => r.id)
      );
    }
    return result;
  }

  /**
   * A folder review solves one of its puzzles: one the student has never
   * opened if any (rotating by review count, so it is deterministic but not
   * always the same), else the one they last met longest ago.
   */
  private async pickTopicPuzzle(state: RevisionState, item: ItemRow): Promise<string | null> {
    const candidates = state.topics.get(item.topicId as string)?.candidateIds ?? [];
    if (candidates.length === 0) return null;
    const attempts = await this.prisma.puzzleAttempt.groupBy({
      by: ["puzzleId"],
      where: { puzzleId: { in: candidates }, studentId: state.student.id },
      _max: { startedAt: true }
    });
    const lastSeen = new Map(attempts.map((a) => [a.puzzleId, (a._max.startedAt as Date).getTime()]));
    const unseen = candidates.filter((id) => !lastSeen.has(id));
    if (unseen.length > 0) return unseen[item.reviewCount % unseen.length];
    return [...candidates].sort((a, b) => (lastSeen.get(a) ?? 0) - (lastSeen.get(b) ?? 0) || a.localeCompare(b))[0];
  }

  /**
   * Opens a REVISION attempt on the item unless one is already open. The item
   * row is locked (FOR UPDATE) for the check-create-claim, so concurrent calls
   * queue behind each other and only the first creates an attempt. An
   * attempt-number clash with a puzzle attempt started elsewhere at the same
   * moment aborts the transaction (P2002); it is retried.
   */
  private async openOnItem(studentId: string, itemId: string, puzzleId: string): Promise<void> {
    for (let tries = 0; ; tries += 1) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const [row] = await tx.$queryRaw<{ currentAttemptId: string | null }[]>`
            SELECT "currentAttemptId" FROM revision_items
            WHERE id = ${itemId} AND "studentId" = ${studentId} AND status = 'ACTIVE'
            FOR UPDATE`;
          if (!row || row.currentAttemptId) return;
          const last = await tx.puzzleAttempt.aggregate({ where: { puzzleId, studentId }, _max: { attemptNumber: true } });
          const attempt = await tx.puzzleAttempt.create({
            data: {
              attemptNumber: (last._max.attemptNumber ?? 0) + 1,
              context: PuzzleAttemptContext.REVISION,
              puzzleId,
              studentId
            }
          });
          await tx.revisionItem.update({ where: { id: itemId }, data: { currentAttemptId: attempt.id } });
        });
        return;
      } catch (error) {
        if (tries < 3 && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
        throw error;
      }
    }
  }

  /** The open attempt's puzzle and, once it is finished, what the server graded and which ratings it accepts. */
  private async openAttemptInfo(
    attemptId: string | null
  ): Promise<{ puzzleId: string; pendingRating: RevisionPendingRating | null }> {
    if (!attemptId) throw new NotFoundException("Attempt not found.");
    const row = await this.prisma.puzzleAttempt.findUnique({
      where: { id: attemptId },
      select: { hintsUsed: true, puzzleId: true, status: true, wrongMoves: true }
    });
    if (!row) throw new NotFoundException("Attempt not found.");
    if (row.status !== "SOLVED" && row.status !== "FAILED") return { pendingRating: null, puzzleId: row.puzzleId };
    const outcome = revisionOutcome({ hintsUsed: row.hintsUsed, solved: row.status === "SOLVED", wrongMoves: row.wrongMoves });
    return { pendingRating: { allowedGrades: allowedRevisionGrades(outcome), outcome }, puzzleId: row.puzzleId };
  }

  /**
   * Releases an open item whose attempt is gone (a Trash purge) or was
   * abandoned outside revision, so it can be served again. A finished but
   * unrated attempt is NOT settled here: the student's rating is never
   * inferred (a closed tab is not a recall), so it stays open and comes first
   * until they rate it. True if anything changed.
   */
  private async releaseDeadCurrent(state: RevisionState): Promise<boolean> {
    let changed = false;
    for (const item of state.items.filter((i) => i.currentAttemptId)) {
      const attempt = await this.prisma.puzzleAttempt.findUnique({
        where: { id: item.currentAttemptId as string },
        select: { status: true }
      });
      if (attempt && attempt.status !== "ABANDONED") continue;
      await this.prisma.revisionItem.updateMany({
        where: { currentAttemptId: item.currentAttemptId, id: item.id },
        data: { currentAttemptId: null }
      });
      changed = true;
    }
    return changed;
  }

  /** Schedules the item and logs the review in one transaction, claimed by the attempt id. */
  private async recordReview(student: User, item: RevisionItem, attempt: PuzzleAttempt, grade: RevisionGrade): Promise<void> {
    const now = new Date();
    const { start } = revisionDayBounds(now, student.timezone);
    const outcome = revisionOutcome({
      hintsUsed: attempt.hintsUsed,
      solved: attempt.status === "SOLVED",
      wrongMoves: attempt.wrongMoves
    });
    await this.prisma.$transaction(async (tx) => {
      const againsToday = await tx.revisionReview.count({
        where: { grade: "AGAIN", itemId: item.id, reviewedAt: { gte: start } }
      });
      const { dueAt, state } = scheduleRevision({ againsToday, grade, now, state: item, timeZone: student.timezone });
      const claimed = await tx.revisionItem.updateMany({
        where: { currentAttemptId: attempt.id, id: item.id },
        data: {
          ...state,
          currentAttemptId: null,
          dueAt,
          lastGrade: grade,
          lastReviewedAt: now,
          skippedAt: null
        }
      });
      if (claimed.count === 0) throw new ConflictException("This review has already been recorded.");
      await tx.revisionReview.create({
        data: {
          attemptId: attempt.id,
          dueAtAfter: dueAt,
          grade,
          intervalAfter: state.intervalDays,
          intervalBefore: item.intervalDays,
          itemId: item.id,
          outcome,
          puzzleId: attempt.puzzleId,
          reviewedAt: now,
          studentId: student.id
        }
      });
    });
  }

  private async reviewResponse(
    student: User,
    itemId: string,
    grade: RevisionGrade,
    outcome: RevisionReviewResponse["outcome"],
    puzzleId: string | null
  ): Promise<RevisionReviewResponse> {
    const [item, puzzle, state] = await Promise.all([
      this.prisma.revisionItem.findUniqueOrThrow({ where: { id: itemId } }),
      puzzleId
        ? this.prisma.withDeleted.puzzle.findUnique({ where: { id: puzzleId }, select: { tags: true } })
        : Promise.resolve(null),
      this.loadState(student)
    ]);
    return {
      dueAt: item.dueAt.toISOString(),
      grade,
      intervalDays: item.intervalDays,
      itemId,
      longTermRecall: hasLongTermRecall(item),
      outcome,
      summary: state.summary,
      themes: puzzle?.tags ?? []
    };
  }

  // ── internals: mapping ──

  private topicName(state: RevisionState, item: ItemRow): string | null {
    return item.topicId ? state.topics.get(item.topicId)?.name ?? null : null;
  }

  private toQueueEntry(state: RevisionState, item: ItemRow): RevisionQueueEntry {
    return {
      dueStatus: revisionDueStatus(item, state.now, state.student.timezone),
      itemId: item.id,
      kind: item.kind,
      recommendedByName: fullName(item.recommendedBy),
      reviewCount: item.reviewCount,
      source: item.source,
      topicName: this.topicName(state, item)
    };
  }

  private toCurrent(
    state: RevisionState,
    item: ItemRow,
    attempt: { puzzleId: string; pendingRating: RevisionPendingRating | null }
  ): RevisionCurrent {
    return {
      attemptId: item.currentAttemptId as string,
      dueStatus: revisionDueStatus(item, state.now, state.student.timezone),
      itemId: item.id,
      kind: item.kind,
      note: item.note,
      pendingRating: attempt.pendingRating,
      puzzleId: attempt.puzzleId,
      recommendedByName: fullName(item.recommendedBy),
      reviewCount: item.reviewCount,
      source: item.source,
      topicName: this.topicName(state, item)
    };
  }

  private async report(student: User, viewer: User): Promise<RevisionReportResponse> {
    const state = await this.loadState(student);
    const now = state.now;
    const tz = student.timezone;
    const staff = viewer.id !== student.id;

    const [reviews, attempts] = await Promise.all([
      this.prisma.revisionReview.findMany({
        where: { reviewedAt: { gte: new Date(now.getTime() - Math.max(REPORT_WEEKS * 7 + 7, MISSED_THEMES_DAYS) * DAY_MS) }, studentId: student.id },
        select: { grade: true, puzzleId: true, reviewedAt: true }
      }),
      this.prisma.puzzleAttempt.findMany({
        where: { context: PuzzleAttemptContext.REVISION, status: { in: ["SOLVED", "FAILED"] }, studentId: student.id },
        select: { hintsUsed: true, status: true, wrongMoves: true }
      })
    ]);

    // Weeks start on the local Monday.
    const weekKey = (at: Date) => {
      const day = revisionLocalDay(at, tz);
      const d = new Date(`${day}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return d.toISOString().slice(0, 10);
    };
    const thisWeek = weekKey(now);
    const weeks: RevisionWeekPoint[] = [];
    for (let i = REPORT_WEEKS - 1; i >= 0; i -= 1) {
      const d = new Date(`${thisWeek}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 7 * i);
      weeks.push({ recalled: 0, reviews: 0, weekStart: d.toISOString().slice(0, 10) });
    }
    const weekIndex = new Map(weeks.map((w, i) => [w.weekStart, i]));
    const gradeCounts = Object.fromEntries(REVISION_GRADES.map((g) => [g, 0])) as Record<RevisionGrade, number>;
    const missedPuzzleIds: string[] = [];
    for (const r of reviews) {
      const w = weekIndex.get(weekKey(r.reviewedAt));
      if (w !== undefined) {
        weeks[w].reviews += 1;
        if (r.grade !== "AGAIN") weeks[w].recalled += 1;
      }
      if (now.getTime() - r.reviewedAt.getTime() <= 30 * DAY_MS) gradeCounts[r.grade] += 1;
      if (r.grade === "AGAIN" && r.puzzleId && now.getTime() - r.reviewedAt.getTime() <= MISSED_THEMES_DAYS * DAY_MS) {
        missedPuzzleIds.push(r.puzzleId);
      }
    }
    const tagRows = missedPuzzleIds.length
      ? await this.prisma.withDeleted.puzzle.findMany({
          where: { id: { in: [...new Set(missedPuzzleIds)] } },
          select: { id: true, tags: true }
        })
      : [];
    const tagsById = new Map(tagRows.map((p) => [p.id, p.tags]));
    const themeCounts = new Map<string, number>();
    for (const id of missedPuzzleIds) {
      for (const tag of tagsById.get(id) ?? []) themeCounts.set(tag, (themeCounts.get(tag) ?? 0) + 1);
    }
    const missedThemes = [...themeCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([theme, count]) => ({ count, label: lichessThemeLabel(theme), theme }));

    const items: RevisionItemReport[] = state.items
      .map((item) => {
        const puzzle = item.puzzleId ? state.puzzles.get(item.puzzleId) : undefined;
        const topicName = this.topicName(state, item);
        // The student's own list keeps an unseen recommended puzzle's title back — titles can name the idea.
        const showTitle = staff || item.kind === RevisionItemKind.TOPIC || item.reviewCount > 0 || item.source === RevisionItemSource.MISTAKE;
        const title =
          item.kind === RevisionItemKind.TOPIC
            ? topicName ?? "Folder (unavailable)"
            : puzzle && showTitle
              ? puzzle.title
              : puzzle
                ? "Recommended puzzle"
                : "Puzzle (unavailable)";
        return {
          available: state.available(item),
          canRemove: staff && !!item.recommendedById && (isAdminRole(viewer.role) || item.recommendedById === viewer.id),
          dueAt: item.dueAt.toISOString(),
          dueStatus: revisionDueStatus(item, now, tz),
          intervalDays: item.intervalDays,
          itemId: item.id,
          kind: item.kind,
          lapses: item.lapses,
          lastGrade: item.lastGrade,
          lastReviewedAt: item.lastReviewedAt?.toISOString() ?? null,
          longTermRecall: hasLongTermRecall(item),
          note: item.note,
          recommendedAt: item.recommendedAt?.toISOString() ?? null,
          recommendedByName: fullName(item.recommendedBy),
          repetitions: item.repetitions,
          reviewCount: item.reviewCount,
          source: item.source,
          title,
          topicName
        };
      })
      .sort((a, b) => Number(b.available) - Number(a.available) || a.dueAt.localeCompare(b.dueAt) || a.itemId.localeCompare(b.itemId));

    return {
      attempts: {
        clean: attempts.filter((a) => a.status === "SOLVED" && a.wrongMoves === 0 && a.hintsUsed === 0).length,
        graded: attempts.length,
        solved: attempts.filter((a) => a.status === "SOLVED").length
      },
      gradeCounts,
      items,
      missedThemes,
      strugglingConcepts: state.items
        .filter((i) => i.kind === RevisionItemKind.TOPIC && i.lapses >= 2)
        .map((i) => ({ itemId: i.id, lapses: i.lapses, title: this.topicName(state, i) ?? "Folder" }))
        .sort((a, b) => b.lapses - a.lapses),
      summary: state.summary,
      weeks
    };
  }
}

function hasSolution(raw: Prisma.JsonValue): boolean {
  return Array.isArray(raw) && raw.length > 0;
}

/** The student library rule (PuzzleAttemptService): GLOBAL, or PRIVATE by one of the student's coaches. */
function studentCanOpen(p: { visibility: PuzzleVisibility; createdById: string | null }, coachIds: string[]): boolean {
  return p.visibility === PuzzleVisibility.GLOBAL || (!!p.createdById && coachIds.includes(p.createdById));
}

/** Consecutive local days with a review, ending today — or yesterday, while today is still open. */
export function reviewStreak(days: readonly string[], today: string): number {
  const set = new Set(days);
  const step = (day: string) => {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  };
  let cursor = set.has(today) ? today : step(today);
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = step(cursor);
  }
  return streak;
}

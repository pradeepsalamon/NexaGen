import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type {
  AdjustLivePuzzlePointsRequest,
  AssignLivePuzzleRequest,
  AttemptMove,
  LivePuzzleAssignment,
  LivePuzzleBoardEntry,
  LivePuzzleBoardsResponse,
  LivePuzzleBoardStatus,
  LivePuzzleLeaderboardEntry,
  LivePuzzleLeaderboardResponse,
  LivePuzzleMessage,
  LivePuzzleRosterEntry,
  LivePuzzleSelfStatus,
  LivePuzzleStateResponse,
  PuzzleLeaderboardOptions,
  PuzzleScoring,
  StartPuzzleAttemptResponse,
  UpdateLivePuzzleRequest
} from "@nexa-chess/types";
import {
  computePuzzlePoints,
  encodeLivePuzzle,
  LIVE_CLASS_PUZZLE_TOPIC,
  parseLeaderboardOverride,
  parseScoringOverride,
  resolvePuzzleLeaderboard,
  resolvePuzzleScoring
} from "@nexa-chess/types";
import { Prisma, PuzzleStatus, PuzzleVisibility, UserRole } from "@prisma/client";
import { Chess } from "chess.js";
import { LiveClassService } from "../live-class/live-class.service";
import { LiveKitService } from "../live-class/livekit.service";
import { PrismaService } from "../prisma/prisma.service";
import { PuzzleAttemptService } from "./puzzle-attempt.service";
import { PuzzleScoringSettingsService } from "./puzzle-scoring-settings.service";
import { fullName } from "./puzzle-auth.helper";

const puzzleInclude = {
  puzzle: { include: { topic: { select: { name: true } } } }
} satisfies Prisma.LiveClassPuzzleAssignmentInclude;

type AssignmentRow = Prisma.LiveClassPuzzleAssignmentGetPayload<{ include: typeof puzzleInclude }>;

@Injectable()
export class LiveClassPuzzleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LiveKitService,
    private readonly liveClass: LiveClassService,
    private readonly attempts: PuzzleAttemptService,
    private readonly scoringSettings: PuzzleScoringSettingsService
  ) {}

  /** Coach-owner / admin pushes a published puzzle into the LIVE class. */
  async assign(
    accessToken: string | undefined,
    classId: string,
    dto: AssignLivePuzzleRequest
  ): Promise<LivePuzzleStateResponse> {
    const { user, liveSession } = await this.liveClass.resolveClassManager(accessToken, classId, {
      requireLive: true
    });

    const puzzle = await this.prisma.puzzle.findUnique({
      where: { id: dto.puzzleId },
      include: { topic: { select: { name: true } } }
    });
    if (!puzzle || puzzle.status !== PuzzleStatus.PUBLISHED) {
      throw new NotFoundException("Puzzle not found or not published.");
    }
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    if (
      !isAdmin &&
      puzzle.visibility === PuzzleVisibility.PRIVATE &&
      puzzle.createdById !== user.id
    ) {
      throw new ForbiddenException("You can only assign your own or global puzzles.");
    }

    // Freeze the effective rules onto the assignment: admin default → the
    // puzzle's own override → what the coach picked in the share dialog.
    const defaults = await this.scoringSettings.defaults();
    const scoring = resolvePuzzleScoring(
      defaults.scoring,
      parseScoringOverride(puzzle.scoringJson),
      dto.scoring
    );
    const leaderboard = resolvePuzzleLeaderboard(
      defaults.leaderboard,
      dto.revealLeaderboard === undefined
        ? undefined
        : { visibility: dto.revealLeaderboard ? "LIVE" : "HIDDEN" },
      dto.leaderboard
    );

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.liveClassPuzzleAssignment.updateMany({
        where: { liveClassId: classId, status: "ACTIVE" },
        data: { status: "ENDED", endedAt: new Date() }
      });
      return tx.liveClassPuzzleAssignment.create({
        data: {
          liveClassId: classId,
          puzzleId: puzzle.id,
          assignedById: user.id,
          durationSeconds: dto.durationSeconds ?? null,
          leaderboardJson: leaderboard as unknown as Prisma.InputJsonValue,
          revealLeaderboard: leaderboard.visibility === "LIVE",
          scoringJson: scoring as unknown as Prisma.InputJsonValue
        },
        include: puzzleInclude
      });
    });

    const assignment = this.toAssignment(created);
    await this.broadcast(liveSession.roomName, { type: "PUZZLE_ASSIGNED", assignment });
    return { assignment };
  }

  /** Coach-owner / admin ends the active puzzle. */
  async end(accessToken: string | undefined, classId: string): Promise<LivePuzzleStateResponse> {
    const { liveSession } = await this.liveClass.resolveClassManager(accessToken, classId);
    const active = await this.prisma.liveClassPuzzleAssignment.findFirst({
      where: { liveClassId: classId, status: "ACTIVE" }
    });
    if (!active) return { assignment: null };

    await this.prisma.liveClassPuzzleAssignment.update({
      where: { id: active.id },
      data: { status: "ENDED", endedAt: new Date() }
    });
    await this.broadcast(liveSession.roomName, { type: "PUZZLE_ENDED", assignmentId: active.id });
    return { assignment: null };
  }

  /**
   * Coach-owner / admin edits the running puzzle's points or leaderboard rules.
   * Points are derived at read time, so every existing result re-scores.
   */
  async update(
    accessToken: string | undefined,
    classId: string,
    dto: UpdateLivePuzzleRequest
  ): Promise<LivePuzzleStateResponse> {
    const { liveSession } = await this.liveClass.resolveClassManager(accessToken, classId);
    const active = await this.loadActive(classId);
    if (!active) throw new NotFoundException("No puzzle is active in this class.");

    const scoring = resolvePuzzleScoring(this.scoringOf(active), dto.scoring);
    const leaderboard = resolvePuzzleLeaderboard(this.leaderboardOf(active), dto.leaderboard);
    const updated = await this.prisma.liveClassPuzzleAssignment.update({
      where: { id: active.id },
      data: {
        leaderboardJson: leaderboard as unknown as Prisma.InputJsonValue,
        revealLeaderboard: leaderboard.visibility === "LIVE",
        scoringJson: scoring as unknown as Prisma.InputJsonValue
      },
      include: puzzleInclude
    });

    const assignment = this.toAssignment(updated);
    await this.broadcast(liveSession.roomName, { type: "PUZZLE_UPDATED", assignment });
    return { assignment };
  }

  /**
   * Coach-owner / admin: manual +/- points for one student on the active (or
   * most recent) puzzle — a verbal answer, a sportsmanship bonus, a deduction.
   */
  async adjust(
    accessToken: string | undefined,
    classId: string,
    dto: AdjustLivePuzzlePointsRequest
  ): Promise<LivePuzzleLeaderboardResponse> {
    const { liveSession } = await this.liveClass.resolveClassManager(accessToken, classId);
    const assignment = await this.loadCurrentOrLatest(classId);
    if (!assignment) throw new NotFoundException("No puzzle has been shared in this class.");

    await this.prisma.$transaction(async (tx) => {
      // Re-read inside the transaction so two quick clicks both land.
      const row = await tx.liveClassPuzzleAssignment.findUniqueOrThrow({
        where: { id: assignment.id },
        select: { adjustmentsJson: true }
      });
      const adjustments = this.adjustmentsOf(row.adjustmentsJson);
      const next = dto.replace ? dto.delta : (adjustments[dto.studentId] ?? 0) + dto.delta;
      if (next === 0) delete adjustments[dto.studentId];
      else adjustments[dto.studentId] = next;
      await tx.liveClassPuzzleAssignment.update({
        where: { id: assignment.id },
        data: { adjustmentsJson: adjustments as unknown as Prisma.InputJsonValue }
      });
    });

    await this.broadcast(liveSession.roomName, { type: "LEADERBOARD_DIRTY" });
    return this.leaderboard(accessToken, classId);
  }

  /** Any participant reads the active assignment (solution stripped). */
  async getCurrent(
    accessToken: string | undefined,
    classId: string
  ): Promise<LivePuzzleStateResponse> {
    await this.liveClass.resolveParticipant(accessToken, classId);
    const active = await this.loadActive(classId);
    return { assignment: active ? this.toAssignment(active) : null };
  }

  /** Student starts (or resumes) an in-room attempt — stamps `liveClassId`. */
  async startAttempt(
    accessToken: string | undefined,
    classId: string
  ): Promise<{ attempt: StartPuzzleAttemptResponse }> {
    const { user } = await this.liveClass.resolveParticipant(accessToken, classId);
    if (user.role !== UserRole.STUDENT) {
      throw new ForbiddenException("Only students can solve the class puzzle.");
    }
    const active = await this.loadActive(classId);
    if (!active) {
      throw new NotFoundException("No puzzle is active in this class.");
    }
    this.assertOpen(active);

    const { maxAttempts } = this.scoringOf(active);
    if (maxAttempts !== null) {
      const rows = await this.prisma.puzzleAttempt.findMany({
        where: {
          liveClassId: classId,
          puzzleId: active.puzzleId,
          startedAt: { gte: active.startedAt },
          studentId: user.id
        },
        select: { status: true }
      });
      const inProgress = rows.some((r) => r.status === "IN_PROGRESS");
      const used = rows.filter((r) => r.status !== "IN_PROGRESS").length;
      // An open attempt is always resumable; only a fresh one is gated.
      if (!inProgress && used >= maxAttempts) {
        throw new BadRequestException(
          maxAttempts === 1
            ? "You've already had your try at this puzzle."
            : `You've used all ${maxAttempts} tries for this puzzle.`
        );
      }
    }
    return this.attempts.start(accessToken, active.puzzleId, {
      liveClassId: classId,
      startedAfter: active.startedAt
    });
  }

  /** Ranked leaderboard for the current (or most recent) assignment, plus the rest of the roster. */
  async leaderboard(
    accessToken: string | undefined,
    classId: string
  ): Promise<LivePuzzleLeaderboardResponse> {
    const { user } = await this.liveClass.resolveParticipant(accessToken, classId);
    const isStudent = user.role === UserRole.STUDENT;

    const assignment = await this.loadCurrentOrLatest(classId);
    if (!assignment) {
      return {
        active: false,
        assignmentId: null,
        entries: [],
        leaderboard: null,
        notStarted: [],
        revealLeaderboard: true,
        scoring: null,
        self: null,
        showingAll: true,
        solvingCount: 0,
        stillSolving: [],
        title: null
      };
    }

    const scoring = this.scoringOf(assignment);
    const options = this.leaderboardOf(assignment);
    const adjustments = this.adjustmentsOf(assignment.adjustmentsJson);
    const active = assignment.status === "ACTIVE";

    const [rows, roster] = await Promise.all([
      this.prisma.puzzleAttempt.findMany({
        // Scoped to this assignment's window, so re-sharing the same puzzle
        // later in the class starts a fresh board.
        where: {
          liveClassId: classId,
          puzzleId: assignment.puzzleId,
          startedAt: { gte: assignment.startedAt }
        },
        include: { student: { select: { id: true, firstName: true, lastName: true } } }
      }),
      this.loadRoster(classId)
    ]);

    const ranked = this.rankStudents(rows, scoring, options, adjustments, roster, user.id);

    // Roster = every enrolled student, plus anyone with an attempt who has
    // since left the batch (so their row never silently vanishes mid-class).
    const rosterMap = new Map<string, { id: string; firstName: string; lastName: string | null }>(
      roster.map((s) => [s.id, s])
    );
    for (const row of rows) {
      if (!rosterMap.has(row.studentId)) rosterMap.set(row.studentId, row.student);
    }

    const rankedIds = new Set(ranked.map((e) => e.studentId));
    const attemptedIds = new Set(rows.map((r) => r.studentId));
    const inProgressIds = new Set(
      rows.filter((r) => r.status === "IN_PROGRESS").map((r) => r.studentId)
    );

    const toRosterEntry = (s: { id: string; firstName: string; lastName: string | null }): LivePuzzleRosterEntry => ({
      studentId: s.id,
      studentName: fullName(s) ?? "Student"
    });

    const stillSolving = [...rosterMap.values()]
      .filter((s) => inProgressIds.has(s.id) && !rankedIds.has(s.id))
      .map(toRosterEntry);
    const notStarted = [...rosterMap.values()]
      .filter((s) => !attemptedIds.has(s.id) && !rankedIds.has(s.id))
      .map(toRosterEntry);

    const base = {
      active,
      assignmentId: assignment.id,
      leaderboard: options,
      revealLeaderboard: options.visibility === "LIVE",
      scoring,
      solvingCount: stillSolving.length,
      title: assignment.puzzle.title
    };

    if (!isStudent) {
      return { ...base, entries: ranked, notStarted, self: null, showingAll: true, stillSolving };
    }

    // ── What a student may see ──
    const canSeeAll =
      options.visibility === "LIVE" || (options.visibility === "AFTER_END" && !active);
    const mine = rows.filter((r) => r.studentId === user.id);
    const used = mine.filter((r) => r.status !== "IN_PROGRESS").length;
    const selfEntry = ranked.find((e) => e.isSelf) ?? null;
    const self: LivePuzzleSelfStatus = {
      attemptsLeft: scoring.maxAttempts === null ? null : Math.max(0, scoring.maxAttempts - used),
      attemptsUsed: used,
      inProgress: mine.some((r) => r.status === "IN_PROGRESS"),
      points: selfEntry?.points ?? null,
      rank: canSeeAll ? (selfEntry?.rank ?? null) : null,
      solved: mine.some((r) => r.status === "SOLVED")
    };

    let entries = canSeeAll
      ? ranked.filter((e) => e.isSelf || options.topN === null || e.rank <= options.topN)
      : ranked.filter((e) => e.isSelf);
    if (options.anonymize) {
      entries = entries.map((e) =>
        e.isSelf ? e : { ...e, studentId: `anon-${e.rank}`, studentName: `Student ${e.rank}` }
      );
    }
    const showOthers = canSeeAll && !options.anonymize;

    return {
      ...base,
      entries,
      notStarted: showOthers ? notStarted : notStarted.filter((s) => s.studentId === user.id),
      self,
      showingAll: canSeeAll && options.topN === null,
      stillSolving: showOthers ? stillSolving : stillSolving.filter((s) => s.studentId === user.id)
    };
  }

  /** Coach-owner / admin: every enrolled student's current board position for the active (or most recent) assignment. */
  async boards(accessToken: string | undefined, classId: string): Promise<LivePuzzleBoardsResponse> {
    await this.liveClass.resolveClassManager(accessToken, classId);

    const assignment = await this.loadCurrentOrLatest(classId);
    if (!assignment) {
      return { assignmentId: null, puzzleFen: "", orientation: "white", boards: [] };
    }

    const [rows, roster] = await Promise.all([
      this.prisma.puzzleAttempt.findMany({
        where: {
          liveClassId: classId,
          puzzleId: assignment.puzzleId,
          startedAt: { gte: assignment.startedAt }
        },
        include: { student: { select: { id: true, firstName: true, lastName: true } } }
      }),
      this.loadRoster(classId)
    ]);

    // A student's most recent attempt (by attemptNumber) is their "current" board.
    const latestByStudent = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const current = latestByStudent.get(row.studentId);
      if (!current || row.attemptNumber > current.attemptNumber) {
        latestByStudent.set(row.studentId, row);
      }
    }

    const rosterMap = new Map<string, { id: string; firstName: string; lastName: string | null }>(
      roster.map((s) => [s.id, s])
    );
    for (const row of rows) {
      if (!rosterMap.has(row.studentId)) rosterMap.set(row.studentId, row.student);
    }

    const boards: LivePuzzleBoardEntry[] = [...rosterMap.values()]
      .map((student) => {
        const row = latestByStudent.get(student.id);
        if (!row) {
          return {
            studentId: student.id,
            studentName: fullName(student) ?? "Student",
            status: "NOT_STARTED" as LivePuzzleBoardStatus,
            fen: null,
            moveCount: 0,
            lastMoveSan: null,
            updatedAt: null
          };
        }
        const moves = Array.isArray(row.movesJson) ? (row.movesJson as unknown as AttemptMove[]) : [];
        const last = moves[moves.length - 1];
        return {
          studentId: student.id,
          studentName: fullName(student) ?? "Student",
          status: row.status as LivePuzzleBoardStatus,
          fen: last?.fenAfter ?? assignment.puzzle.fen,
          moveCount: moves.length,
          lastMoveSan: last?.san ?? null,
          updatedAt: row.updatedAt.toISOString()
        };
      })
      .sort((a, b) => a.studentName.localeCompare(b.studentName));

    return {
      assignmentId: assignment.id,
      puzzleFen: assignment.puzzle.fen,
      orientation: this.sideToMove(assignment.puzzle.fen),
      boards
    };
  }

  // ── internals ──

  private async loadActive(classId: string): Promise<AssignmentRow | null> {
    return this.prisma.liveClassPuzzleAssignment.findFirst({
      where: { liveClassId: classId, status: "ACTIVE" },
      include: puzzleInclude
    });
  }

  private async loadCurrentOrLatest(classId: string): Promise<AssignmentRow | null> {
    return (
      (await this.loadActive(classId)) ??
      (await this.prisma.liveClassPuzzleAssignment.findFirst({
        where: { liveClassId: classId },
        orderBy: { startedAt: "desc" },
        include: puzzleInclude
      }))
    );
  }

  /** Enrolled students for the class's batch. Empty for a batch-less one-off class. */
  private async loadRoster(
    classId: string
  ): Promise<{ id: string; firstName: string; lastName: string | null }[]> {
    const liveSession = await this.prisma.liveSession.findUnique({
      where: { classId },
      include: {
        batch: {
          include: {
            students: {
              where: { isDeleted: false },
              include: { student: { select: { id: true, firstName: true, lastName: true } } }
            }
          }
        }
      }
    });
    return (liveSession?.batch?.students ?? []).map((bs) => bs.student);
  }

  private assertOpen(row: AssignmentRow): void {
    if (row.status === "ENDED") {
      throw new BadRequestException("This puzzle is no longer open.");
    }
    if (
      row.durationSeconds &&
      Date.now() > row.startedAt.getTime() + row.durationSeconds * 1000
    ) {
      throw new BadRequestException("Time is up for this puzzle.");
    }
  }

  /** Frozen scoring; rows shared before points existed get the defaults. */
  private scoringOf(row: { scoringJson: Prisma.JsonValue }): PuzzleScoring {
    return resolvePuzzleScoring(parseScoringOverride(row.scoringJson));
  }

  /** Frozen leaderboard rules; legacy rows keep their old score-then-time board. */
  private leaderboardOf(row: {
    leaderboardJson: Prisma.JsonValue;
    revealLeaderboard: boolean;
  }): PuzzleLeaderboardOptions {
    const stored = parseLeaderboardOverride(row.leaderboardJson);
    if (stored) return resolvePuzzleLeaderboard(stored);
    return resolvePuzzleLeaderboard({
      rankBy: "SCORE_THEN_TIME",
      visibility: row.revealLeaderboard ? "LIVE" : "HIDDEN"
    });
  }

  private adjustmentsOf(value: Prisma.JsonValue): Record<string, number> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: Record<string, number> = {};
    for (const [key, raw] of Object.entries(value)) {
      if (typeof raw === "number" && Number.isFinite(raw)) out[key] = Math.trunc(raw);
    }
    return out;
  }

  /**
   * One row per student: their best finished attempt, scored with
   * `computePuzzlePoints` (first-solve bonuses by who solved first), plus any
   * manual adjustment. A student with only an adjustment still gets a row.
   */
  private rankStudents(
    rows: Array<{
      studentId: string;
      student: { id: string; firstName: string; lastName: string | null };
      status: string;
      scorePercent: number | null;
      accuracyPercent: number | null;
      durationSeconds: number;
      hintsUsed: number;
      wrongMoves: number;
      completedAt: Date | null;
    }>,
    scoring: PuzzleScoring,
    options: PuzzleLeaderboardOptions,
    adjustments: Record<string, number>,
    roster: Array<{ id: string; firstName: string; lastName: string | null }>,
    viewerId: string
  ): LivePuzzleLeaderboardEntry[] {
    const finished = rows.filter((r) => r.status === "SOLVED" || r.status === "FAILED");

    // Solve order = each student's first solve, earliest first.
    const firstSolve = new Map<string, number>();
    for (const row of finished) {
      if (row.status !== "SOLVED" || !row.completedAt) continue;
      const at = row.completedAt.getTime();
      const prev = firstSolve.get(row.studentId);
      if (prev === undefined || at < prev) firstSolve.set(row.studentId, at);
    }
    const solveOrder = new Map(
      [...firstSolve.entries()].sort((a, b) => a[1] - b[1]).map(([id], i) => [id, i + 1])
    );

    type Scored = LivePuzzleLeaderboardEntry & { completedAt: number };
    const best = new Map<string, Scored>();
    const attemptsUsed = new Map<string, number>();
    for (const row of finished) {
      attemptsUsed.set(row.studentId, (attemptsUsed.get(row.studentId) ?? 0) + 1);
      const solved = row.status === "SOLVED";
      const breakdown = computePuzzlePoints(scoring, {
        durationSeconds: row.durationSeconds,
        hintsUsed: row.hintsUsed,
        scorePercent: row.scorePercent ?? 0,
        solveOrder: solved ? (solveOrder.get(row.studentId) ?? null) : null,
        solved,
        wrongMoves: row.wrongMoves
      });
      const candidate: Scored = {
        accuracyPercent: row.accuracyPercent,
        attemptsUsed: 0,
        breakdown,
        completedAt: row.completedAt?.getTime() ?? 0,
        durationSeconds: row.durationSeconds,
        hintsUsed: row.hintsUsed,
        isSelf: row.studentId === viewerId,
        points: breakdown.total,
        rank: 0,
        scorePercent: row.scorePercent ?? 0,
        solved,
        studentId: row.studentId,
        studentName: fullName(row.student) ?? "Student",
        wrongMoves: row.wrongMoves
      };
      const current = best.get(row.studentId);
      if (!current || this.compareEntries(candidate, current, options) < 0) {
        best.set(row.studentId, candidate);
      }
    }

    // Apply the coach's adjustment on top of the best attempt.
    const names = new Map(roster.map((s) => [s.id, fullName(s) ?? "Student"]));
    for (const row of rows) {
      if (!names.has(row.studentId)) names.set(row.studentId, fullName(row.student) ?? "Student");
    }
    for (const [studentId, adjustment] of Object.entries(adjustments)) {
      const entry = best.get(studentId);
      if (entry) {
        entry.breakdown = { ...entry.breakdown, adjustment, total: entry.breakdown.total + adjustment };
        entry.points = entry.breakdown.total;
        continue;
      }
      const name = names.get(studentId);
      if (!name) continue; // not in this class any more
      best.set(studentId, {
        accuracyPercent: null,
        attemptsUsed: 0,
        breakdown: {
          adjustment,
          base: 0,
          firstSolveBonus: 0,
          hintPenalty: 0,
          speedBonus: 0,
          total: adjustment,
          wrongMovePenalty: 0
        },
        completedAt: Number.MAX_SAFE_INTEGER,
        durationSeconds: 0,
        hintsUsed: 0,
        isSelf: studentId === viewerId,
        points: adjustment,
        rank: 0,
        scorePercent: 0,
        solved: false,
        studentId,
        studentName: name,
        wrongMoves: 0
      });
    }

    return [...best.values()]
      .sort((a, b) => this.compareEntries(a, b, options))
      .map(({ completedAt: _completedAt, ...entry }, index) => ({
        ...entry,
        attemptsUsed: attemptsUsed.get(entry.studentId) ?? 0,
        rank: index + 1
      }));
  }

  /** Negative when `a` ranks above `b`. */
  private compareEntries(
    a: { points: number; scorePercent: number; durationSeconds: number; completedAt: number },
    b: { points: number; scorePercent: number; durationSeconds: number; completedAt: number },
    options: PuzzleLeaderboardOptions
  ): number {
    if (options.rankBy === "POINTS" && a.points !== b.points) return b.points - a.points;
    if (a.scorePercent !== b.scorePercent) return b.scorePercent - a.scorePercent;
    if (a.durationSeconds !== b.durationSeconds) return a.durationSeconds - b.durationSeconds;
    return a.completedAt - b.completedAt;
  }

  private toAssignment(row: AssignmentRow): LivePuzzleAssignment {
    const { puzzle } = row;
    const sideToMove = this.sideToMove(puzzle.fen);
    const solutionLength = Array.isArray(puzzle.solutionMovesJson)
      ? puzzle.solutionMovesJson.length
      : 0;
    const endsAt = row.durationSeconds
      ? new Date(row.startedAt.getTime() + row.durationSeconds * 1000).toISOString()
      : null;
    return {
      id: row.id,
      puzzleId: puzzle.id,
      title: puzzle.title,
      topicName: puzzle.topic.name,
      puzzleType: puzzle.puzzleType,
      difficulty: puzzle.difficulty,
      sideToMove,
      orientation: sideToMove,
      fen: puzzle.fen,
      solutionLength,
      revealLeaderboard: this.leaderboardOf(row).visibility === "LIVE",
      scoring: this.scoringOf(row),
      leaderboard: this.leaderboardOf(row),
      durationSeconds: row.durationSeconds,
      startedAt: row.startedAt.toISOString(),
      endsAt
    };
  }

  private sideToMove(fen: string): "white" | "black" {
    try {
      return new Chess(fen).turn() === "w" ? "white" : "black";
    } catch {
      return "white";
    }
  }

  private async broadcast(roomName: string, message: LivePuzzleMessage): Promise<void> {
    try {
      await this.livekit.broadcastData(
        roomName,
        encodeLivePuzzle(message),
        LIVE_CLASS_PUZZLE_TOPIC
      );
    } catch {
      // Lifecycle packet only — the leaderboard is polled, so a dropped
      // broadcast costs a refresh delay, never correctness.
    }
  }
}

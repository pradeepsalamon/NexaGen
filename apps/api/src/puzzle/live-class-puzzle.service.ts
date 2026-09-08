import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type {
  AssignLivePuzzleRequest,
  LivePuzzleAssignment,
  LivePuzzleLeaderboardEntry,
  LivePuzzleLeaderboardResponse,
  LivePuzzleMessage,
  LivePuzzleStateResponse,
  StartPuzzleAttemptResponse
} from "@nexa-chess/types";
import { encodeLivePuzzle, LIVE_CLASS_PUZZLE_TOPIC } from "@nexa-chess/types";
import { Prisma, PuzzleStatus, PuzzleVisibility, UserRole } from "@prisma/client";
import { Chess } from "chess.js";
import { LiveClassService } from "../live-class/live-class.service";
import { LiveKitService } from "../live-class/livekit.service";
import { PrismaService } from "../prisma/prisma.service";
import { PuzzleAttemptService } from "./puzzle-attempt.service";
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
    private readonly attempts: PuzzleAttemptService
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
          revealLeaderboard: dto.revealLeaderboard ?? true
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
    return this.attempts.start(accessToken, active.puzzleId, { liveClassId: classId });
  }

  /** Ranked leaderboard for the current (or most recent) assignment. */
  async leaderboard(
    accessToken: string | undefined,
    classId: string
  ): Promise<LivePuzzleLeaderboardResponse> {
    const { user } = await this.liveClass.resolveParticipant(accessToken, classId);

    const assignment =
      (await this.loadActive(classId)) ??
      (await this.prisma.liveClassPuzzleAssignment.findFirst({
        where: { liveClassId: classId },
        orderBy: { startedAt: "desc" },
        include: puzzleInclude
      }));
    if (!assignment) {
      return { entries: [], solvingCount: 0, revealLeaderboard: true };
    }

    const rows = await this.prisma.puzzleAttempt.findMany({
      where: { liveClassId: classId, puzzleId: assignment.puzzleId },
      include: { student: { select: { id: true, firstName: true, lastName: true } } }
    });

    const best = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (row.status !== "SOLVED" && row.status !== "FAILED") continue;
      const current = best.get(row.studentId);
      if (!current || this.ranksHigher(row, current)) best.set(row.studentId, row);
    }

    const ranked: LivePuzzleLeaderboardEntry[] = [...best.values()]
      .sort((a, b) => (this.ranksHigher(a, b) ? -1 : 1))
      .map((row, index) => ({
        studentId: row.studentId,
        studentName: fullName(row.student) ?? "Student",
        rank: index + 1,
        scorePercent: row.scorePercent ?? 0,
        accuracyPercent: row.accuracyPercent,
        durationSeconds: row.durationSeconds,
        hintsUsed: row.hintsUsed,
        solved: row.status === "SOLVED",
        isSelf: row.studentId === user.id
      }));

    const solving = new Set(
      rows.filter((r) => r.status === "IN_PROGRESS").map((r) => r.studentId)
    );
    const solvingCount = [...solving].filter((id) => !best.has(id)).length;

    const revealLeaderboard = assignment.revealLeaderboard;
    const isStudent = user.role === UserRole.STUDENT;
    const entries =
      !revealLeaderboard && isStudent
        ? ranked.filter((entry) => entry.isSelf)
        : ranked;

    return { entries, solvingCount, revealLeaderboard };
  }

  // ── internals ──

  private async loadActive(classId: string): Promise<AssignmentRow | null> {
    return this.prisma.liveClassPuzzleAssignment.findFirst({
      where: { liveClassId: classId, status: "ACTIVE" },
      include: puzzleInclude
    });
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

  /** score desc, then duration asc, then finished-first. */
  private ranksHigher(
    a: { scorePercent: number | null; durationSeconds: number; completedAt: Date | null },
    b: { scorePercent: number | null; durationSeconds: number; completedAt: Date | null }
  ): boolean {
    const sa = a.scorePercent ?? -1;
    const sb = b.scorePercent ?? -1;
    if (sa !== sb) return sa > sb;
    if (a.durationSeconds !== b.durationSeconds) return a.durationSeconds < b.durationSeconds;
    return (a.completedAt?.getTime() ?? 0) < (b.completedAt?.getTime() ?? 0);
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
      revealLeaderboard: row.revealLeaderboard,
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

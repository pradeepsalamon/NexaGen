import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  folderHomeworkBlocker,
  isSystemPuzzleFolder,
  MAX_ASSIGNMENT_PUZZLES,
  maxPuzzlePoints,
  parseLeaderboardOverride,
  parseScoringOverride,
  resolvePuzzleLeaderboard,
  resolvePuzzleScoring,
  type AssignmentPuzzleSetResults,
  type AssignmentSetPuzzle,
  type ChessColor,
  type FolderHomeworkResponse,
  type PuzzleLeaderboardOptions,
  type PuzzleScoringOverride,
  type PuzzleSetLeaderboardResponse,
  type PuzzleSetStudentResult,
  type StudentPuzzleSetProgress
} from "@nexa-chess/types";
import { Prisma, PuzzleSource, PuzzleStatus, PuzzleVisibility, UserRole } from "@prisma/client";
import { Chess } from "../common/chess/chess";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  computePuzzleSetResults,
  studentLeaderboardView,
  toStudentAssignmentRollup
} from "./puzzle-set-results.util";

/** Same as `AssignmentService`'s Tx: the extended delegates seen inside `$transaction(cb)`. */
type Tx = Pick<PrismaService, "assignmentPuzzle">;

type AuthedUser = { id: string; role: UserRole };

/** The assignment columns a set's rules come from. */
type SetRules = {
  id: string;
  maxAttempts: number | null;
  allowRetry: boolean;
  allowHints: boolean;
  leaderboardJson: Prisma.JsonValue;
};

const SCORING_SETTINGS_ID = "default";

const setPuzzleInclude = {
  puzzle: {
    select: {
      difficulty: true,
      fen: true,
      puzzleType: true,
      solutionMovesJson: true,
      tags: true,
      title: true,
      topic: { select: { name: true } }
    }
  }
} satisfies Prisma.AssignmentPuzzleInclude;

type SetPuzzleRow = Prisma.AssignmentPuzzleGetPayload<{ include: typeof setPuzzleInclude }>;

/** A folder's homework set: live published library puzzles filed directly in it. */
const folderPuzzleWhere = (topicId: Prisma.PuzzleWhereInput["topicId"]): Prisma.PuzzleWhereInput => ({
  status: PuzzleStatus.PUBLISHED,
  topicId,
  visibility: PuzzleVisibility.GLOBAL
});

const isAdmin = (role: UserRole) => role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;

const fullName = (user: { firstName: string; lastName: string | null }) =>
  `${user.firstName} ${user.lastName ?? ""}`.trim();

/**
 * PUZZLE_SET assignments: which puzzles, in what order, with what frozen
 * scoring — and every student's results, computed from their `PuzzleAttempt`
 * rows by `computePuzzleSetResults`. The attempts themselves are run by
 * `PuzzleAttemptService` (puzzle module), which calls back into
 * `startContext` / `refreshRollup` here; this service never touches a move.
 */
@Injectable()
export class AssignmentPuzzleSetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingDispatchService
  ) {}

  // ── Authoring ──

  /**
   * Validates the puzzles an author may put in a set and resolves each one's
   * scoring (system → admin default → the puzzle's own → the set's override).
   * Admin sets are shared library items, so they may hold GLOBAL puzzles only —
   * a coach's private puzzle must never reach another coach's students. A coach
   * may use GLOBAL puzzles and their own private ones. Drafts and archived
   * puzzles can't be added (ones already in a set stay solvable).
   */
  async resolvePuzzles(
    user: AuthedUser,
    puzzleIds: string[],
    override: PuzzleScoringOverride | null
  ): Promise<{ rows: Array<{ puzzleId: string; position: number; scoringJson: Prisma.InputJsonValue }>; firstFen: string }> {
    if (puzzleIds.length === 0) throw new BadRequestException("Add at least one puzzle.");
    if (new Set(puzzleIds).size !== puzzleIds.length) {
      throw new BadRequestException("A puzzle can only appear once in a set.");
    }

    const puzzles = await this.prisma.puzzle.findMany({
      where: { id: { in: puzzleIds } },
      select: {
        createdById: true,
        fen: true,
        id: true,
        scoringJson: true,
        solutionMovesJson: true,
        source: true,
        status: true,
        title: true,
        visibility: true
      }
    });
    const byId = new Map(puzzles.map((p) => [p.id, p]));
    const adminDefault = await this.adminScoringDefault();

    const rows = puzzleIds.map((puzzleId, position) => {
      const puzzle = byId.get(puzzleId);
      if (!puzzle) throw new NotFoundException("One of the selected puzzles was not found.");
      if (puzzle.status !== PuzzleStatus.PUBLISHED) {
        throw new BadRequestException(`"${puzzle.title}" is not published.`);
      }
      if (puzzle.source === PuzzleSource.GAME) {
        throw new NotFoundException("One of the selected puzzles was not found.");
      }
      const allowed = isAdmin(user.role)
        ? puzzle.visibility === PuzzleVisibility.GLOBAL
        : puzzle.visibility === PuzzleVisibility.GLOBAL || puzzle.createdById === user.id;
      if (!allowed) {
        throw new ForbiddenException(
          isAdmin(user.role)
            ? `"${puzzle.title}" is a coach's private puzzle and can't go into a shared assignment.`
            : `You can't assign "${puzzle.title}".`
        );
      }
      if (!Array.isArray(puzzle.solutionMovesJson) || puzzle.solutionMovesJson.length === 0) {
        throw new BadRequestException(`"${puzzle.title}" has no solution line.`);
      }
      const scoring = resolvePuzzleScoring(
        adminDefault,
        parseScoringOverride(puzzle.scoringJson),
        override
      );
      return {
        position,
        puzzleId,
        scoringJson: scoring as unknown as Prisma.InputJsonValue
      };
    });

    return { firstFen: byId.get(puzzleIds[0])!.fen, rows };
  }

  async replaceSet(
    tx: Tx,
    assignmentId: string,
    rows: Array<{ puzzleId: string; position: number; scoringJson: Prisma.InputJsonValue }>
  ): Promise<void> {
    await tx.assignmentPuzzle.deleteMany({ where: { assignmentId } });
    if (rows.length > 0) {
      await tx.assignmentPuzzle.createMany({
        data: rows.map((row) => ({ ...row, assignmentId }))
      });
    }
  }

  async clearSet(tx: Tx, assignmentId: string): Promise<void> {
    await tx.assignmentPuzzle.deleteMany({ where: { assignmentId } });
  }

  async puzzleIdsOf(assignmentId: string): Promise<string[]> {
    const rows = await this.prisma.assignmentPuzzle.findMany({
      where: { assignmentId },
      orderBy: { position: "asc" },
      select: { puzzleId: true }
    });
    return rows.map((r) => r.puzzleId);
  }

  /** The sets of several assignments, in order; a puzzle sitting in the Trash drops out. */
  async loadSets(assignmentIds: string[]): Promise<Map<string, AssignmentSetPuzzle[]>> {
    const out = new Map<string, AssignmentSetPuzzle[]>();
    if (assignmentIds.length === 0) return out;
    const rows = await this.prisma.assignmentPuzzle.findMany({
      where: { assignmentId: { in: assignmentIds }, puzzle: { isDeleted: false } },
      include: setPuzzleInclude,
      orderBy: [{ assignmentId: "asc" }, { position: "asc" }]
    });
    for (const row of rows) {
      const list = out.get(row.assignmentId) ?? [];
      // Positions renumbered 0..n-1 so a trashed puzzle leaves no gap.
      list.push(this.toSetPuzzle(row, list.length));
      out.set(row.assignmentId, list);
    }
    return out;
  }

  // ── Homework-approved folders ──

  /** Homework-set size per folder (all folders, or just `topicIds`). */
  async folderHomeworkCounts(topicIds?: string[]): Promise<Map<string, number>> {
    const rows = await this.prisma.puzzle.groupBy({
      by: ["topicId"],
      where: folderPuzzleWhere(topicIds ? { in: topicIds } : undefined),
      _count: { _all: true }
    });
    return new Map(rows.map((row) => [row.topicId, row._count._all]));
  }

  /**
   * What assigning a folder sets — its live PUBLISHED GLOBAL puzzles filed
   * directly in it, in title order (`puzzles.title` sorts naturally) — and,
   * via `folderHomeworkBlocker`, whether it may be assigned now. The Super
   * Admin's approval is academy-wide and lives on the folder row, so it is
   * the same answer for every coach.
   */
  async folderHomework(topicId: string): Promise<FolderHomeworkResponse> {
    return (await this.readFolder(topicId)).response;
  }

  /**
   * The puzzle ids of a folder that may be assigned right now — the backend
   * half of the approval gate. Not approved (or revoked) is a 403; an approved
   * folder that has subfolders, no puzzles or too many is a 400.
   */
  async assignableFolderPuzzleIds(topicId: string): Promise<string[]> {
    const { approved, response } = await this.readFolder(topicId);
    if (!response.blocker) return response.puzzles.map((p) => p.puzzleId);
    if (!approved) {
      throw new ForbiddenException(`"${response.topicName}" is not approved for homework.`);
    }
    throw new BadRequestException(`"${response.topicName}": ${response.blocker}`);
  }

  // ── Results ──

  /** Coach view of one deployment: every student, ranked, with per-puzzle detail. */
  async deploymentResults(
    assignmentBatchId: string,
    assignment: SetRules
  ): Promise<AssignmentPuzzleSetResults> {
    const { puzzles, results, leaderboard } = await this.computeDeployment(assignmentBatchId, assignment);
    return {
      leaderboard,
      maxPoints: puzzles.reduce((sum, p) => sum + p.maxPoints, 0),
      puzzles,
      students: results
    };
  }

  /**
   * Student view of their own set, for each of the given StudentAssignment
   * rows (all PUZZLE_SET). Ranks and first-solver bonuses depend on the whole
   * deployment, so each deployment is computed once.
   */
  async studentProgress(
    rows: Array<{ id: string; assignmentBatchId: string; assignmentBatch: { assignment: SetRules } }>
  ): Promise<Map<string, StudentPuzzleSetProgress>> {
    const out = new Map<string, StudentPuzzleSetProgress>();
    const byDeployment = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byDeployment.get(row.assignmentBatchId) ?? [];
      list.push(row);
      byDeployment.set(row.assignmentBatchId, list);
    }

    for (const [assignmentBatchId, list] of byDeployment) {
      const assignment = list[0].assignmentBatch.assignment;
      const { puzzles, results, leaderboard } = await this.computeDeployment(
        assignmentBatchId,
        assignment
      );
      for (const row of list) {
        const self = results.find((r) => r.studentAssignmentId === row.id);
        if (!self) continue;
        const next = self.items.find((i) => i.points === null);
        out.set(row.id, {
          allowHints: assignment.allowHints,
          leaderboard,
          maxPoints: puzzles.reduce((sum, p) => sum + p.maxPoints, 0),
          nextPosition: next ? next.position : null,
          puzzles,
          self,
          triesPerPuzzle: this.triesPerPuzzle(assignment)
        });
      }
    }
    return out;
  }

  async leaderboardFor(
    studentId: string,
    studentAssignmentId: string,
    now = new Date()
  ): Promise<PuzzleSetLeaderboardResponse> {
    const sa = await this.prisma.studentAssignment.findUnique({
      where: { id: studentAssignmentId },
      include: { assignmentBatch: { include: { assignment: true } } }
    });
    if (!sa || sa.studentId !== studentId) throw new NotFoundException("Assignment not found.");
    const { assignment } = sa.assignmentBatch;
    if (assignment.activityType !== "PUZZLE_SET") {
      throw new BadRequestException("Only puzzle-set assignments have a leaderboard.");
    }
    const { puzzles, results, leaderboard } = await this.computeDeployment(
      sa.assignmentBatchId,
      assignment
    );
    return studentLeaderboardView({
      dueDate: sa.assignmentBatch.dueDate,
      maxPoints: puzzles.reduce((sum, p) => sum + p.maxPoints, 0),
      now,
      options: leaderboard,
      puzzleCount: puzzles.length,
      results,
      viewerStudentId: studentId
    });
  }

  // ── Attempt hooks (called by PuzzleAttemptService) ──

  /**
   * Checks a student may start (or resume) `puzzleId` as part of their
   * assignment: their own row, a PUZZLE_SET, the puzzle is in it, and they
   * have tries left. Being assigned the set is what grants access to the
   * puzzle — its library visibility is not consulted again.
   */
  async startContext(
    studentAssignmentId: string,
    studentId: string,
    puzzleId: string
  ): Promise<{ allowHints: boolean; hasOpenAttempt: boolean }> {
    const sa = await this.prisma.studentAssignment.findUnique({
      where: { id: studentAssignmentId },
      include: { assignmentBatch: { include: { assignment: true } } }
    });
    if (!sa || sa.studentId !== studentId) throw new NotFoundException("Assignment not found.");
    const { assignment } = sa.assignmentBatch;
    if (assignment.activityType !== "PUZZLE_SET") {
      throw new BadRequestException("This assignment is not a puzzle set.");
    }
    const inSet = await this.prisma.assignmentPuzzle.findFirst({
      where: { assignmentId: assignment.id, puzzleId, puzzle: { isDeleted: false } },
      select: { id: true }
    });
    if (!inSet) throw new NotFoundException("Puzzle not found in this assignment.");

    const tries = await this.prisma.puzzleAttempt.findMany({
      where: { studentAssignmentId, puzzleId, status: { not: "ABANDONED" } },
      select: { status: true }
    });
    const hasOpenAttempt = tries.some((t) => t.status === "IN_PROGRESS");
    const max = this.triesPerPuzzle(assignment);
    if (!hasOpenAttempt && max !== null && tries.length >= max) {
      throw new BadRequestException("You have used all your tries at this puzzle.");
    }
    return { allowHints: assignment.allowHints, hasOpenAttempt };
  }

  /** Hints follow the assignment's own switch; puzzle-library attempts always allow them. */
  async assertHintsAllowed(studentAssignmentId: string): Promise<void> {
    const sa = await this.prisma.studentAssignment.findUnique({
      where: { id: studentAssignmentId },
      select: { assignmentBatch: { select: { assignment: { select: { allowHints: true } } } } }
    });
    if (sa && !sa.assignmentBatch.assignment.allowHints) {
      throw new ForbiddenException("Hints are turned off for this assignment.");
    }
  }

  /** Tries left at one puzzle after its latest attempt — decides whether the solution is shown. */
  async triesLeft(studentAssignmentId: string, puzzleId: string): Promise<number | null> {
    const sa = await this.prisma.studentAssignment.findUnique({
      where: { id: studentAssignmentId },
      select: {
        assignmentBatch: { select: { assignment: { select: { allowRetry: true, maxAttempts: true } } } }
      }
    });
    if (!sa) return 0;
    const max = this.triesPerPuzzle(sa.assignmentBatch.assignment);
    if (max === null) return null;
    const used = await this.prisma.puzzleAttempt.count({
      where: { studentAssignmentId, puzzleId, status: { not: "ABANDONED" } }
    });
    return Math.max(0, max - used);
  }

  /**
   * Recomputes one student's StudentAssignment roll-up (status, tries, points %,
   * time, completedAt) from their attempts, so every existing list, dashboard,
   * performance summary and due-soon reminder keeps working unchanged. Always a
   * recompute, never an increment — a replayed submit can't double-count.
   * With `notify`, finishing the set for the first time sends the coach the
   * ASSIGNMENT_GRADED message (once per set, like a single assignment's grade).
   */
  async refreshRollup(
    studentAssignmentId: string,
    { notify = false }: { notify?: boolean } = {}
  ): Promise<PuzzleSetStudentResult | null> {
    const sa = await this.prisma.studentAssignment.findUnique({
      where: { id: studentAssignmentId },
      include: { assignmentBatch: { include: { assignment: true } }, student: true }
    });
    if (!sa || sa.assignmentBatch.assignment.activityType !== "PUZZLE_SET") return null;

    const { results } = await this.computeDeployment(
      sa.assignmentBatchId,
      sa.assignmentBatch.assignment
    );
    const self = results.find((r) => r.studentAssignmentId === studentAssignmentId);
    if (!self) return null;

    const rollup = toStudentAssignmentRollup(self);
    const wasComplete = sa.status === "COMPLETED";
    await this.prisma.studentAssignment.update({
      where: { id: studentAssignmentId },
      data: {
        ...rollup,
        // Keep the first completion time while the set stays complete.
        completedAt: rollup.status === "COMPLETED" ? (sa.completedAt ?? rollup.completedAt) : null
      }
    });

    const coachId = sa.assignmentBatch.assignedById;
    if (notify && !wasComplete && rollup.status === "COMPLETED" && coachId) {
      this.messaging.dispatchInBackground({
        coachId,
        event: "ASSIGNMENT_GRADED",
        outcome: `${self.solvedCount}/${self.puzzleCount} solved`,
        scorePercent: rollup.bestScorePercent ?? 0,
        studentAssignmentId,
        studentName: fullName(sa.student)
      });
    }
    return self;
  }

  /** After the set itself changed (puzzles added/removed/re-scored): every student's roll-up. */
  async refreshAssignmentRollups(assignmentId: string): Promise<void> {
    const rows = await this.prisma.studentAssignment.findMany({
      where: { assignmentBatch: { assignmentId } },
      select: { id: true }
    });
    for (const row of rows) await this.refreshRollup(row.id);
  }

  // ── internals ──

  private async readFolder(topicId: string) {
    const topic = await this.prisma.puzzleTopic.findUnique({
      where: { id: topicId },
      select: { homeworkApprovedAt: true, id: true, name: true, slug: true }
    });
    if (!topic) throw new NotFoundException("Folder not found.");

    const [subfolderCount, puzzleCount, puzzles] = await Promise.all([
      this.prisma.puzzleTopic.count({ where: { parentId: topicId } }),
      this.prisma.puzzle.count({ where: folderPuzzleWhere(topicId) }),
      this.prisma.puzzle.findMany({
        where: folderPuzzleWhere(topicId),
        orderBy: [{ title: "asc" }, { createdAt: "asc" }],
        select: { difficulty: true, id: true, tags: true, title: true },
        take: MAX_ASSIGNMENT_PUZZLES
      })
    ]);

    const approved = topic.homeworkApprovedAt !== null;
    const response: FolderHomeworkResponse = {
      blocker: folderHomeworkBlocker({
        approved,
        isSystem: isSystemPuzzleFolder(topic),
        puzzleCount,
        subfolderCount
      }),
      puzzles: puzzles.map((p) => ({
        difficulty: p.difficulty,
        puzzleId: p.id,
        tags: p.tags,
        title: p.title,
        topicName: topic.name
      })),
      topicId: topic.id,
      topicName: topic.name
    };
    return { approved, response };
  }

  private triesPerPuzzle(assignment: { maxAttempts: number | null; allowRetry: boolean }) {
    return assignment.maxAttempts ?? (assignment.allowRetry ? null : 1);
  }

  /** The admin layer is read at view time: tightening it applies to sets already out. */
  private async leaderboardOptions(assignment: SetRules): Promise<PuzzleLeaderboardOptions> {
    const row = await this.prisma.puzzleScoringSettings.findUnique({
      where: { id: SCORING_SETTINGS_ID },
      select: { leaderboardJson: true }
    });
    return resolvePuzzleLeaderboard(
      parseLeaderboardOverride(row?.leaderboardJson),
      parseLeaderboardOverride(assignment.leaderboardJson)
    );
  }

  private async adminScoringDefault(): Promise<PuzzleScoringOverride | null> {
    const row = await this.prisma.puzzleScoringSettings.findUnique({
      where: { id: SCORING_SETTINGS_ID },
      select: { scoringJson: true }
    });
    return parseScoringOverride(row?.scoringJson);
  }

  private async computeDeployment(assignmentBatchId: string, assignment: SetRules) {
    const [sets, students, leaderboard] = await Promise.all([
      this.loadSets([assignment.id]),
      this.prisma.studentAssignment.findMany({
        where: { assignmentBatchId },
        select: { id: true, student: { select: { firstName: true, id: true, lastName: true } } }
      }),
      this.leaderboardOptions(assignment)
    ]);
    const puzzles = sets.get(assignment.id) ?? [];
    const attempts =
      students.length === 0 || puzzles.length === 0
        ? []
        : await this.prisma.puzzleAttempt.findMany({
            where: {
              puzzleId: { in: puzzles.map((p) => p.puzzleId) },
              studentAssignmentId: { in: students.map((s) => s.id) }
            },
            select: {
              accuracyPercent: true,
              completedAt: true,
              durationSeconds: true,
              hintsUsed: true,
              puzzleId: true,
              scorePercent: true,
              startedAt: true,
              status: true,
              studentAssignmentId: true,
              wrongMoves: true
            }
          });

    const results = computePuzzleSetResults({
      attempts: attempts.map((a) => ({ ...a, studentAssignmentId: a.studentAssignmentId as string })),
      options: leaderboard,
      puzzles: puzzles.map((p) => ({
        position: p.position,
        puzzleId: p.puzzleId,
        scoring: p.scoring,
        title: p.title
      })),
      students: students.map((s) => ({
        studentAssignmentId: s.id,
        studentId: s.student.id,
        studentName: fullName(s.student) || "Student"
      })),
      triesPerPuzzle: this.triesPerPuzzle(assignment)
    });

    return { leaderboard, puzzles, results };
  }

  private toSetPuzzle(row: SetPuzzleRow, position: number): AssignmentSetPuzzle {
    const scoring = resolvePuzzleScoring(parseScoringOverride(row.scoringJson));
    return {
      difficulty: row.puzzle.difficulty,
      maxPoints: maxPuzzlePoints(scoring),
      position,
      puzzleId: row.puzzleId,
      puzzleType: row.puzzle.puzzleType,
      scoring,
      sideToMove: this.sideToMove(row.puzzle.fen),
      solutionLength: Array.isArray(row.puzzle.solutionMovesJson)
        ? row.puzzle.solutionMovesJson.length
        : 0,
      tags: row.puzzle.tags ?? [],
      title: row.puzzle.title,
      topicName: row.puzzle.topic?.name ?? null
    };
  }

  private sideToMove(fen: string): ChessColor {
    try {
      return new Chess(fen).turn() === "w" ? "white" : "black";
    } catch {
      return "white";
    }
  }
}

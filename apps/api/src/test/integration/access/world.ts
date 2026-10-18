import {
  PayrollPeriodType,
  PuzzleDifficulty,
  PuzzleStatus,
  PuzzleType,
  PuzzleVisibility,
  UserRole,
  UserStatus
} from "@prisma/client";
import type { PrismaService } from "../../../prisma/prisma.service";
import { createUser } from "../db";

const HOUR = 60 * 60 * 1000;
const FEN = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";

async function activeUser(prisma: PrismaService, role: UserRole) {
  const user = await createUser(prisma, role);
  return prisma.user.update({ where: { id: user.id }, data: { status: UserStatus.ACTIVE } });
}

/** One coach, their batch, one student in it, and everything that student and coach own. */
async function createSide(prisma: PrismaService, label: string, topicId: string, periodId: string) {
  const coach = await activeUser(prisma, UserRole.COACH);
  const student = await activeUser(prisma, UserRole.STUDENT);
  await prisma.coachProfile.create({ data: { userId: coach.id } });
  await prisma.studentProfile.create({ data: { parentName: `Parent ${label}`, userId: student.id } });

  const batch = await prisma.batch.create({ data: { name: `Batch ${label}` } });
  await prisma.batchCoach.create({ data: { batchId: batch.id, coachId: coach.id } });
  await prisma.batchStudent.create({ data: { batchId: batch.id, studentId: student.id } });

  const startsAt = new Date(Date.now() - 3 * HOUR);
  const klass = await prisma.coachClass.create({
    data: {
      batchId: batch.id,
      coachId: coach.id,
      endsAt: new Date(startsAt.getTime() + HOUR),
      startsAt,
      status: "COMPLETED",
      title: `Class ${label}`
    }
  });
  await prisma.classAttendance.create({ data: { classId: klass.id, studentId: student.id } });

  // The coach's own PRIVATE puzzle: visible to the author, admins and the author's students only.
  const privatePuzzle = await prisma.puzzle.create({
    data: {
      createdById: coach.id,
      createdByRole: UserRole.COACH,
      difficulty: PuzzleDifficulty.EASY,
      fen: FEN,
      puzzleType: PuzzleType.CHECKMATE,
      solutionMovesJson: [{ san: "Ra8#", uci: "a1a8" }],
      status: PuzzleStatus.PUBLISHED,
      title: `Private ${label}`,
      topicId,
      visibility: PuzzleVisibility.PRIVATE
    }
  });
  const attempt = await prisma.puzzleAttempt.create({
    data: { attemptNumber: 1, puzzleId: privatePuzzle.id, studentId: student.id }
  });

  const order = await prisma.order.create({
    data: {
      amount: 100_000,
      idempotencyKey: `int-${label}`,
      orderNumber: `ORD-${label}`,
      subtotalAmount: 100_000,
      userId: student.id
    }
  });
  const invoice = await prisma.invoice.create({
    data: {
      billingName: `Parent ${label}`,
      lines: [],
      number: `INV-${label}`,
      orderId: order.id,
      seller: {},
      subtotal: 100_000,
      taxableAmount: 100_000,
      total: 100_000,
      userId: student.id
    }
  });

  const payrollRecord = await prisma.coachPayrollRecord.create({ data: { coachId: coach.id, periodId } });

  // A second class that is LIVE right now, for the in-room routes (chat, leaderboards).
  const liveClass = await prisma.coachClass.create({
    data: {
      batchId: batch.id,
      coachId: coach.id,
      endsAt: new Date(Date.now() + HOUR),
      startsAt: new Date(Date.now() - 10 * 60 * 1000),
      status: "LIVE",
      title: `Live ${label}`
    }
  });
  await prisma.liveSession.create({
    data: {
      batchId: batch.id,
      classId: liveClass.id,
      coachId: coach.id,
      roomName: `room-${label}`,
      scheduledAt: liveClass.startsAt,
      startedAt: liveClass.startsAt,
      status: "LIVE"
    }
  });

  // A Puzzle Storm round open in that live class.
  const rush = await prisma.liveClassPuzzleRush.create({
    data: {
      liveClassId: liveClass.id,
      mode: "STORM",
      puzzles: [{ fen: FEN, id: `lp-${label}`, moves: ["g1f1", "g8f8"], rating: 1000 }],
      startedById: coach.id,
      startsAt: new Date()
    }
  });

  // A chapter in the batch's study list (coach-only).
  const chapter = await prisma.liveClassChapter.create({
    data: {
      batchId: batch.id,
      position: 0,
      scopeKey: `batch:${batch.id}`,
      state: { arrows: [], fen: FEN, historyIndex: -1, orientation: "white", pgn: "", squares: {} },
      title: `Chapter ${label}`
    }
  });

  const assignment = await prisma.assignment.create({
    data: { createdById: coach.id, pgn: "1. e4 e5 *", title: `Homework ${label}` }
  });
  const deployment = await prisma.assignmentBatch.create({
    data: { assignedById: coach.id, assignmentId: assignment.id, batchId: batch.id, dueDate: new Date(Date.now() + 24 * HOUR) }
  });
  const studentAssignment = await prisma.studentAssignment.create({
    data: { assignmentBatchId: deployment.id, studentId: student.id }
  });

  // A puzzle-set assignment holding the coach's private puzzle.
  const puzzleSet = await prisma.assignment.create({
    data: { activityType: "PUZZLE_SET", createdById: coach.id, pgn: "*", title: `Puzzle set ${label}` }
  });
  await prisma.assignmentPuzzle.create({
    data: { assignmentId: puzzleSet.id, position: 0, puzzleId: privatePuzzle.id, scoringJson: {} }
  });
  const setDeployment = await prisma.assignmentBatch.create({
    data: { assignedById: coach.id, assignmentId: puzzleSet.id, batchId: batch.id, dueDate: new Date(Date.now() + 24 * HOUR) }
  });
  const setStudentAssignment = await prisma.studentAssignment.create({
    data: { assignmentBatchId: setDeployment.id, studentId: student.id }
  });

  // Game Library: a simul game the student played, and a class-board game of
  // the class they attended.
  const game = await prisma.chessGame.create({
    data: {
      batchId: batch.id,
      blackName: `Student ${label}`,
      blackPlayerId: student.id,
      classId: liveClass.id,
      pgn: '[Result "*"]\n\n1. e4 *\n',
      result: "*",
      source: "SIMUL",
      sourceKey: `simul:int-${label}`,
      startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      status: "COMPLETED",
      title: `Simul ${label}`,
      whiteName: `Coach ${label}`,
      whitePlayerId: coach.id
    }
  });
  const boardGame = await prisma.chessGame.create({
    data: {
      batchId: batch.id,
      blackName: "Black",
      classId: klass.id,
      pgn: '[Result "*"]\n\n1. d4 *\n',
      source: "LIVE_BOARD",
      sourceKey: `board:int-${label}:g`,
      startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      status: "COMPLETED",
      title: `Board ${label}`,
      whiteName: "White"
    }
  });

  // Chat: the batch thread and a coach <-> student direct thread.
  const batchChat = await prisma.conversation.create({ data: { batchId: batch.id, type: "BATCH" } });
  await prisma.chatMessage.create({ data: { body: `hello ${label}`, conversationId: batchChat.id, senderId: coach.id } });
  // A draft activity queue for the live class, holding the coach's private puzzle (coach-only).
  const activityQueue = await prisma.liveClassActivityQueue.create({
    data: {
      createdById: coach.id,
      items: { create: [{ kind: "PUZZLE", position: 0, puzzleId: privatePuzzle.id, title: privatePuzzle.title }] },
      liveClassId: liveClass.id,
      title: `Queue ${label}`
    }
  });

  const directChat = await prisma.conversation.create({
    data: {
      directKey: coach.id < student.id ? `${coach.id}:${student.id}` : `${student.id}:${coach.id}`,
      members: { create: [{ userId: coach.id }, { userId: student.id }] },
      type: "DIRECT"
    }
  });

  return {
    activityQueue,
    assignment,
    attempt,
    batch,
    batchChat,
    boardGame,
    chapter,
    directChat,
    game,
    class: klass,
    coach,
    deployment,
    invoice,
    liveClass,
    order,
    payrollRecord,
    privatePuzzle,
    rush,
    setDeployment,
    setStudentAssignment,
    student,
    studentAssignment
  };
}

export type Side = Awaited<ReturnType<typeof createSide>>;

/**
 * Two mirror-image sides (A and B) that share nothing, plus an ADMIN and a
 * SUPER_ADMIN. Every cross-user test asks "can A reach B's row?".
 */
export async function createWorld(prisma: PrismaService) {
  const superAdmin = await activeUser(prisma, UserRole.SUPER_ADMIN);
  const admin = await activeUser(prisma, UserRole.ADMIN);
  const topic = await prisma.puzzleTopic.create({ data: { name: "Mates", slug: "mates" } });
  const period = await prisma.payrollPeriod.create({
    data: {
      endDate: new Date("2026-09-30"),
      periodType: PayrollPeriodType.MONTHLY,
      startDate: new Date("2026-09-01")
    }
  });
  const a = await createSide(prisma, "A", topic.id, period.id);
  const b = await createSide(prisma, "B", topic.id, period.id);
  return { a, admin, b, superAdmin };
}

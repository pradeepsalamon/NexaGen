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

  return { attempt, batch, class: klass, coach, invoice, order, payrollRecord, privatePuzzle, student };
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

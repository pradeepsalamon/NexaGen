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

/** The last day of a `YYYY-MM` month (UTC). */
function monthEnd(month: string): Date {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index, 0));
}
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

  // A Playout running in that class, with this side's student mid-game. Both
  // sides' runs are on the same position, like their private puzzles.
  const playoutConfig = {
    engine: { movetimeMs: 100, skillLevel: 1 },
    goal: { type: "CHECKMATE" },
    hints: ["Look at the back rank."],
    maxAttempts: 2,
    restrictions: { lockedPieces: [], maxStudentMoves: null },
    scoring: { drawPoints: 0, goalPoints: 10, hintPenalty: 1, parBonus: 0, parMoves: null, retryPenalty: 0 },
    startFen: FEN,
    studentColor: "white",
    timeLimitSeconds: null
  };
  const playoutActivity = await prisma.libraryActivity.create({
    data: {
      configJson: playoutConfig,
      createdByRole: UserRole.ADMIN,
      difficulty: PuzzleDifficulty.EASY,
      kind: "PLAYOUT",
      status: PuzzleStatus.PUBLISHED,
      title: `Playout ${label}`,
      topicId
    }
  });
  const playoutRun = await prisma.liveClassActivityRun.create({
    data: {
      activityId: playoutActivity.id,
      configJson: playoutConfig,
      difficulty: PuzzleDifficulty.EASY,
      kind: "PLAYOUT",
      liveClassId: liveClass.id,
      title: `Playout ${label}`
    }
  });
  const playoutGame = await prisma.liveClassPlayoutGame.create({
    data: {
      attemptNumber: 1,
      engineMoveMs: 100,
      engineSkill: 1,
      fen: FEN,
      maxScore: 10,
      runId: playoutRun.id,
      startFen: FEN,
      studentColor: "white",
      studentId: student.id
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
  // CHESS_COM, so a test can still link a LICHESS account for this student.
  const externalAccount = await prisma.externalChessAccount.create({
    data: {
      provider: "CHESS_COM",
      userId: student.id,
      username: `side-${label}`,
      usernameKey: `side-${label}`.toLowerCase(),
      verifiedAt: new Date()
    }
  });
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

  // Knowledge base: an article only this side's batch may read, and a
  // suggestion by this side's coach waiting for review.
  const kbArticle = await prisma.knowledgeArticle.create({
    data: {
      audience: ["STUDENT", "COACH"],
      batchScoped: true,
      batches: { create: [{ batchId: batch.id }] },
      latestVersionNumber: 1,
      slug: `batch-notes-${label.toLowerCase()}`,
      status: "PUBLISHED"
    }
  });
  const kbVersion = await prisma.knowledgeArticleVersion.create({
    data: { articleId: kbArticle.id, body: `Notes for batch ${label}`, number: 1, publishedAt: new Date(), status: "PUBLISHED", title: `Batch notes ${label}` }
  });
  await prisma.knowledgeArticle.update({ data: { publishedVersionId: kbVersion.id }, where: { id: kbArticle.id } });
  const kbSuggestionArticle = await prisma.knowledgeArticle.create({
    data: { audience: [], createdById: coach.id, latestVersionNumber: 1, slug: `suggestion-${label.toLowerCase()}` }
  });
  const kbSuggestion = await prisma.knowledgeArticleVersion.create({
    data: { articleId: kbSuggestionArticle.id, authorId: coach.id, body: "Idea", number: 1, status: "SUBMITTED", title: `Suggestion ${label}` }
  });

  // Referral rows (docs/REFERRALS.md): the coach's payout request and the
  // student's pending voucher redemption are ids their owner acts on.
  const referralWithdrawal = await prisma.referralWithdrawal.create({
    data: { amountMinor: 50000, currency: "INR", payoutDetails: `upi-${label}@bank`, userId: coach.id }
  });
  const referralVoucher = await prisma.referralVoucher.create({
    data: { freeDays: 7, name: `Free week ${label}`, pointsCost: 100, requiresApproval: true, type: "FREE_DAYS" }
  });
  const referralRedemption = await prisma.referralRedemption.create({
    data: {
      currency: "INR",
      freeDays: 7,
      pointsCost: 100,
      type: "FREE_DAYS",
      userId: student.id,
      voucherId: referralVoucher.id,
      voucherName: referralVoucher.name
    }
  });
  await prisma.referralCreditEntry.create({
    data: { amountMinor: -100, currency: "INR", redemptionId: referralRedemption.id, type: "REDEMPTION", userId: student.id, wallet: "POINTS" }
  });

  // A published PRIVATE tournament the coach hosts, with the student entered
  // (docs/TOURNAMENTS.md): its players and management are this side's only.
  const tournament = await prisma.tournament.create({
    data: {
      clockInitialMs: 300_000,
      format: "SWISS",
      name: `Tournament ${label}`,
      publishedAt: new Date(),
      rounds: 3,
      slug: `tournament-${label.toLowerCase()}`,
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: "PUBLISHED",
      visibility: "PRIVATE"
    }
  });
  await prisma.tournamentHost.create({ data: { role: "HOST", tournamentId: tournament.id, userId: coach.id } });
  const tournamentPlayer = await prisma.tournamentPlayer.create({
    data: { status: "APPROVED", tournamentId: tournament.id, userId: student.id }
  });
  const tournamentOpponent = await activeUser(prisma, UserRole.STUDENT);
  const opponentPlayer = await prisma.tournamentPlayer.create({
    data: { status: "APPROVED", tournamentId: tournament.id, userId: tournamentOpponent.id }
  });
  const tournamentGame = await prisma.tournamentGame.create({
    data: {
      blackClockMs: 300_000,
      blackPlayerId: opponentPlayer.id,
      boardNumber: 1,
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      roundNumber: 1,
      startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      tournamentId: tournament.id,
      whiteClockMs: 300_000,
      whitePlayerId: tournamentPlayer.id
    }
  });

  const certificateTemplate = await prisma.certificateTemplate.create({
    data: { accentColor: "#1F4FA8", body: "{{player.name}} took part.", name: `Template ${label}`, title: "Certificate" }
  });
  const certificateRule = await prisma.tournamentCertificateRule.create({
    data: { kind: "PARTICIPATION", minGames: 0, templateId: certificateTemplate.id, tournamentId: tournament.id }
  });
  const certificate = await prisma.tournamentCertificate.create({
    data: {
      playerId: tournamentPlayer.id,
      ruleId: certificateRule.id,
      serialNumber: `2026-${label}`,
      snapshotJson: {
        academyName: "Academy",
        ageGroup: null,
        date: "2026-11-09",
        placement: "Participant",
        playerName: `Student ${label}`,
        points: "1",
        template: { accentColor: "#1F4FA8", body: "{{player.name}} took part.", borderStyle: "CLASSIC", orientation: "LANDSCAPE", title: "Certificate" },
        tournamentName: `Tournament ${label}`
      },
      templateId: certificateTemplate.id,
      tournamentId: tournament.id,
      userId: student.id,
      verificationCode: `${label.toLowerCase().padEnd(16, "0").slice(0, 16)}`
    }
  });

  return {
    externalAccount,
    certificate,
    tournament,
    tournamentGame,
    tournamentPlayer,
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
    kbArticle,
    kbSuggestion,
    liveClass,
    order,
    payrollRecord,
    privatePuzzle,
    playoutGame,
    referralRedemption,
    referralWithdrawal,
    playoutRun,
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
/**
 * `prefix` keeps a second world's unique values apart (codes, numbers, slugs);
 * `periodMonth` its payroll period, which is globally unique until §D5.
 */
export async function createWorld(
  prisma: PrismaService,
  { periodMonth = "2026-09", prefix = "" }: { periodMonth?: string; prefix?: string } = {}
) {
  const superAdmin = await activeUser(prisma, UserRole.SUPER_ADMIN);
  const admin = await activeUser(prisma, UserRole.ADMIN);
  const topic = await prisma.puzzleTopic.create({ data: { name: `${prefix}Mates`, slug: `${prefix.toLowerCase()}mates` } });
  const period = await prisma.payrollPeriod.create({
    data: {
      endDate: monthEnd(periodMonth),
      periodType: PayrollPeriodType.MONTHLY,
      startDate: new Date(`${periodMonth}-01`)
    }
  });
  const a = await createSide(prisma, `${prefix}A`, topic.id, period.id);
  const b = await createSide(prisma, `${prefix}B`, topic.id, period.id);
  return { a, admin, b, superAdmin };
}

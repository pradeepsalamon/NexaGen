import {
  BatchStatus,
  CoachTitle,
  PrismaClient,
  PuzzleDifficulty,
  PuzzleStatus,
  PuzzleType,
  PuzzleVisibility,
  ReferralSource,
  UserRole,
  UserStatus
} from "@prisma/client";
import type { LiveClassSettingsOverride } from "@nexa-chess/types";
import { Chess } from "chess.js";
import { hashSecret } from "../src/auth/auth.utils";
import { puzzleContentHash } from "../src/puzzle/puzzle-content-hash";

const prisma = new PrismaClient();
const seedPassword = "Test@12345";

// Layer 4 system presets (visible to every coach, managed by admins). The
// Layer 1 policy row is lazily created by LiveClassSettingsService, not seeded.
const SYSTEM_PRESETS: Array<{ name: string; description: string; settings: LiveClassSettingsOverride }> = [
  {
    name: "Standard Batch Class",
    description: "Students muted, camera off, chat on, coach records manually.",
    settings: {
      student: { mic: "JOIN_MUTED", camera: "JOIN_OFF", screenShare: "DISABLED", chat: "ENABLED", board: "VIEW_ONLY" },
      recording: "MANUAL"
    }
  },
  {
    name: "Interactive Lesson",
    description: "Students can unmute, cameras on, board interaction enabled.",
    settings: {
      student: { mic: "JOIN_MUTED", camera: "JOIN_ON", screenShare: "DISABLED", chat: "ENABLED", board: "INTERACTIVE" },
      recording: "MANUAL"
    }
  },
  {
    name: "Demo Class",
    description: "Camera on, chat on, recording starts automatically.",
    settings: {
      student: { mic: "JOIN_MUTED", camera: "JOIN_ON", screenShare: "DISABLED", chat: "ENABLED", board: "VIEW_ONLY" },
      recording: "AUTO_START"
    }
  }
];

async function seedSystemPresets() {
  for (const preset of SYSTEM_PRESETS) {
    const existing = await prisma.liveClassPreset.findFirst({
      where: { name: preset.name, isSystem: true }
    });
    if (existing) {
      await prisma.liveClassPreset.update({
        where: { id: existing.id },
        data: { description: preset.description, settings: preset.settings as object }
      });
    } else {
      await prisma.liveClassPreset.create({
        data: {
          name: preset.name,
          description: preset.description,
          scope: "ORG",
          isSystem: true,
          settings: preset.settings as object
        }
      });
    }
  }
  console.log(`- live-class presets: ${SYSTEM_PRESETS.length} system presets`);
}

/**
 * Sample plans, so a sandbox gateway can be exercised end-to-end without an
 * admin building a catalogue by hand first. Idempotent on `code`, and prices
 * are in MINOR units (99900 = ₹999.00) like everywhere else.
 */
const PLANS: Array<{
  code: string;
  name: string;
  description: string;
  amount: number;
  interval: "ONE_TIME" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  taxPercent: number;
  features: string[];
  sortOrder: number;
}> = [
  {
    code: "starter-monthly",
    name: "Starter",
    description: "Weekly group classes and the full puzzle library.",
    amount: 99900,
    interval: "MONTHLY",
    taxPercent: 18,
    features: ["Weekly group classes", "Puzzle library", "Class recordings"],
    sortOrder: 1
  },
  {
    code: "premium-monthly",
    name: "Premium Membership",
    description: "Everything in Starter, plus assignments and progress reviews.",
    amount: 249900,
    interval: "MONTHLY",
    taxPercent: 18,
    features: [
      "Everything in Starter",
      "Coach-graded assignments",
      "Monthly progress review"
    ],
    sortOrder: 2
  },
  {
    code: "annual-pass",
    name: "Annual Pass",
    description: "A full year of Premium, paid once.",
    amount: 2499900,
    interval: "YEARLY",
    taxPercent: 18,
    features: ["Everything in Premium", "Two months free", "Priority support"],
    sortOrder: 3
  }
];

async function seedPlans() {
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      create: { ...plan, currency: "INR", isActive: true },
      // Price and billing terms are left alone on re-seed: changing them under
      // an existing subscriber is a deliberate admin action, not a seed's job.
      update: {
        name: plan.name,
        description: plan.description,
        features: plan.features,
        sortOrder: plan.sortOrder
      }
    });
  }
  console.log(`- payments: ${PLANS.length} sample plans`);
}

/**
 * A sample discount, so the coupon flow can be exercised in sandbox without an
 * admin building one first. Idempotent on `code`; usage counters are never
 * reset, because that would rewrite history.
 */
async function seedDiscounts() {
  await prisma.discount.upsert({
    where: { code: "WELCOME10" },
    create: {
      code: "WELCOME10",
      name: "Welcome offer",
      description: "10% off a first purchase, capped at ₹200.",
      type: "PERCENTAGE",
      value: 10,
      maxDiscountAmount: 20000,
      maxPerUser: 1,
      isActive: true
    },
    update: {
      name: "Welcome offer",
      description: "10% off a first purchase, capped at ₹200."
    }
  });
  console.log("- payments: 1 sample discount (WELCOME10)");
}

async function upsertUser(email: string, createData: any, updateData: any) {
  const existing = await prisma.user.findFirst({ where: { email, isDeleted: false } });
  if (existing) {
    return prisma.user.update({ where: { id: existing.id }, data: updateData });
  }
  return prisma.user.create({ data: createData });
}

async function upsertCoachProfile(userId: string, createData: any, updateData: any) {
  const existing = await prisma.coachProfile.findFirst({ where: { userId, isDeleted: false } });
  if (existing) {
    return prisma.coachProfile.update({ where: { id: existing.id }, data: updateData });
  }
  return prisma.coachProfile.create({ data: createData });
}

async function upsertStudentProfile(userId: string, createData: any, updateData: any) {
  const existing = await prisma.studentProfile.findFirst({ where: { userId, isDeleted: false } });
  if (existing) {
    return prisma.studentProfile.update({ where: { id: existing.id }, data: updateData });
  }
  return prisma.studentProfile.create({ data: createData });
}

const PUZZLE_TOPICS: Array<{ name: string; description: string; icon: string; sortOrder: number }> = [
  { name: "Fork", description: "Identify and execute a tactical fork.", icon: "🍴", sortOrder: 1 },
  { name: "Pin", description: "Exploit a pinned piece.", icon: "📌", sortOrder: 2 },
  { name: "Skewer", description: "Win material with a skewer.", icon: "🍢", sortOrder: 3 },
  { name: "Back Rank", description: "Deliver or defend a back-rank mate.", icon: "🏰", sortOrder: 4 },
  { name: "Checkmate in 1", description: "Find the immediate checkmate.", icon: "♚", sortOrder: 5 },
  { name: "Checkmate in 2", description: "Find the forced mate in two moves.", icon: "♛", sortOrder: 6 },
  { name: "Tactical Patterns", description: "Spot the winning tactical shot.", icon: "⚡", sortOrder: 7 },
  { name: "Endgame", description: "Convert a winning endgame.", icon: "⏱️", sortOrder: 8 }
];

/** Replay a UCI line from `fen`, rebuilding SAN; throws if any move is illegal. */
function buildSolution(fen: string, ucis: string[]): Array<{ uci: string; san: string }> {
  const chess = new Chess(fen);
  return ucis.map((uci) => {
    const res = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.slice(4) || undefined
    });
    return { uci, san: res.san };
  });
}

async function seedPuzzleTopics(createdById: string) {
  const byName = new Map<string, string>();
  for (const topic of PUZZLE_TOPICS) {
    const existing = await prisma.puzzleTopic.findFirst({ where: { name: topic.name } });
    if (existing) {
      byName.set(topic.name, existing.id);
      continue;
    }
    const created = await prisma.puzzleTopic.create({
      data: {
        name: topic.name,
        slug: topic.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
        description: topic.description,
        icon: topic.icon,
        sortOrder: topic.sortOrder,
        createdById
      }
    });
    byName.set(topic.name, created.id);
  }
  console.log(`- puzzle topics: ${byName.size}`);
  return byName;
}

async function seedPuzzles(
  topics: Map<string, string>,
  adminId: string,
  coachId: string,
  coach2Id: string
) {
  if ((await prisma.puzzle.count()) >= 6) return;

  const now = new Date();
  const rows: Array<{
    title: string;
    topic: string;
    type: PuzzleType;
    difficulty: PuzzleDifficulty;
    fen: string;
    line: string[];
    visibility: PuzzleVisibility;
    createdById: string;
    createdByRole: UserRole;
    explanation: string;
    hints: string[];
    tags: string[];
  }> = [
    {
      title: "Rook to the back rank",
      topic: "Back Rank",
      type: PuzzleType.CHECKMATE,
      difficulty: PuzzleDifficulty.EASY,
      fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",
      line: ["a1a8"],
      visibility: PuzzleVisibility.GLOBAL,
      createdById: adminId,
      createdByRole: UserRole.SUPER_ADMIN,
      explanation: "The black king is trapped by its own pawns — Ra8 is mate.",
      hints: ["Look at the open a-file.", "The f7/g7/h7 pawns box the king in."],
      tags: ["back-rank", "rook"]
    },
    {
      title: "King and rook mate",
      topic: "Checkmate in 1",
      type: PuzzleType.CHECKMATE,
      difficulty: PuzzleDifficulty.BEGINNER,
      fen: "k7/8/1K6/8/8/8/8/7R w - - 0 1",
      line: ["h1h8"],
      visibility: PuzzleVisibility.GLOBAL,
      createdById: adminId,
      createdByRole: UserRole.SUPER_ADMIN,
      explanation: "The white king covers every escape square; Rh8 is mate.",
      hints: ["Your king already does most of the work."],
      tags: ["basic-mate"]
    },
    {
      title: "Knight fork wins the queen",
      topic: "Fork",
      type: PuzzleType.TACTICAL,
      difficulty: PuzzleDifficulty.INTERMEDIATE,
      fen: "4k3/8/8/1q1N4/8/8/8/4K3 w - - 0 1",
      line: ["d5c7", "e8d8", "c7b5"],
      visibility: PuzzleVisibility.GLOBAL,
      createdById: adminId,
      createdByRole: UserRole.SUPER_ADMIN,
      explanation: "Nc7+ forks the king and queen; after the king moves, Nxb5 wins.",
      hints: ["Which square attacks both the king and the queen?"],
      tags: ["fork", "knight"]
    },
    {
      title: "Centralise and fork",
      topic: "Tactical Patterns",
      type: PuzzleType.CALCULATION,
      difficulty: PuzzleDifficulty.ADVANCED,
      fen: "4k3/8/8/7q/8/8/8/Q3K3 w - - 0 1",
      line: ["a1e5", "e8f8", "e5h5"],
      visibility: PuzzleVisibility.GLOBAL,
      createdById: adminId,
      createdByRole: UserRole.SUPER_ADMIN,
      explanation: "Qe5+ checks the king and attacks the queen along the fifth rank.",
      hints: ["Find a check that also hits the queen."],
      tags: ["double-attack", "queen"]
    },
    {
      title: "Queen delivers mate",
      topic: "Endgame",
      type: PuzzleType.ENDGAME,
      difficulty: PuzzleDifficulty.BEGINNER,
      fen: "k7/8/K7/8/8/8/8/7Q w - - 0 1",
      line: ["h1h8"],
      visibility: PuzzleVisibility.GLOBAL,
      createdById: adminId,
      createdByRole: UserRole.SUPER_ADMIN,
      explanation: "With the king on a6 covering a7 and b7, Qh8 is mate.",
      hints: ["The eighth rank is the target."],
      tags: ["kq-vs-k"]
    },
    {
      title: "Escape the check, win the queen",
      topic: "Tactical Patterns",
      type: PuzzleType.BEST_MOVE,
      difficulty: PuzzleDifficulty.EASY,
      fen: "7k/6pp/8/8/8/8/6PP/R2q3K w - - 0 1",
      line: ["a1d1"],
      visibility: PuzzleVisibility.PRIVATE,
      createdById: coachId,
      createdByRole: UserRole.COACH,
      explanation: "Rxd1 gets out of check and wins the queen for free.",
      hints: ["You are in check — deal with it and profit."],
      tags: ["in-between"]
    },
    {
      title: "Back rank with the heavy piece",
      topic: "Back Rank",
      type: PuzzleType.CHECKMATE,
      difficulty: PuzzleDifficulty.EASY,
      fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",
      line: ["d1d8"],
      visibility: PuzzleVisibility.PRIVATE,
      createdById: coachId,
      createdByRole: UserRole.COACH,
      explanation: "Rd8 is mate — the pawns leave the king no luft.",
      hints: ["The eighth rank is undefended."],
      tags: ["back-rank"]
    }
  ];

  // A second coach's private puzzle — used to verify cross-coach visibility.
  rows.push({
    title: "Coach 2 — knight mate",
    topic: "Checkmate in 1",
    type: PuzzleType.CHECKMATE,
    difficulty: PuzzleDifficulty.INTERMEDIATE,
    fen: "6rk/6pp/7N/8/8/8/8/6K1 w - - 0 1",
    line: ["h6f7"],
    visibility: PuzzleVisibility.PRIVATE,
    createdById: coach2Id,
    createdByRole: UserRole.COACH,
    explanation: "Nf7 is smothered mate — the rook and pawns trap the king.",
    hints: ["The king has no squares."],
    tags: ["smothered"]
  });

  let created = 0;
  for (const row of rows) {
    const topicId = topics.get(row.topic);
    if (!topicId) continue;
    let solution: Array<{ uci: string; san: string }>;
    try {
      solution = buildSolution(row.fen, row.line);
    } catch (error) {
      console.warn(`  skipped puzzle "${row.title}": ${(error as Error).message}`);
      continue;
    }
    await prisma.puzzle.create({
      data: {
        topicId,
        title: row.title,
        puzzleType: row.type,
        difficulty: row.difficulty,
        fen: row.fen,
        solutionMovesJson: solution,
        contentHash: puzzleContentHash(row.fen, solution),
        explanation: row.explanation,
        hintsJson: row.hints,
        tags: row.tags,
        status: PuzzleStatus.PUBLISHED,
        visibility: row.visibility,
        createdById: row.createdById,
        createdByRole: row.createdByRole,
        publishedById: row.createdById,
        publishedAt: now
      }
    });
    created += 1;
  }
  console.log(`- puzzles: ${created}`);
}

async function main() {
  const isProduction = process.env.NODE_ENV === "production";
  const forceSeed = process.env.FORCE_SEED === "true";

  if (isProduction && !forceSeed) {
    console.warn("⚠️ Production environment detected. Only the Super Admin account will be seeded.");
  }

  const password = await hashSecret(seedPassword);
  const verifiedAt = new Date();

  await seedSystemPresets();

  const superAdmin = await upsertUser(
    "superadmin@nexa.test",
    {
      email: "superadmin@nexa.test",
      emailVerifiedAt: verifiedAt,
      firstName: "Super",
      isEmailVerified: true,
      lastName: "Admin",
      password,
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      username: "superadmin"
    },
    {
      emailVerifiedAt: verifiedAt,
      isEmailVerified: true,
      password,
      status: UserStatus.ACTIVE
    }
  );

  const coach = await upsertUser(
    "coach@nexa.test",
    {
      email: "coach@nexa.test",
      emailVerifiedAt: verifiedAt,
      firstName: "Test",
      isEmailVerified: true,
      lastName: "Coach",
      password,
      role: UserRole.COACH,
      status: UserStatus.ACTIVE,
      username: "testcoach"
    },
    {
      emailVerifiedAt: verifiedAt,
      isEmailVerified: true,
      password,
      status: UserStatus.ACTIVE
    }
  );

  await upsertCoachProfile(
    coach.id,
    {
      approvalStatus: UserStatus.ACTIVE,
      approvedAt: verifiedAt,
      approvedById: superAdmin.id,
      bio: "Seeded coach account for local testing.",
      fideRating: 2100,
      hourlyRate: "50.00",
      specialization: "Opening preparation",
      title: CoachTitle.FM,
      userId: coach.id,
      yearsOfExperience: 5
    },
    {
      approvalStatus: UserStatus.ACTIVE,
      approvedAt: verifiedAt,
      approvedById: superAdmin.id
    }
  );

  const coach2 = await upsertUser(
    "coach2@nexa.test",
    {
      email: "coach2@nexa.test",
      emailVerifiedAt: verifiedAt,
      firstName: "Second",
      isEmailVerified: true,
      lastName: "Coach",
      password,
      role: UserRole.COACH,
      status: UserStatus.ACTIVE,
      username: "testcoach2"
    },
    {
      emailVerifiedAt: verifiedAt,
      isEmailVerified: true,
      password,
      status: UserStatus.ACTIVE
    }
  );

  await upsertCoachProfile(
    coach2.id,
    {
      approvalStatus: UserStatus.ACTIVE,
      approvedAt: verifiedAt,
      approvedById: superAdmin.id,
      bio: "Second seeded coach — used to verify cross-coach puzzle visibility.",
      fideRating: 1900,
      hourlyRate: "40.00",
      specialization: "Endgames",
      title: CoachTitle.CM,
      userId: coach2.id,
      yearsOfExperience: 3
    },
    {
      approvalStatus: UserStatus.ACTIVE,
      approvedAt: verifiedAt,
      approvedById: superAdmin.id
    }
  );

  const student = await upsertUser(
    "student@nexa.test",
    {
      createdById: coach.id,
      email: "student@nexa.test",
      emailVerifiedAt: verifiedAt,
      firstName: "Test",
      isEmailVerified: true,
      lastName: "Student",
      password,
      role: UserRole.STUDENT,
      status: UserStatus.ACTIVE,
      username: "teststudent"
    },
    {
      createdById: coach.id,
      emailVerifiedAt: verifiedAt,
      isEmailVerified: true,
      password,
      status: UserStatus.ACTIVE
    }
  );

  await upsertStudentProfile(
    student.id,
    {
      chessRating: 950,
      referralSource: ReferralSource.FRIEND,
      parentEmail: "parent@nexa.test",
      parentName: "Test Parent",
      parentPhone: "+919999999999",
      parentRelationship: "Parent",
      userId: student.id
    },
    {
      chessRating: 950,
      referralSource: ReferralSource.FRIEND,
      parentEmail: "parent@nexa.test",
      parentName: "Test Parent",
      parentPhone: "+919999999999",
      parentRelationship: "Parent"
    }
  );

  if (!isProduction || forceSeed) {
    const batch =
      (await prisma.batch.findFirst({
        where: { name: "Seeded Beginner Batch" }
      })) ??
      (await prisma.batch.create({
        data: {
          createdById: superAdmin.id,
          description: "Seeded batch for local coach and student assignment tests.",
          name: "Seeded Beginner Batch",
          scheduleNotes: "Saturdays, 10:00 AM IST",
          status: BatchStatus.ACTIVE
        }
      }));

    // This client has no soft-delete filter, so a trashed batch or link is
    // reused above; restore it so the e2e suite (`seededBatchId`) can see it.
    const restored = { deletedAt: null, deletedById: null, isDeleted: false };
    if (batch.isDeleted) {
      await prisma.batch.update({ where: { id: batch.id }, data: restored });
    }

    await prisma.batchCoach.upsert({
      where: {
        batchId_coachId: {
          batchId: batch.id,
          coachId: coach.id
        }
      },
      create: {
        batchId: batch.id,
        coachId: coach.id
      },
      update: restored
    });

    await prisma.batchStudent.upsert({
      where: {
        batchId_studentId: {
          batchId: batch.id,
          studentId: student.id
        }
      },
      create: {
        batchId: batch.id,
        studentId: student.id
      },
      update: restored
    });

    console.log(`- batch: ${batch.name}`);

    const batchCount = await prisma.batch.count();
    if (batchCount < 5) {
      console.log("Seeding additional mock batches for UI testing...");
      const batchNames = [
        "Intermediate Tactics",
        "Endgame Mastery",
        "Opening Principles",
        "Advanced Strategy",
        "Blitz Training",
        "Tournament Prep A",
        "Tournament Prep B",
        "Kids Beginner Sat",
        "Kids Beginner Sun",
        "Adults Evening Class",
        "Positional Play 101",
        "Mastering the Sicilian",
        "Attacking Chess",
        "Defensive Techniques",
        "Calculation Bootcamp",
        "Pawn Structures",
        "Rook Endgames",
        "Rapid Improvement",
        "Chess Fundamentals",
        "Advanced Calculation"
      ];

      const statuses = [
        BatchStatus.ACTIVE,
        BatchStatus.UPCOMING,
        BatchStatus.ARCHIVED,
        BatchStatus.ACTIVE
      ];

      for (let i = 0; i < batchNames.length; i++) {
        const startsAt = new Date();
        startsAt.setDate(startsAt.getDate() + i * 2 - 10);

        const mockBatch = await prisma.batch.create({
          data: {
            createdById: superAdmin.id,
            description: `Mock batch ${i + 1} for testing`,
            name: batchNames[i],
            scheduleNotes: i % 2 === 0 ? "Weekends" : "Weekdays",
            startsAt,
            status: statuses[i % statuses.length]
          }
        });

        if (i % 3 !== 0) {
          await prisma.batchCoach.create({
            data: { batchId: mockBatch.id, coachId: coach.id }
          });
        }

        if (i % 2 !== 0) {
          await prisma.batchStudent.create({
            data: { batchId: mockBatch.id, studentId: student.id }
          });
        }
      }
      console.log(`Seeded ${batchNames.length} mock batches.`);
    }

    const puzzleTopics = await seedPuzzleTopics(superAdmin.id);
    await seedPuzzles(puzzleTopics, superAdmin.id, coach.id, coach2.id);
    await seedPlans();
    await seedDiscounts();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

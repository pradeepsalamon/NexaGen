import {
  BatchStatus,
  CoachTitle,
  PrismaClient,
  ReferralSource,
  UserRole,
  UserStatus
} from "@prisma/client";
import type { LiveClassSettingsOverride } from "@nexa-chess/types";
import { hashSecret } from "../src/auth/auth.utils";

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

    const existingBatchCoach = await prisma.batchCoach.findUnique({
      where: {
        batchId_coachId: {
          batchId: batch.id,
          coachId: coach.id
        }
      }
    });

    if (!existingBatchCoach) {
      await prisma.batchCoach.create({
        data: {
          batchId: batch.id,
          coachId: coach.id
        }
      });
    }

    const existingBatchStudent = await prisma.batchStudent.findUnique({
      where: {
        batchId_studentId: {
          batchId: batch.id,
          studentId: student.id
        }
      }
    });

    if (!existingBatchStudent) {
      await prisma.batchStudent.create({
        data: {
          batchId: batch.id,
          studentId: student.id
        }
      });
    }

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

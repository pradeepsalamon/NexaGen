import {
  BatchStatus,
  CoachTitle,
  ExperienceLevel,
  PrismaClient,
  UserRole,
  UserStatus
} from "@prisma/client";
import { hashSecret } from "../src/auth/auth.utils";

const prisma = new PrismaClient();
const seedPassword = "Test@12345";

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
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed production database.");
  }

  const password = await hashSecret(seedPassword);
  const verifiedAt = new Date();

  const superAdmin = await upsertUser(
    "superadmin@nexagen.test",
    {
      email: "superadmin@nexagen.test",
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
    "coach@nexagen.test",
    {
      email: "coach@nexagen.test",
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
    "student@nexagen.test",
    {
      createdById: coach.id,
      email: "student@nexagen.test",
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
      experienceLevel: ExperienceLevel.BEGINNER,
      parentEmail: "parent@nexagen.test",
      parentName: "Test Parent",
      parentPhone: "+919999999999",
      parentRelationship: "Parent",
      userId: student.id
    },
    {
      chessRating: 950,
      experienceLevel: ExperienceLevel.BEGINNER,
      parentEmail: "parent@nexagen.test",
      parentName: "Test Parent",
      parentPhone: "+919999999999",
      parentRelationship: "Parent"
    }
  );

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

  await prisma.batchCoach.upsert({
    create: {
      batchId: batch.id,
      coachId: coach.id
    },
    update: {},
    where: {
      batchId_coachId: {
        batchId: batch.id,
        coachId: coach.id
      }
    }
  });

  await prisma.batchStudent.upsert({
    create: {
      batchId: batch.id,
      studentId: student.id
    },
    update: {},
    where: {
      batchId_studentId: {
        batchId: batch.id,
        studentId: student.id
      }
    }
  });

  console.log("Seeded test users:");
  console.log(`- superadmin@nexagen.test / ${seedPassword}`);
  console.log(`- coach@nexagen.test / ${seedPassword}`);
  console.log(`- student@nexagen.test / ${seedPassword}`);
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

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

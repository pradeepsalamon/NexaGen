import {
  CoachTitle,
  ExperienceLevel,
  PrismaClient,
  UserRole,
  UserStatus
} from "@prisma/client";
import { hashSecret } from "../src/auth/auth.utils";

const prisma = new PrismaClient();
const seedPassword = "Test@12345";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed production database.");
  }

  const password = await hashSecret(seedPassword);
  const verifiedAt = new Date();

  const superAdmin = await prisma.user.upsert({
    create: {
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
    update: {
      emailVerifiedAt: verifiedAt,
      isEmailVerified: true,
      password,
      status: UserStatus.ACTIVE
    },
    where: { email: "superadmin@nexagen.test" }
  });

  const coach = await prisma.user.upsert({
    create: {
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
    update: {
      emailVerifiedAt: verifiedAt,
      isEmailVerified: true,
      password,
      status: UserStatus.ACTIVE
    },
    where: { email: "coach@nexagen.test" }
  });

  await prisma.coachProfile.upsert({
    create: {
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
    update: {
      approvalStatus: UserStatus.ACTIVE,
      approvedAt: verifiedAt,
      approvedById: superAdmin.id
    },
    where: { userId: coach.id }
  });

  const student = await prisma.user.upsert({
    create: {
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
    update: {
      createdById: coach.id,
      emailVerifiedAt: verifiedAt,
      isEmailVerified: true,
      password,
      status: UserStatus.ACTIVE
    },
    where: { email: "student@nexagen.test" }
  });

  await prisma.studentProfile.upsert({
    create: {
      chessRating: 950,
      experienceLevel: ExperienceLevel.BEGINNER,
      parentEmail: "parent@nexagen.test",
      parentName: "Test Parent",
      parentPhone: "+919999999999",
      parentRelationship: "Parent",
      userId: student.id
    },
    update: {
      chessRating: 950,
      experienceLevel: ExperienceLevel.BEGINNER,
      parentEmail: "parent@nexagen.test",
      parentName: "Test Parent",
      parentPhone: "+919999999999",
      parentRelationship: "Parent"
    },
    where: { userId: student.id }
  });

  console.log("Seeded test users:");
  console.log(`- superadmin@nexagen.test / ${seedPassword}`);
  console.log(`- coach@nexagen.test / ${seedPassword}`);
  console.log(`- student@nexagen.test / ${seedPassword}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

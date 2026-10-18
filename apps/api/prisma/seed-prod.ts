import {
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

/**
 * Coach login is gated on `approvalStatus === ACTIVE`, so a seeded coach needs
 * an already-approved profile or it cannot sign in.
 */
async function upsertApprovedCoachProfile(userId: string) {
  const existing = await prisma.coachProfile.findFirst({
    where: { userId, isDeleted: false }
  });
  const approval = {
    approvalStatus: UserStatus.ACTIVE,
    approvedAt: new Date()
  };
  if (existing) {
    return prisma.coachProfile.update({ where: { id: existing.id }, data: approval });
  }
  return prisma.coachProfile.create({ data: { ...approval, userId } });
}

async function main() {
  console.log("Seeding base production users...");
  const password = await hashSecret(seedPassword);
  const verifiedAt = new Date();

  // 1. Super Admin
  await upsertUser(
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

  console.log("✅ Seeded superadmin@nexa.test");

  // 2. Admin (Optional, but good for testing)
  await upsertUser(
    "admin@nexa.test",
    {
      email: "admin@nexa.test",
      emailVerifiedAt: verifiedAt,
      firstName: "Admin",
      isEmailVerified: true,
      lastName: "User",
      password,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      username: "adminuser"
    },
    {
      emailVerifiedAt: verifiedAt,
      isEmailVerified: true,
      password,
      status: UserStatus.ACTIVE
    }
  );
  
  console.log("✅ Seeded admin@nexa.test");

  // 3. Example Coach
  const coach = await upsertUser(
    "coach@nexa.test",
    {
      email: "coach@nexa.test",
      emailVerifiedAt: verifiedAt,
      firstName: "Example",
      isEmailVerified: true,
      lastName: "Coach",
      password,
      role: UserRole.COACH,
      status: UserStatus.ACTIVE,
      username: "examplecoach"
    },
    {
      emailVerifiedAt: verifiedAt,
      isEmailVerified: true,
      password,
      status: UserStatus.ACTIVE
    }
  );

  await upsertApprovedCoachProfile(coach.id);

  console.log("✅ Seeded coach@nexa.test");

  // 4. Example Student
  await upsertUser(
    "student@nexa.test",
    {
      email: "student@nexa.test",
      emailVerifiedAt: verifiedAt,
      firstName: "Example",
      isEmailVerified: true,
      lastName: "Student",
      password,
      role: UserRole.STUDENT,
      status: UserStatus.ACTIVE,
      username: "examplestudent"
    },
    {
      emailVerifiedAt: verifiedAt,
      isEmailVerified: true,
      password,
      status: UserStatus.ACTIVE
    }
  );

  console.log("✅ Seeded student@nexa.test");
  
  console.log("\nAll users use the password: " + seedPassword);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

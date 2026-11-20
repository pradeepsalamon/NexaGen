-- CreateEnum
CREATE TYPE "UserRoleChangeAction" AS ENUM ('GRANTED', 'REMOVED');

-- AlterTable
ALTER TABLE "auth_sessions" ADD COLUMN     "activeRole" "UserRole";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "extraRoles" "UserRole"[] DEFAULT ARRAY[]::"UserRole"[];

-- CreateTable
CREATE TABLE "user_role_changes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "action" "UserRoleChangeAction" NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_role_changes_userId_createdAt_idx" ON "user_role_changes"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "user_role_changes" ADD CONSTRAINT "user_role_changes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_changes" ADD CONSTRAINT "user_role_changes_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- v1 rule (docs/MULTI_ROLE_ACCOUNTS.md §3): the only extra role is COACH, and
-- only an ADMIN / SUPER_ADMIN account may hold it. Prisma does not model CHECK
-- constraints, so this never shows up as drift.
ALTER TABLE "users" ADD CONSTRAINT "users_extra_roles_v1_check" CHECK (
  "extraRoles" IS NULL
  OR cardinality("extraRoles") = 0
  OR ("extraRoles" = ARRAY['COACH']::"UserRole"[] AND "role" IN ('ADMIN', 'SUPER_ADMIN'))
);

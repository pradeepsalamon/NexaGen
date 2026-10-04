-- CreateEnum
CREATE TYPE "DemoClassAccessMode" AS ENUM ('PUBLIC', 'PASSCODE', 'INVITE_ONLY');

-- CreateEnum
CREATE TYPE "DemoRegistrationSource" AS ENUM ('SELF', 'LEAD', 'INVITE');

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "demoAccessMode" "DemoClassAccessMode" NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "demoPasscode" TEXT;

-- AlterTable
ALTER TABLE "demo_class_registrations" ADD COLUMN     "invitedById" TEXT,
ADD COLUMN     "leadId" TEXT,
ADD COLUMN     "source" "DemoRegistrationSource" NOT NULL DEFAULT 'SELF';

-- CreateIndex
CREATE INDEX "demo_class_registrations_leadId_idx" ON "demo_class_registrations"("leadId");

-- AddForeignKey
ALTER TABLE "demo_class_registrations" ADD CONSTRAINT "demo_class_registrations_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_class_registrations" ADD CONSTRAINT "demo_class_registrations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

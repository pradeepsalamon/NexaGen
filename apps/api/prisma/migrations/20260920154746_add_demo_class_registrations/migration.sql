-- CreateEnum
CREATE TYPE "DemoRegistrationContactMethod" AS ENUM ('PHONE', 'EMAIL');

-- CreateTable
CREATE TABLE "demo_class_registrations" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactMethod" "DemoRegistrationContactMethod" NOT NULL,
    "contactValue" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "email" TEXT,
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_class_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "demo_class_registrations_classId_idx" ON "demo_class_registrations"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "demo_class_registrations_classId_contactMethod_contactValue_key" ON "demo_class_registrations"("classId", "contactMethod", "contactValue");

-- AddForeignKey
ALTER TABLE "demo_class_registrations" ADD CONSTRAINT "demo_class_registrations_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

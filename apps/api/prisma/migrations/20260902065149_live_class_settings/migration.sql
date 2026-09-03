-- CreateEnum
CREATE TYPE "LiveClassPresetScope" AS ENUM ('PERSONAL', 'ORG');

-- AlterTable
ALTER TABLE "batches" ADD COLUMN     "liveClassSettings" JSONB;

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "liveClassSettings" JSONB;

-- AlterTable
ALTER TABLE "live_sessions" ADD COLUMN     "effectiveSettings" JSONB,
ADD COLUMN     "settingsSnapshotAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "live_class_policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default Live Class Policy',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_class_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_class_presets" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "LiveClassPresetScope" NOT NULL DEFAULT 'PERSONAL',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_class_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_class_presets_ownerId_idx" ON "live_class_presets"("ownerId");

-- CreateIndex
CREATE INDEX "live_class_presets_scope_idx" ON "live_class_presets"("scope");

-- AddForeignKey
ALTER TABLE "live_class_presets" ADD CONSTRAINT "live_class_presets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

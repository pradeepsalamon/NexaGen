-- Trash (soft delete) for assignments, announcements, leads, feedback forms, help articles and
-- categories, game library games, live-class presets and demo schedules. Additive only.
-- AlterTable
ALTER TABLE "demo_schedules" ADD COLUMN     "deleteGroupId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "deleteGroupId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "live_class_presets" ADD COLUMN     "deleteGroupId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "deleteGroupId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "deleteGroupId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "feedback_forms" ADD COLUMN     "deleteGroupId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "chess_games" ADD COLUMN     "deleteGroupId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "knowledge_categories" ADD COLUMN     "deleteGroupId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "knowledge_articles" ADD COLUMN     "deleteGroupId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "demo_schedules_isDeleted_idx" ON "demo_schedules"("isDeleted");

-- CreateIndex
CREATE INDEX "demo_schedules_deletedAt_idx" ON "demo_schedules"("deletedAt");

-- CreateIndex
CREATE INDEX "demo_schedules_deletedById_idx" ON "demo_schedules"("deletedById");

-- CreateIndex
CREATE INDEX "demo_schedules_deleteGroupId_idx" ON "demo_schedules"("deleteGroupId");

-- CreateIndex
CREATE INDEX "leads_isDeleted_idx" ON "leads"("isDeleted");

-- CreateIndex
CREATE INDEX "leads_deletedAt_idx" ON "leads"("deletedAt");

-- CreateIndex
CREATE INDEX "leads_deletedById_idx" ON "leads"("deletedById");

-- CreateIndex
CREATE INDEX "leads_deleteGroupId_idx" ON "leads"("deleteGroupId");

-- CreateIndex
CREATE INDEX "live_class_presets_isDeleted_idx" ON "live_class_presets"("isDeleted");

-- CreateIndex
CREATE INDEX "live_class_presets_deletedAt_idx" ON "live_class_presets"("deletedAt");

-- CreateIndex
CREATE INDEX "live_class_presets_deletedById_idx" ON "live_class_presets"("deletedById");

-- CreateIndex
CREATE INDEX "live_class_presets_deleteGroupId_idx" ON "live_class_presets"("deleteGroupId");

-- CreateIndex
CREATE INDEX "assignments_isDeleted_idx" ON "assignments"("isDeleted");

-- CreateIndex
CREATE INDEX "assignments_deletedAt_idx" ON "assignments"("deletedAt");

-- CreateIndex
CREATE INDEX "assignments_deletedById_idx" ON "assignments"("deletedById");

-- CreateIndex
CREATE INDEX "assignments_deleteGroupId_idx" ON "assignments"("deleteGroupId");

-- CreateIndex
CREATE INDEX "announcements_isDeleted_idx" ON "announcements"("isDeleted");

-- CreateIndex
CREATE INDEX "announcements_deletedAt_idx" ON "announcements"("deletedAt");

-- CreateIndex
CREATE INDEX "announcements_deletedById_idx" ON "announcements"("deletedById");

-- CreateIndex
CREATE INDEX "announcements_deleteGroupId_idx" ON "announcements"("deleteGroupId");

-- CreateIndex
CREATE INDEX "feedback_forms_isDeleted_idx" ON "feedback_forms"("isDeleted");

-- CreateIndex
CREATE INDEX "feedback_forms_deletedAt_idx" ON "feedback_forms"("deletedAt");

-- CreateIndex
CREATE INDEX "feedback_forms_deletedById_idx" ON "feedback_forms"("deletedById");

-- CreateIndex
CREATE INDEX "feedback_forms_deleteGroupId_idx" ON "feedback_forms"("deleteGroupId");

-- CreateIndex
CREATE INDEX "chess_games_isDeleted_idx" ON "chess_games"("isDeleted");

-- CreateIndex
CREATE INDEX "chess_games_deletedAt_idx" ON "chess_games"("deletedAt");

-- CreateIndex
CREATE INDEX "chess_games_deletedById_idx" ON "chess_games"("deletedById");

-- CreateIndex
CREATE INDEX "chess_games_deleteGroupId_idx" ON "chess_games"("deleteGroupId");

-- CreateIndex
CREATE INDEX "knowledge_categories_isDeleted_idx" ON "knowledge_categories"("isDeleted");

-- CreateIndex
CREATE INDEX "knowledge_categories_deletedAt_idx" ON "knowledge_categories"("deletedAt");

-- CreateIndex
CREATE INDEX "knowledge_categories_deletedById_idx" ON "knowledge_categories"("deletedById");

-- CreateIndex
CREATE INDEX "knowledge_categories_deleteGroupId_idx" ON "knowledge_categories"("deleteGroupId");

-- CreateIndex
CREATE INDEX "knowledge_articles_isDeleted_idx" ON "knowledge_articles"("isDeleted");

-- CreateIndex
CREATE INDEX "knowledge_articles_deletedAt_idx" ON "knowledge_articles"("deletedAt");

-- CreateIndex
CREATE INDEX "knowledge_articles_deletedById_idx" ON "knowledge_articles"("deletedById");

-- CreateIndex
CREATE INDEX "knowledge_articles_deleteGroupId_idx" ON "knowledge_articles"("deleteGroupId");

-- AddForeignKey
ALTER TABLE "demo_schedules" ADD CONSTRAINT "demo_schedules_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_presets" ADD CONSTRAINT "live_class_presets_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_forms" ADD CONSTRAINT "feedback_forms_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chess_games" ADD CONSTRAINT "chess_games_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_categories" ADD CONSTRAINT "knowledge_categories_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


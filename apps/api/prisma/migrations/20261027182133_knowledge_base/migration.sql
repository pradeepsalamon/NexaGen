-- CreateEnum
CREATE TYPE "KnowledgeAudience" AS ENUM ('STUDENT', 'COACH', 'ADMIN');

-- CreateEnum
CREATE TYPE "KnowledgeArticleKind" AS ENUM ('ARTICLE', 'FAQ', 'GAME', 'RESOURCE');

-- CreateEnum
CREATE TYPE "KnowledgeArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "KnowledgeVersionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PUBLISHED', 'SUPERSEDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "KnowledgeSourceType" AS ENUM ('OWN_WORK', 'PUBLIC_DOMAIN', 'CC0', 'CC_BY', 'PERMISSION');

-- CreateEnum
CREATE TYPE "KnowledgeResourceType" AS ENUM ('PAGE', 'COURSE', 'PUZZLE_FOLDER', 'LIBRARY_GAME');

-- CreateEnum
CREATE TYPE "KnowledgeEventType" AS ENUM ('CREATED', 'DRAFT_SAVED', 'SUBMITTED', 'PUBLISHED', 'REJECTED', 'UNPUBLISHED', 'ARCHIVED', 'RESTORED', 'ROLLED_BACK', 'SETTINGS_CHANGED');

-- CreateEnum
CREATE TYPE "KnowledgeQueryResolution" AS ENUM ('ANSWERED', 'DISMISSED');

-- CreateTable
CREATE TABLE "knowledge_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_articles" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "KnowledgeArticleKind" NOT NULL DEFAULT 'ARTICLE',
    "status" "KnowledgeArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "categoryId" TEXT,
    "audience" "KnowledgeAudience"[],
    "routeTags" TEXT[],
    "language" TEXT NOT NULL DEFAULT 'en',
    "translationGroupId" TEXT,
    "sourceType" "KnowledgeSourceType" NOT NULL DEFAULT 'OWN_WORK',
    "sourceNote" TEXT,
    "publishAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "reviewBy" TIMESTAMP(3),
    "publishedVersionId" TEXT,
    "latestVersionNumber" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_article_batches" (
    "articleId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,

    CONSTRAINT "knowledge_article_batches_pkey" PRIMARY KEY ("articleId","batchId")
);

-- CreateTable
CREATE TABLE "knowledge_article_versions" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "KnowledgeVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL,
    "pgn" TEXT,
    "resourceType" "KnowledgeResourceType",
    "resourceRef" TEXT,
    "changeNote" TEXT,
    "warnings" TEXT[],
    "authorId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_article_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_article_events" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "versionId" TEXT,
    "actorId" TEXT,
    "type" "KnowledgeEventType" NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_article_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_feedback" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "versionId" TEXT,
    "userId" TEXT NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_search_logs" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "role" "KnowledgeAudience" NOT NULL,
    "batchIds" TEXT[],
    "route" TEXT,
    "resultCount" INTEGER NOT NULL,
    "resolution" "KnowledgeQueryResolution",
    "resolvedArticleId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_search_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_categories_name_key" ON "knowledge_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_articles_slug_key" ON "knowledge_articles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_articles_publishedVersionId_key" ON "knowledge_articles"("publishedVersionId");

-- CreateIndex
CREATE INDEX "knowledge_articles_status_idx" ON "knowledge_articles"("status");

-- CreateIndex
CREATE INDEX "knowledge_articles_categoryId_idx" ON "knowledge_articles"("categoryId");

-- CreateIndex
CREATE INDEX "knowledge_articles_translationGroupId_idx" ON "knowledge_articles"("translationGroupId");

-- CreateIndex
CREATE INDEX "knowledge_articles_createdById_idx" ON "knowledge_articles"("createdById");

-- CreateIndex
CREATE INDEX "knowledge_article_batches_batchId_idx" ON "knowledge_article_batches"("batchId");

-- CreateIndex
CREATE INDEX "knowledge_article_versions_status_idx" ON "knowledge_article_versions"("status");

-- CreateIndex
CREATE INDEX "knowledge_article_versions_authorId_idx" ON "knowledge_article_versions"("authorId");

-- CreateIndex
CREATE INDEX "knowledge_article_versions_reviewedById_idx" ON "knowledge_article_versions"("reviewedById");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_article_versions_articleId_number_key" ON "knowledge_article_versions"("articleId", "number");

-- CreateIndex
CREATE INDEX "knowledge_article_events_articleId_createdAt_idx" ON "knowledge_article_events"("articleId", "createdAt");

-- CreateIndex
CREATE INDEX "knowledge_article_events_versionId_idx" ON "knowledge_article_events"("versionId");

-- CreateIndex
CREATE INDEX "knowledge_article_events_actorId_idx" ON "knowledge_article_events"("actorId");

-- CreateIndex
CREATE INDEX "knowledge_feedback_userId_idx" ON "knowledge_feedback"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_feedback_articleId_userId_key" ON "knowledge_feedback"("articleId", "userId");

-- CreateIndex
CREATE INDEX "knowledge_search_logs_createdAt_idx" ON "knowledge_search_logs"("createdAt");

-- CreateIndex
CREATE INDEX "knowledge_search_logs_query_idx" ON "knowledge_search_logs"("query");

-- AddForeignKey
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "knowledge_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "knowledge_article_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_article_batches" ADD CONSTRAINT "knowledge_article_batches_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_article_batches" ADD CONSTRAINT "knowledge_article_batches_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_article_versions" ADD CONSTRAINT "knowledge_article_versions_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_article_versions" ADD CONSTRAINT "knowledge_article_versions_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_article_versions" ADD CONSTRAINT "knowledge_article_versions_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_article_events" ADD CONSTRAINT "knowledge_article_events_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_article_events" ADD CONSTRAINT "knowledge_article_events_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "knowledge_article_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_article_events" ADD CONSTRAINT "knowledge_article_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_feedback" ADD CONSTRAINT "knowledge_feedback_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_feedback" ADD CONSTRAINT "knowledge_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

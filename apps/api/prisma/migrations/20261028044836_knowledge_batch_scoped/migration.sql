-- AlterTable
ALTER TABLE "knowledge_articles" ADD COLUMN "batchScoped" BOOLEAN NOT NULL DEFAULT false;

-- Articles already limited to batches stay limited once those batches are purged.
UPDATE "knowledge_articles" a SET "batchScoped" = true
WHERE EXISTS (SELECT 1 FROM "knowledge_article_batches" b WHERE b."articleId" = a."id");

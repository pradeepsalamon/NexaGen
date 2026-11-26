-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('GROQ', 'GEMINI', 'OPENROUTER');

-- AlterTable
ALTER TABLE "ai_review_consents" ADD COLUMN     "providers" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ai_provider_credentials" (
    "id" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "apiKeyEncrypted" TEXT NOT NULL,
    "keyHint" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_provider_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_feature_models" (
    "id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "primaryProvider" "AiProvider",
    "primaryModel" TEXT,
    "fallbackProvider" "AiProvider",
    "fallbackModel" TEXT,
    "fallbackOff" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_feature_models_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_provider_credentials_provider_key" ON "ai_provider_credentials"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "ai_feature_models_feature_key" ON "ai_feature_models"("feature");


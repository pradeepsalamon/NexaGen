-- CreateEnum
CREATE TYPE "FeedbackTrigger" AS ENUM ('AFTER_CLASS', 'RECURRING', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "FeedbackPlacement" AS ENUM ('CLASS_END', 'DASHBOARD_POPUP', 'DASHBOARD_CARD');

-- CreateEnum
CREATE TYPE "FeedbackResponseStatus" AS ENUM ('SUBMITTED', 'SKIPPED');

-- CreateTable
CREATE TABLE "feedback_forms" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "questions" JSONB NOT NULL,
    "trigger" "FeedbackTrigger" NOT NULL,
    "classInterval" INTEGER NOT NULL DEFAULT 1,
    "intervalDays" INTEGER,
    "expiresAfterDays" INTEGER NOT NULL DEFAULT 7,
    "placements" "FeedbackPlacement"[],
    "batchIds" TEXT[],
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "allowSkip" BOOLEAN NOT NULL DEFAULT true,
    "showToCoach" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_responses" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "classId" TEXT,
    "contextKey" TEXT NOT NULL,
    "status" "FeedbackResponseStatus" NOT NULL,
    "overallRating" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_answers" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionLabel" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "ratingValue" INTEGER,
    "textValue" TEXT,

    CONSTRAINT "feedback_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_forms_isActive_idx" ON "feedback_forms"("isActive");

-- CreateIndex
CREATE INDEX "feedback_responses_coachId_status_idx" ON "feedback_responses"("coachId", "status");

-- CreateIndex
CREATE INDEX "feedback_responses_studentId_idx" ON "feedback_responses"("studentId");

-- CreateIndex
CREATE INDEX "feedback_responses_createdAt_idx" ON "feedback_responses"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_responses_formId_studentId_coachId_contextKey_key" ON "feedback_responses"("formId", "studentId", "coachId", "contextKey");

-- CreateIndex
CREATE INDEX "feedback_answers_responseId_idx" ON "feedback_answers"("responseId");

-- CreateIndex
CREATE INDEX "feedback_answers_questionId_idx" ON "feedback_answers"("questionId");

-- AddForeignKey
ALTER TABLE "feedback_forms" ADD CONSTRAINT "feedback_forms_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_responses" ADD CONSTRAINT "feedback_responses_formId_fkey" FOREIGN KEY ("formId") REFERENCES "feedback_forms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_responses" ADD CONSTRAINT "feedback_responses_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_responses" ADD CONSTRAINT "feedback_responses_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_responses" ADD CONSTRAINT "feedback_responses_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_answers" ADD CONSTRAINT "feedback_answers_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "feedback_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;


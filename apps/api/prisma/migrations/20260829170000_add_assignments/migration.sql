-- Assignment library + per-batch deployments + per-student completion.

-- CreateEnum
CREATE TYPE "AssignmentDifficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "createdById" TEXT,
    "isLibrary" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "pgn" TEXT NOT NULL,
    "pgnUrl" TEXT,
    "difficulty" "AssignmentDifficulty" NOT NULL DEFAULT 'BEGINNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_batches" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "assignedById" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignment_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_assignments" (
    "id" TEXT NOT NULL,
    "assignmentBatchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assignments_createdById_idx" ON "assignments"("createdById");

-- CreateIndex
CREATE INDEX "assignments_isLibrary_idx" ON "assignments"("isLibrary");

-- CreateIndex
CREATE INDEX "assignment_batches_batchId_idx" ON "assignment_batches"("batchId");

-- CreateIndex
CREATE INDEX "assignment_batches_assignedById_idx" ON "assignment_batches"("assignedById");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_batches_assignmentId_batchId_key" ON "assignment_batches"("assignmentId", "batchId");

-- CreateIndex
CREATE INDEX "student_assignments_studentId_idx" ON "student_assignments"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "student_assignments_assignmentBatchId_studentId_key" ON "student_assignments"("assignmentBatchId", "studentId");

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_batches" ADD CONSTRAINT "assignment_batches_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_batches" ADD CONSTRAINT "assignment_batches_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_batches" ADD CONSTRAINT "assignment_batches_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_assignments" ADD CONSTRAINT "student_assignments_assignmentBatchId_fkey" FOREIGN KEY ("assignmentBatchId") REFERENCES "assignment_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_assignments" ADD CONSTRAINT "student_assignments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

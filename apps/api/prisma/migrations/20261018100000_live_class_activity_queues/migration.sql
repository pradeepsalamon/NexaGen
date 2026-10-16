-- CreateEnum
CREATE TYPE "LiveClassActivityQueueStatus" AS ENUM ('DRAFT', 'LIVE', 'FINISHED');

-- CreateEnum
CREATE TYPE "LiveClassActivityKind" AS ENUM ('PUZZLE', 'QUESTION', 'CHAPTER');

-- CreateTable
CREATE TABLE "live_class_activity_queues" (
    "id" TEXT NOT NULL,
    "liveClassId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "LiveClassActivityQueueStatus" NOT NULL DEFAULT 'DRAFT',
    "currentItemId" TEXT,
    "clientId" TEXT,
    "createdById" TEXT,
    "launchedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_class_activity_queues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_class_activity_queue_items" (
    "id" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "LiveClassActivityKind" NOT NULL,
    "title" TEXT NOT NULL,
    "puzzleId" TEXT,
    "chapterId" TEXT,
    "fen" TEXT,
    "prompt" TEXT,
    "correctUci" TEXT,
    "durationSeconds" INTEGER,
    "puzzleAssignmentId" TEXT,
    "movePollId" TEXT,
    "activatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "activationError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_class_activity_queue_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_class_activity_queues_liveClassId_idx" ON "live_class_activity_queues"("liveClassId");

-- CreateIndex
CREATE UNIQUE INDEX "live_class_activity_queues_liveClassId_clientId_key" ON "live_class_activity_queues"("liveClassId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "live_class_activity_queue_items_puzzleAssignmentId_key" ON "live_class_activity_queue_items"("puzzleAssignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "live_class_activity_queue_items_movePollId_key" ON "live_class_activity_queue_items"("movePollId");

-- CreateIndex
CREATE INDEX "live_class_activity_queue_items_queueId_position_idx" ON "live_class_activity_queue_items"("queueId", "position");

-- CreateIndex
CREATE INDEX "live_class_activity_queue_items_puzzleId_idx" ON "live_class_activity_queue_items"("puzzleId");

-- CreateIndex
CREATE INDEX "live_class_activity_queue_items_chapterId_idx" ON "live_class_activity_queue_items"("chapterId");

-- AddForeignKey
ALTER TABLE "live_class_activity_queues" ADD CONSTRAINT "live_class_activity_queues_liveClassId_fkey" FOREIGN KEY ("liveClassId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_activity_queue_items" ADD CONSTRAINT "live_class_activity_queue_items_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "live_class_activity_queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_activity_queue_items" ADD CONSTRAINT "live_class_activity_queue_items_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "puzzles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- At most one running queue per class (hand-written: Prisma cannot express a partial index).
CREATE UNIQUE INDEX "live_class_activity_queues_one_live_per_class" ON "live_class_activity_queues"("liveClassId") WHERE "status" = 'LIVE';

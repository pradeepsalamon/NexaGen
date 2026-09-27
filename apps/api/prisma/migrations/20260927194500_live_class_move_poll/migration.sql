-- CreateEnum
CREATE TYPE "LiveClassMovePollStatus" AS ENUM ('OPEN', 'CLOSED', 'ENDED');

-- CreateTable
CREATE TABLE "live_class_move_polls" (
    "id" TEXT NOT NULL,
    "liveClassId" TEXT NOT NULL,
    "startedById" TEXT,
    "status" "LiveClassMovePollStatus" NOT NULL DEFAULT 'OPEN',
    "fen" TEXT NOT NULL,
    "prompt" TEXT,
    "revealed" BOOLEAN NOT NULL DEFAULT false,
    "correctUci" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_class_move_polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_class_move_poll_answers" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "uci" TEXT NOT NULL,
    "san" TEXT NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_class_move_poll_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_class_move_polls_liveClassId_idx" ON "live_class_move_polls"("liveClassId");

-- CreateIndex
CREATE INDEX "live_class_move_poll_answers_studentId_idx" ON "live_class_move_poll_answers"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "live_class_move_poll_answers_pollId_studentId_key" ON "live_class_move_poll_answers"("pollId", "studentId");

-- AddForeignKey
ALTER TABLE "live_class_move_polls" ADD CONSTRAINT "live_class_move_polls_liveClassId_fkey" FOREIGN KEY ("liveClassId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_move_polls" ADD CONSTRAINT "live_class_move_polls_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_move_poll_answers" ADD CONSTRAINT "live_class_move_poll_answers_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "live_class_move_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_move_poll_answers" ADD CONSTRAINT "live_class_move_poll_answers_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one open or closed (not yet ended) poll per class.
CREATE UNIQUE INDEX "live_class_move_polls_one_current_per_class" ON "live_class_move_polls"("liveClassId") WHERE "status" <> 'ENDED';

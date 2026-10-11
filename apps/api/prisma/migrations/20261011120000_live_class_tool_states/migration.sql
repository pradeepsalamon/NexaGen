-- CreateEnum
CREATE TYPE "LiveClassToolKind" AS ENUM ('PICK_STUDENT', 'MYSTERY_BOX', 'WALL_OF_MOMENTS', 'TEAMS', 'GM_MAPPER', 'SIDES', 'LEGENDS', 'TIMER');

-- CreateTable
CREATE TABLE "live_class_tool_states" (
    "id" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "tool" "LiveClassToolKind" NOT NULL,
    "batchId" TEXT,
    "liveClassId" TEXT,
    "state" JSONB NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_class_tool_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_class_tool_states_batchId_idx" ON "live_class_tool_states"("batchId");

-- CreateIndex
CREATE INDEX "live_class_tool_states_liveClassId_idx" ON "live_class_tool_states"("liveClassId");

-- CreateIndex
CREATE UNIQUE INDEX "live_class_tool_states_scopeKey_tool_key" ON "live_class_tool_states"("scopeKey", "tool");

-- AddForeignKey
ALTER TABLE "live_class_tool_states" ADD CONSTRAINT "live_class_tool_states_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_tool_states" ADD CONSTRAINT "live_class_tool_states_liveClassId_fkey" FOREIGN KEY ("liveClassId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;


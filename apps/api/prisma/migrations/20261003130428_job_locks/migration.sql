-- CreateTable
CREATE TABLE "job_locks" (
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL,
    "lockedUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_locks_pkey" PRIMARY KEY ("name")
);

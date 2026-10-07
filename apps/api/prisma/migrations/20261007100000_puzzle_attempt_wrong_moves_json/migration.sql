-- AlterTable
ALTER TABLE "puzzle_attempts" ADD COLUMN     "wrongMovesJson" JSONB NOT NULL DEFAULT '[]';

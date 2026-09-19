-- AlterTable
ALTER TABLE "chess_appearance_settings" ADD COLUMN     "disabledSoundThemeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT false;

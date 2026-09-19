-- CreateTable
CREATE TABLE "chess_appearance_settings" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default Chess Appearance Settings',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "disabledBoardThemeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "disabledPieceSetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chess_appearance_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_chess_appearance_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_chess_appearance_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_chess_appearance_preferences_userId_key" ON "user_chess_appearance_preferences"("userId");

-- AddForeignKey
ALTER TABLE "user_chess_appearance_preferences" ADD CONSTRAINT "user_chess_appearance_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

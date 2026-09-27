-- CreateTable
CREATE TABLE "typography_settings" (
    "id" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "typography_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_typography_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_typography_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_typography_preferences_userId_key" ON "user_typography_preferences"("userId");

-- AddForeignKey
ALTER TABLE "user_typography_preferences" ADD CONSTRAINT "user_typography_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

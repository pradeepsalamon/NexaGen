-- CreateTable
CREATE TABLE "user_mfa" (
    "userId" TEXT NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "enabledAt" TIMESTAMP(3),
    "lastUsedStep" INTEGER,
    "recoveryCodeHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_mfa_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "user_mfa" ADD CONSTRAINT "user_mfa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

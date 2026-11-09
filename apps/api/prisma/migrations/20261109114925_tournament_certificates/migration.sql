-- CreateEnum
CREATE TYPE "CertificateOrientation" AS ENUM ('LANDSCAPE', 'PORTRAIT');

-- CreateEnum
CREATE TYPE "CertificateBorderStyle" AS ENUM ('CLASSIC', 'MODERN', 'MINIMAL');

-- CreateEnum
CREATE TYPE "TournamentCertificateKind" AS ENUM ('PLACEMENT', 'AGE_GROUP_PLACEMENT', 'PARTICIPATION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TournamentAuditAction" ADD VALUE 'CERTIFICATE_RULES_CHANGED';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'CERTIFICATES_ISSUED';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'CERTIFICATE_REVOKED';

-- AlterTable
ALTER TABLE "tournament_games" ADD COLUMN     "notifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tournament_rounds" ADD COLUMN     "notifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "completedNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "startingSoonNotifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "certificate_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "orientation" "CertificateOrientation" NOT NULL DEFAULT 'LANDSCAPE',
    "borderStyle" "CertificateBorderStyle" NOT NULL DEFAULT 'CLASSIC',
    "accentColor" TEXT NOT NULL,
    "signatoryName" TEXT,
    "signatoryTitle" TEXT,
    "secondSignatoryName" TEXT,
    "secondSignatoryTitle" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificate_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_certificate_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "tournamentId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "kind" "TournamentCertificateKind" NOT NULL,
    "topN" INTEGER,
    "minGames" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_certificate_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_certificates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "tournamentId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "verificationCode" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "revokedById" TEXT,

    CONSTRAINT "tournament_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "certificate_templates_tenantId_archivedAt_idx" ON "certificate_templates"("tenantId", "archivedAt");

-- CreateIndex
CREATE INDEX "tournament_certificate_rules_tournamentId_idx" ON "tournament_certificate_rules"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_certificates_verificationCode_key" ON "tournament_certificates"("verificationCode");

-- CreateIndex
CREATE INDEX "tournament_certificates_userId_idx" ON "tournament_certificates"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_certificates_tournamentId_userId_ruleId_key" ON "tournament_certificates"("tournamentId", "userId", "ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_certificates_tenantId_serialNumber_key" ON "tournament_certificates"("tenantId", "serialNumber");

-- AddForeignKey
ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_certificate_rules" ADD CONSTRAINT "tournament_certificate_rules_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_certificate_rules" ADD CONSTRAINT "tournament_certificate_rules_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "certificate_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_certificates" ADD CONSTRAINT "tournament_certificates_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_certificates" ADD CONSTRAINT "tournament_certificates_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "tournament_certificate_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_certificates" ADD CONSTRAINT "tournament_certificates_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "certificate_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_certificates" ADD CONSTRAINT "tournament_certificates_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "tournament_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_certificates" ADD CONSTRAINT "tournament_certificates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_certificates" ADD CONSTRAINT "tournament_certificates_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


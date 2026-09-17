-- CreateEnum
CREATE TYPE "CoachEngagementType" AS ENUM ('EMPLOYEE', 'CONTRACTOR', 'FREELANCER', 'OTHER');

-- CreateEnum
CREATE TYPE "CoachCompensationModel" AS ENUM ('HOURLY', 'PER_CLASS', 'FIXED_SALARY', 'HOURLY_PLUS_CLASS', 'TIERED', 'PERCENTAGE', 'HYBRID');

-- CreateEnum
CREATE TYPE "CompensationCalculationType" AS ENUM ('HOURLY_RATE', 'PER_CLASS_RATE', 'MONTHLY_SALARY', 'TIER', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "PayrollRuleType" AS ENUM ('CANCELLATION', 'ATTENDANCE', 'BONUS', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "PayrollPeriodType" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('DRAFT', 'CALCULATING', 'REVIEW', 'APPROVED', 'FINALIZED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CoachPayrollRecordStatus" AS ENUM ('PENDING', 'CALCULATED', 'REVIEWED', 'APPROVED', 'FINALIZED', 'PAID');

-- CreateEnum
CREATE TYPE "PayrollAdjustmentType" AS ENUM ('EARNING', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayslipDocumentKind" AS ENUM ('PAYSLIP', 'PAYMENT_STATEMENT');

-- CreateEnum
CREATE TYPE "PayslipPdfStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledById" TEXT;

-- CreateTable
CREATE TABLE "coach_compensation_profiles" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "engagementType" "CoachEngagementType" NOT NULL DEFAULT 'EMPLOYEE',
    "defaultCompensationModel" "CoachCompensationModel" NOT NULL DEFAULT 'HOURLY',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "paymentMethod" TEXT,
    "paymentDetails" JSONB,
    "panNumber" TEXT,
    "gstin" TEXT,
    "taxTreatment" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_compensation_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_compensation_rates" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "compensationProfileId" TEXT,
    "compensationModel" "CoachCompensationModel" NOT NULL,
    "calculationType" "CompensationCalculationType" NOT NULL,
    "rateMinor" INTEGER,
    "percentageBps" INTEGER,
    "tierConfig" JSONB,
    "scopeConfig" JSONB,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_compensation_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ruleType" "PayrollRuleType" NOT NULL,
    "condition" JSONB NOT NULL,
    "effect" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" TEXT NOT NULL,
    "periodType" "PayrollPeriodType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "calculatedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "finalizedById" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_payroll_records" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "status" "CoachPayrollRecordStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledClassesCount" INTEGER NOT NULL DEFAULT 0,
    "completedClassesCount" INTEGER NOT NULL DEFAULT 0,
    "cancelledByCoachCount" INTEGER NOT NULL DEFAULT 0,
    "cancelledByStudentCount" INTEGER NOT NULL DEFAULT 0,
    "cancelledByAdminCount" INTEGER NOT NULL DEFAULT 0,
    "noShowCount" INTEGER NOT NULL DEFAULT 0,
    "totalTeachingSeconds" INTEGER NOT NULL DEFAULT 0,
    "totalBoardSeconds" INTEGER NOT NULL DEFAULT 0,
    "earningsBreakdown" JSONB,
    "rateSnapshot" JSONB,
    "ruleSnapshot" JSONB,
    "grossEarningsMinor" INTEGER NOT NULL DEFAULT 0,
    "totalDeductionsMinor" INTEGER NOT NULL DEFAULT 0,
    "totalAdjustmentsMinor" INTEGER NOT NULL DEFAULT 0,
    "netPayableMinor" INTEGER NOT NULL DEFAULT 0,
    "calculatedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_payroll_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_adjustments" (
    "id" TEXT NOT NULL,
    "payrollRecordId" TEXT NOT NULL,
    "type" "PayrollAdjustmentType" NOT NULL,
    "description" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "reversedById" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_payouts" (
    "id" TEXT NOT NULL,
    "payrollRecordId" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "method" TEXT,
    "reference" TEXT,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "adminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "payrollRecordId" TEXT NOT NULL,
    "documentKind" "PayslipDocumentKind" NOT NULL,
    "engagementTypeAtIssue" "CoachEngagementType" NOT NULL,
    "storageKey" TEXT,
    "pdfStatus" "PayslipPdfStatus" NOT NULL DEFAULT 'PENDING',
    "pdfError" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslip_sequences" (
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payslip_sequences_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "coach_compensation_profiles_coachId_key" ON "coach_compensation_profiles"("coachId");

-- CreateIndex
CREATE INDEX "coach_compensation_rates_coachId_effectiveFrom_idx" ON "coach_compensation_rates"("coachId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "payroll_rules_ruleType_enabled_idx" ON "payroll_rules"("ruleType", "enabled");

-- CreateIndex
CREATE INDEX "payroll_periods_status_idx" ON "payroll_periods"("status");

-- CreateIndex
CREATE INDEX "payroll_periods_startDate_endDate_idx" ON "payroll_periods"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_periodType_startDate_endDate_key" ON "payroll_periods"("periodType", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "coach_payroll_records_coachId_idx" ON "coach_payroll_records"("coachId");

-- CreateIndex
CREATE INDEX "coach_payroll_records_status_idx" ON "coach_payroll_records"("status");

-- CreateIndex
CREATE UNIQUE INDEX "coach_payroll_records_periodId_coachId_key" ON "coach_payroll_records"("periodId", "coachId");

-- CreateIndex
CREATE INDEX "payroll_adjustments_payrollRecordId_idx" ON "payroll_adjustments"("payrollRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "coach_payouts_payrollRecordId_key" ON "coach_payouts"("payrollRecordId");

-- CreateIndex
CREATE INDEX "coach_payouts_status_idx" ON "coach_payouts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_documentNumber_key" ON "payslips"("documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_payrollRecordId_key" ON "payslips"("payrollRecordId");

-- CreateIndex
CREATE INDEX "payslips_pdfStatus_idx" ON "payslips"("pdfStatus");

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_compensation_profiles" ADD CONSTRAINT "coach_compensation_profiles_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_compensation_profiles" ADD CONSTRAINT "coach_compensation_profiles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_compensation_rates" ADD CONSTRAINT "coach_compensation_rates_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_compensation_rates" ADD CONSTRAINT "coach_compensation_rates_compensationProfileId_fkey" FOREIGN KEY ("compensationProfileId") REFERENCES "coach_compensation_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_compensation_rates" ADD CONSTRAINT "coach_compensation_rates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_rules" ADD CONSTRAINT "payroll_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_payroll_records" ADD CONSTRAINT "coach_payroll_records_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "payroll_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_payroll_records" ADD CONSTRAINT "coach_payroll_records_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_payrollRecordId_fkey" FOREIGN KEY ("payrollRecordId") REFERENCES "coach_payroll_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_payouts" ADD CONSTRAINT "coach_payouts_payrollRecordId_fkey" FOREIGN KEY ("payrollRecordId") REFERENCES "coach_payroll_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_payouts" ADD CONSTRAINT "coach_payouts_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payrollRecordId_fkey" FOREIGN KEY ("payrollRecordId") REFERENCES "coach_payroll_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

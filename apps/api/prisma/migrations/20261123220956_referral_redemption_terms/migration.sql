-- A redemption keeps the voucher's plans and code lifetime from when it was made (review R4).
ALTER TABLE "referral_redemptions" ADD COLUMN "voucherPlanIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "referral_redemptions" ADD COLUMN "codeValidDays" INTEGER;

-- Existing rows take their voucher's current terms (what they would have got until now).
UPDATE "referral_redemptions" AS r
SET "voucherPlanIds" = v."planIds", "codeValidDays" = v."codeValidDays"
FROM "referral_vouchers" AS v
WHERE r."voucherId" = v."id";

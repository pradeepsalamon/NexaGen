-- DropForeignKey
ALTER TABLE "coach_compensation_profiles" DROP CONSTRAINT "coach_compensation_profiles_coachId_fkey";

-- DropForeignKey
ALTER TABLE "coach_compensation_rates" DROP CONSTRAINT "coach_compensation_rates_coachId_fkey";

-- DropForeignKey
ALTER TABLE "coach_payroll_records" DROP CONSTRAINT "coach_payroll_records_coachId_fkey";

-- DropForeignKey
ALTER TABLE "coach_payroll_records" DROP CONSTRAINT "coach_payroll_records_periodId_fkey";

-- DropForeignKey
ALTER TABLE "credit_notes" DROP CONSTRAINT "credit_notes_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "credit_notes" DROP CONSTRAINT "credit_notes_userId_fkey";

-- DropForeignKey
ALTER TABLE "discount_redemptions" DROP CONSTRAINT "discount_redemptions_discountId_fkey";

-- DropForeignKey
ALTER TABLE "discount_redemptions" DROP CONSTRAINT "discount_redemptions_orderId_fkey";

-- DropForeignKey
ALTER TABLE "discount_redemptions" DROP CONSTRAINT "discount_redemptions_userId_fkey";

-- DropForeignKey
ALTER TABLE "entitlements" DROP CONSTRAINT "entitlements_userId_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_orderId_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_userId_fkey";

-- DropForeignKey
ALTER TABLE "manual_payment_records" DROP CONSTRAINT "manual_payment_records_paymentId_fkey";

-- DropForeignKey
ALTER TABLE "manual_payment_records" DROP CONSTRAINT "manual_payment_records_recordedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_userId_fkey";

-- DropForeignKey
ALTER TABLE "payment_attempts" DROP CONSTRAINT "payment_attempts_orderId_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_orderId_fkey";

-- DropForeignKey
ALTER TABLE "payroll_adjustments" DROP CONSTRAINT "payroll_adjustments_payrollRecordId_fkey";

-- DropForeignKey
ALTER TABLE "payslips" DROP CONSTRAINT "payslips_payrollRecordId_fkey";

-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_paymentId_fkey";

-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_userId_fkey";

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payment_records" ADD CONSTRAINT "manual_payment_records_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payment_records" ADD CONSTRAINT "manual_payment_records_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "discounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_compensation_profiles" ADD CONSTRAINT "coach_compensation_profiles_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_compensation_rates" ADD CONSTRAINT "coach_compensation_rates_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_payroll_records" ADD CONSTRAINT "coach_payroll_records_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_payroll_records" ADD CONSTRAINT "coach_payroll_records_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_payrollRecordId_fkey" FOREIGN KEY ("payrollRecordId") REFERENCES "coach_payroll_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payrollRecordId_fkey" FOREIGN KEY ("payrollRecordId") REFERENCES "coach_payroll_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

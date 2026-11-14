import { API_ROUTES } from "@nexa-chess/types";
import type {
  CancelPayrollPeriodRequest,
  CloseCompensationRateRequest,
  CoachPayoutItem,
  CoachPayoutListResponse,
  CoachPayrollRecordItem,
  CoachPayrollRecordListResponse,
  CompensationProfileItem,
  CompensationRateItem,
  CreateCompensationRateRequest,
  CreatePayoutRequest,
  CreatePayrollAdjustmentRequest,
  CreatePayrollPeriodRequest,
  CreatePayrollRuleRequest,
  MarkPayoutPaidRequest,
  PayrollAdjustmentItem,
  PayrollAdjustmentListResponse,
  PayrollPeriodItem,
  PayrollPeriodListResponse,
  PayrollRuleItem,
  PayrollRuleListResponse,
  PayslipItem,
  ReversePayrollAdjustmentRequest,
  UpdateCompensationProfileRequest,
  UpdatePayrollRuleRequest
} from "@nexa-chess/types";
import { getWebEnv } from "@nexa-chess/config/web";
import { apiFetch } from "@/lib/api";

const API_BASE_URL = getWebEnv({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL
}).NEXT_PUBLIC_API_URL;

// ── Coach (own data, read-only) ──

export function getMyPayrollRecords(): Promise<CoachPayrollRecordListResponse> {
  return apiFetch<CoachPayrollRecordListResponse>(API_ROUTES.payroll.mine);
}

export function getMyPayrollRecord(id: string): Promise<{ record: CoachPayrollRecordItem }> {
  return apiFetch(API_ROUTES.payroll.record(id));
}

export function getMyPayslips(): Promise<{ payslips: PayslipItem[] }> {
  return apiFetch(API_ROUTES.payroll.payslips);
}

export function myPayslipPdfUrl(id: string): string {
  return `${API_BASE_URL}${API_ROUTES.payroll.payslipPdf(id)}`;
}

// ── Admin: periods ──

export function getAdminPayrollPeriods(): Promise<PayrollPeriodListResponse> {
  return apiFetch(API_ROUTES.adminPayroll.periods);
}

export function createPayrollPeriod(
  body: CreatePayrollPeriodRequest
): Promise<{ period: PayrollPeriodItem }> {
  return apiFetch(API_ROUTES.adminPayroll.periods, { method: "POST", body });
}

export function getAdminPayrollPeriod(id: string): Promise<{ period: PayrollPeriodItem }> {
  return apiFetch(API_ROUTES.adminPayroll.period(id));
}

export function calculatePayrollPeriod(id: string): Promise<{ period: PayrollPeriodItem }> {
  return apiFetch(API_ROUTES.adminPayroll.calculatePeriod(id), { method: "POST" });
}

export function recalculatePayrollPeriod(id: string): Promise<{ period: PayrollPeriodItem }> {
  return apiFetch(API_ROUTES.adminPayroll.recalculatePeriod(id), { method: "POST" });
}

export function approvePayrollPeriod(id: string): Promise<{ period: PayrollPeriodItem }> {
  return apiFetch(API_ROUTES.adminPayroll.approvePeriod(id), { method: "POST" });
}

export function finalizePayrollPeriod(id: string): Promise<{ period: PayrollPeriodItem }> {
  return apiFetch(API_ROUTES.adminPayroll.finalizePeriod(id), { method: "POST" });
}

export function markPayrollPeriodPaid(id: string): Promise<{ period: PayrollPeriodItem }> {
  return apiFetch(API_ROUTES.adminPayroll.markPaidPeriod(id), { method: "POST" });
}

export function cancelPayrollPeriod(
  id: string,
  body: CancelPayrollPeriodRequest
): Promise<{ period: PayrollPeriodItem }> {
  return apiFetch(API_ROUTES.adminPayroll.cancelPeriod(id), { method: "POST", body });
}

// ── Admin: records ──

export function getAdminPayrollRecords(periodId: string): Promise<CoachPayrollRecordListResponse> {
  return apiFetch(`${API_ROUTES.adminPayroll.records}?periodId=${encodeURIComponent(periodId)}`);
}

export function getAdminPayrollRecord(id: string): Promise<{ record: CoachPayrollRecordItem }> {
  return apiFetch(API_ROUTES.adminPayroll.record(id));
}

export function recalculatePayrollRecord(id: string): Promise<{ record: CoachPayrollRecordItem }> {
  return apiFetch(API_ROUTES.adminPayroll.recalculateRecord(id), { method: "POST" });
}

export function getPayrollRecordAudit(recordId: string) {
  return apiFetch(API_ROUTES.adminPayroll.audit(recordId));
}

// ── Admin: adjustments ──

export function getPayrollAdjustments(recordId: string): Promise<PayrollAdjustmentListResponse> {
  return apiFetch(API_ROUTES.adminPayroll.adjustments(recordId));
}

export function createPayrollAdjustment(
  recordId: string,
  body: CreatePayrollAdjustmentRequest
): Promise<{ adjustment: PayrollAdjustmentItem }> {
  return apiFetch(API_ROUTES.adminPayroll.adjustments(recordId), { method: "POST", body });
}

export function reversePayrollAdjustment(
  id: string,
  body: ReversePayrollAdjustmentRequest
): Promise<{ adjustment: PayrollAdjustmentItem }> {
  return apiFetch(API_ROUTES.adminPayroll.reverseAdjustment(id), { method: "POST", body });
}

// ── Admin: compensation profiles & rates ──

export function getCompensationProfiles(): Promise<{ profiles: CompensationProfileItem[] }> {
  return apiFetch(API_ROUTES.adminPayroll.compensationProfiles);
}

export function getCompensationProfile(
  coachId: string
): Promise<{ profile: CompensationProfileItem }> {
  return apiFetch(API_ROUTES.adminPayroll.compensationProfile(coachId));
}

export function updateCompensationProfile(
  coachId: string,
  body: UpdateCompensationProfileRequest
): Promise<{ profile: CompensationProfileItem }> {
  return apiFetch(API_ROUTES.adminPayroll.compensationProfile(coachId), {
    method: "PUT",
    body
  });
}

export function getCompensationRates(
  coachId: string
): Promise<{ rates: CompensationRateItem[] }> {
  return apiFetch(API_ROUTES.adminPayroll.compensationRates(coachId));
}

export function addCompensationRate(
  coachId: string,
  body: CreateCompensationRateRequest
): Promise<{ rate: CompensationRateItem }> {
  return apiFetch(API_ROUTES.adminPayroll.compensationRates(coachId), {
    method: "POST",
    body
  });
}

export function closeCompensationRate(
  id: string,
  body: CloseCompensationRateRequest
): Promise<{ rate: CompensationRateItem }> {
  return apiFetch(API_ROUTES.adminPayroll.closeCompensationRate(id), {
    method: "POST",
    body
  });
}

// ── Admin: rules ──

export function getPayrollRules(): Promise<PayrollRuleListResponse> {
  return apiFetch(API_ROUTES.adminPayroll.rules);
}

export function createPayrollRule(
  body: CreatePayrollRuleRequest
): Promise<{ rule: PayrollRuleItem }> {
  return apiFetch(API_ROUTES.adminPayroll.rules, { method: "POST", body });
}

export function updatePayrollRule(
  id: string,
  body: UpdatePayrollRuleRequest
): Promise<{ rule: PayrollRuleItem }> {
  return apiFetch(API_ROUTES.adminPayroll.rule(id), { method: "PUT", body });
}

// ── Admin: payouts ──

export function getAdminPayouts(periodId: string): Promise<CoachPayoutListResponse> {
  return apiFetch(`${API_ROUTES.adminPayroll.payouts}?periodId=${encodeURIComponent(periodId)}`);
}

export function createPayout(body: CreatePayoutRequest): Promise<{ payout: CoachPayoutItem }> {
  return apiFetch(API_ROUTES.adminPayroll.payouts, { method: "POST", body });
}

export function markPayoutPaid(
  id: string,
  body: MarkPayoutPaidRequest
): Promise<{ payout: CoachPayoutItem }> {
  return apiFetch(API_ROUTES.adminPayroll.markPayoutPaid(id), { method: "POST", body });
}

// ── Admin: payslip PDFs ──

export function adminPayslipPdfUrl(id: string): string {
  return `${API_BASE_URL}${API_ROUTES.adminPayroll.payslipPdf(id)}`;
}

export function retryPayslipPdf(id: string): Promise<{ queued: boolean }> {
  return apiFetch(API_ROUTES.adminPayroll.retryPayslipPdf(id), { method: "POST" });
}

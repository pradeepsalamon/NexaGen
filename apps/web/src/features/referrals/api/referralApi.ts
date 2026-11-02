import {
  API_ROUTES,
  type CreateReferralPaymentCodeRequest,
  type MyReferralSummary,
  type ReferralCreditEntryItem,
  type ReferralItem,
  type ReferralPage,
  type ReferralPaymentCodeItem,
  type ReferralRewardItem,
  type ReferralVisitRequest,
  type ReferralVisitResponse,
  type ReferralWithdrawalItem,
  type RequestReferralWithdrawalRequest
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";
import { withQuery, type ReferralListParams } from "../lib/referralQuery";

// ── Public ──

export function recordReferralVisit(body: ReferralVisitRequest): Promise<ReferralVisitResponse> {
  return apiFetch<ReferralVisitResponse>(API_ROUTES.referrals.visit, { body, method: "POST" });
}

// ── Referrer board ──

export function getMyReferralSummary(): Promise<MyReferralSummary> {
  return apiFetch<MyReferralSummary>(API_ROUTES.referrals.me);
}

export function getMyReferrals(params: ReferralListParams): Promise<ReferralPage<ReferralItem>> {
  return apiFetch<ReferralPage<ReferralItem>>(withQuery(API_ROUTES.referrals.myReferrals, params));
}

export function getMyReferralRewards(): Promise<ReferralRewardItem[]> {
  return apiFetch<ReferralRewardItem[]>(API_ROUTES.referrals.myRewards);
}

export function getMyReferralCredits(): Promise<ReferralCreditEntryItem[]> {
  return apiFetch<ReferralCreditEntryItem[]>(API_ROUTES.referrals.myCredits);
}

export function getMyReferralWithdrawals(): Promise<ReferralWithdrawalItem[]> {
  return apiFetch<ReferralWithdrawalItem[]>(API_ROUTES.referrals.myWithdrawals);
}

export function requestReferralWithdrawal(body: RequestReferralWithdrawalRequest): Promise<ReferralWithdrawalItem> {
  return apiFetch<ReferralWithdrawalItem>(API_ROUTES.referrals.myWithdrawals, { body, method: "POST" });
}

export function cancelReferralWithdrawal(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(API_ROUTES.referrals.cancelWithdrawal(id), { method: "POST" });
}

export function getMyReferralPaymentCodes(): Promise<ReferralPaymentCodeItem[]> {
  return apiFetch<ReferralPaymentCodeItem[]>(API_ROUTES.referrals.myPaymentCodes);
}

export function createReferralPaymentCode(body: CreateReferralPaymentCodeRequest): Promise<ReferralPaymentCodeItem> {
  return apiFetch<ReferralPaymentCodeItem>(API_ROUTES.referrals.myPaymentCodes, { body, method: "POST" });
}

export function cancelReferralPaymentCode(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(API_ROUTES.referrals.cancelPaymentCode(id), { method: "POST" });
}

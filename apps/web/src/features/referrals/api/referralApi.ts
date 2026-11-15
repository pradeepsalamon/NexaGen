import {
  API_ROUTES,
  type MyReferralSummary,
  type MyReferralVoucherCatalogue,
  type RedeemReferralVoucherRequest,
  type ReferralCreditEntryItem,
  type ReferralItem,
  type ReferralPage,
  type ReferralRedemptionItem,
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

/** Points and money history: every ledger movement. */
export function getMyReferralCredits(): Promise<ReferralCreditEntryItem[]> {
  return apiFetch<ReferralCreditEntryItem[]>(API_ROUTES.referrals.myCredits);
}

// ── Withdrawals (coaches and sales) ──

export function getMyReferralWithdrawals(): Promise<ReferralWithdrawalItem[]> {
  return apiFetch<ReferralWithdrawalItem[]>(API_ROUTES.referrals.myWithdrawals);
}

export function requestReferralWithdrawal(body: RequestReferralWithdrawalRequest): Promise<ReferralWithdrawalItem> {
  return apiFetch<ReferralWithdrawalItem>(API_ROUTES.referrals.myWithdrawals, { body, method: "POST" });
}

export function cancelReferralWithdrawal(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(API_ROUTES.referrals.cancelWithdrawal(id), { method: "POST" });
}

// ── Rewards store (students) ──

export function getMyReferralVouchers(): Promise<MyReferralVoucherCatalogue> {
  return apiFetch<MyReferralVoucherCatalogue>(API_ROUTES.referrals.myVouchers);
}

export function redeemReferralVoucher(args: { id: string; body: RedeemReferralVoucherRequest }): Promise<ReferralRedemptionItem> {
  return apiFetch<ReferralRedemptionItem>(API_ROUTES.referrals.redeemVoucher(args.id), { body: args.body, method: "POST" });
}

export function getMyReferralRedemptions(): Promise<ReferralRedemptionItem[]> {
  return apiFetch<ReferralRedemptionItem[]>(API_ROUTES.referrals.myRedemptions);
}

export function cancelReferralRedemption(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(API_ROUTES.referrals.cancelRedemption(id), { method: "POST" });
}

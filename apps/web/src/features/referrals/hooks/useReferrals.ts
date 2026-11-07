import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RequestReferralWithdrawalRequest } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import {
  cancelReferralRedemption,
  cancelReferralWithdrawal,
  getMyReferralCredits,
  getMyReferralRedemptions,
  getMyReferralRewards,
  getMyReferrals,
  getMyReferralSummary,
  getMyReferralVouchers,
  getMyReferralWithdrawals,
  redeemReferralVoucher,
  requestReferralWithdrawal
} from "../api/referralApi";
import type { ReferralListParams } from "../lib/referralQuery";

export function useMyReferralSummary() {
  return useQuery({ queryFn: getMyReferralSummary, queryKey: queryKeys.referrals.me });
}

export function useMyReferrals(params: ReferralListParams) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => getMyReferrals(params),
    queryKey: queryKeys.referrals.myList(params)
  });
}

export function useMyReferralRewards() {
  return useQuery({ queryFn: getMyReferralRewards, queryKey: queryKeys.referrals.myRewards });
}

export function useMyReferralCredits() {
  return useQuery({ queryFn: getMyReferralCredits, queryKey: queryKeys.referrals.myCredits });
}

export function useMyReferralWithdrawals(enabled = true) {
  return useQuery({ enabled, queryFn: getMyReferralWithdrawals, queryKey: queryKeys.referrals.myWithdrawals });
}

export function useMyReferralVouchers(enabled = true) {
  return useQuery({ enabled, queryFn: getMyReferralVouchers, queryKey: queryKeys.referrals.myVouchers });
}

export function useMyReferralRedemptions(enabled = true) {
  return useQuery({ enabled, queryFn: getMyReferralRedemptions, queryKey: queryKeys.referrals.myRedemptions });
}

/** Wallet writes: toast, then refresh everything under `referrals.me`. */
function useWalletMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>, success: string, failure: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onError: (error: Error) => toast.error({ message: error.message, title: failure }),
    onSuccess: () => {
      toast.success({ title: success });
      void queryClient.invalidateQueries({ queryKey: queryKeys.referrals.me });
    }
  });
}

export function useRequestWithdrawal() {
  return useWalletMutation(
    (body: RequestReferralWithdrawalRequest) => requestReferralWithdrawal(body),
    "Withdrawal requested",
    "Could not request the withdrawal"
  );
}

export function useCancelWithdrawal() {
  return useWalletMutation((id: string) => cancelReferralWithdrawal(id), "Withdrawal cancelled", "Could not cancel");
}

export function useRedeemVoucher() {
  return useWalletMutation(redeemReferralVoucher, "Voucher redeemed", "Could not redeem the voucher");
}

export function useCancelRedemption() {
  return useWalletMutation((id: string) => cancelReferralRedemption(id), "Request cancelled, points returned", "Could not cancel");
}

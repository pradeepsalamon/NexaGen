import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateReferralPaymentCodeRequest, RequestReferralWithdrawalRequest } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import {
  cancelReferralPaymentCode,
  cancelReferralWithdrawal,
  createReferralPaymentCode,
  getMyReferralCredits,
  getMyReferralPaymentCodes,
  getMyReferralRewards,
  getMyReferrals,
  getMyReferralSummary,
  getMyReferralWithdrawals,
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

export function useMyReferralWithdrawals() {
  return useQuery({ queryFn: getMyReferralWithdrawals, queryKey: queryKeys.referrals.myWithdrawals });
}

export function useMyReferralPaymentCodes(enabled: boolean) {
  return useQuery({ enabled, queryFn: getMyReferralPaymentCodes, queryKey: queryKeys.referrals.myPaymentCodes });
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

export function useCreatePaymentCode() {
  return useWalletMutation(
    (body: CreateReferralPaymentCodeRequest) => createReferralPaymentCode(body),
    "Payment code created",
    "Could not create the code"
  );
}

export function useCancelPaymentCode() {
  return useWalletMutation((id: string) => cancelReferralPaymentCode(id), "Code cancelled, credits returned", "Could not cancel the code");
}

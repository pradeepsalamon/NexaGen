import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { referralAdminApi } from "../api/referralAdminApi";
import type { ReferralListParams } from "../lib/referralQuery";

export function useReferralOverview() {
  return useQuery({ queryFn: referralAdminApi.overview, queryKey: queryKeys.referrals.adminOverview });
}

export function useAdminReferrals(params: ReferralListParams) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => referralAdminApi.list(params),
    queryKey: queryKeys.referrals.adminList(params)
  });
}

export function useAdminReferral(id: string | null) {
  return useQuery({
    enabled: !!id,
    queryFn: () => referralAdminApi.get(id!),
    queryKey: queryKeys.referrals.adminDetail(id ?? "")
  });
}

export function useReferrers(params: ReferralListParams) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => referralAdminApi.referrers(params),
    queryKey: queryKeys.referrals.adminReferrers(params)
  });
}

export function useReferralStages() {
  return useQuery({ queryFn: referralAdminApi.stages, queryKey: queryKeys.referrals.adminStages });
}

export function useReferralRules() {
  return useQuery({ queryFn: referralAdminApi.rules, queryKey: queryKeys.referrals.adminRules });
}

export function useAdminReferralRewards(params: ReferralListParams) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => referralAdminApi.rewards(params),
    queryKey: queryKeys.referrals.adminRewards(params)
  });
}

export function useAdminReferralWithdrawals(params: ReferralListParams) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => referralAdminApi.withdrawals(params),
    queryKey: queryKeys.referrals.adminWithdrawals(params)
  });
}

export function useAdminReferralLedger(params: ReferralListParams) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => referralAdminApi.ledger(params),
    queryKey: queryKeys.referrals.adminLedger(params)
  });
}

export function useReferralSettings() {
  return useQuery({ queryFn: referralAdminApi.settings, queryKey: queryKeys.referrals.adminSettings });
}

/**
 * Every admin write refreshes the whole referral cache: a stage move can
 * create rewards, a reward approval changes balances, and so on.
 */
export function useReferralAdminMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  messages: { success: string; failure: string }
) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onError: (error: Error) => toast.error({ message: error.message, title: messages.failure }),
    onSuccess: () => {
      toast.success({ title: messages.success });
      void queryClient.invalidateQueries({ queryKey: queryKeys.referrals.all });
    }
  });
}

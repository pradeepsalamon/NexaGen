import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ListParams } from "@/lib/pagination";
import { queryKeys } from "@/lib/queryKeys";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import {
  getEmailOverview,
  listSentEmails,
  listUnverifiedAccounts,
  sendVerificationLink,
  setEmailVerificationPolicy,
  setEmailVerified,
  verifyAllAccounts
} from "../api/emailAdminApi";

export function useEmailOverview() {
  return useQuery({ queryFn: getEmailOverview, queryKey: queryKeys.emailAdmin.overview });
}

export function useUnverifiedAccounts(params: ListParams) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => listUnverifiedAccounts(params),
    queryKey: queryKeys.emailAdmin.unverified(params)
  });
}

export function useSentEmails(params: ListParams) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => listSentEmails(params),
    queryKey: queryKeys.emailAdmin.sent(params)
  });
}

// undo: intentionally excluded — a settings Save whose correction is setting it back.
export function useSetEmailVerificationPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setEmailVerificationPolicy,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.emailAdmin.all })
  });
}

// undo: intentionally excluded — confirmed up front, and the accounts it changes are not listed afterwards.
export function useVerifyAllAccounts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: verifyAllAccounts,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.emailAdmin.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
      ])
  });
}

// undo: intentionally excluded — an email cannot be unsent.
export function useSendVerificationLink() {
  return useMutation({ mutationFn: sendVerificationLink });
}

export function useSetEmailVerified() {
  return useUndoableMutation({
    invalidates: [queryKeys.emailAdmin.all, queryKeys.users.all],
    mutationFn: ({ userId, verified }: { userId: string; verified: boolean }) => setEmailVerified(userId, verified),
    strategy: "immediate",
    toast: ({ verified }) => ({ title: verified ? "Marked as verified" : "Marked as not verified" }),
    undo: ({ userId, verified }) => setEmailVerified(userId, !verified)
  });
}

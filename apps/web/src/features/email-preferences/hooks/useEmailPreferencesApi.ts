import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import {
  getEmailPreferences,
  setEmailPreferencesByLink,
  updateEmailPreferences
} from "../api/emailPreferencesApi";
import { useToast } from "@/providers/ToastProvider";

export function useEmailPreferences() {
  return useQuery({ queryFn: getEmailPreferences, queryKey: queryKeys.emailPreferences.mine });
}

export function useUpdateEmailPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateEmailPreferences,
    onSuccess: (data) => queryClient.setQueryData(queryKeys.emailPreferences.mine, data)
  });
}

export function useSetEmailPreferencesByLink() {
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setEmailPreferencesByLink,
    // The link may belong to whoever is signed in here; their profile switch must not show a stale value.
    onError: (error: Error) => toast.error({ message: error.message, title: "Couldn't save email preferences" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.emailPreferences.mine })
  });
}

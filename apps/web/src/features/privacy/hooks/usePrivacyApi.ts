import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateAccountDeletionRequest } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import {
  getMyDataExport,
  getMyDeletionRequest,
  listDeletionRequests,
  requestAccountDeletion,
  withdrawAccountDeletion
} from "../api/privacyApi";

export const PRIVACY_INVALIDATES = [queryKeys.privacy.all];

/** A mutation, not a query: the export is fetched on demand and never cached. */
export function useDownloadMyData() {
  return useMutation({
    mutationFn: async () => {
      const data = await getMyDataExport();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `nexa-my-data-${data.exportedAt.slice(0, 10)}.json`;
      // Attached for the click (Firefox ignores a detached anchor), and the URL
      // revoked a tick later so the download has started.
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  });
}

export function useMyDeletionRequest() {
  return useQuery({ queryFn: getMyDeletionRequest, queryKey: queryKeys.privacy.myDeletionRequest });
}

export function useRequestAccountDeletion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAccountDeletionRequest) => requestAccountDeletion(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.privacy.all })
  });
}

export function useWithdrawAccountDeletion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: withdrawAccountDeletion,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.privacy.all })
  });
}

export function useDeletionRequests() {
  return useQuery({ queryFn: listDeletionRequests, queryKey: queryKeys.privacy.deletionRequests });
}

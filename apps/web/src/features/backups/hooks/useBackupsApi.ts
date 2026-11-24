import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getBackupDownloadLink, listBackups, triggerBackup } from "../api/backupsApi";

/** Database dumps in object storage, newest first (platform operators only). */
export function useBackupsQuery() {
  return useQuery({ queryFn: listBackups, queryKey: queryKeys.backups.all });
}

// undo: intentionally excluded — creating a backup adds a file and changes no
// data; there is nothing to take back (lib/undo/README.md).
export function useTriggerBackupMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerBackup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.backups.all })
  });
}

// undo: intentionally excluded — read-only, it only signs a download link.
export function useBackupDownloadLinkMutation() {
  return useMutation({ mutationFn: getBackupDownloadLink });
}

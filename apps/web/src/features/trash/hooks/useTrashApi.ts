import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TrashBulkActionRequest, TrashItem, TrashListRequest } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import {
  bulkDeleteTrashItemsPermanently,
  bulkRestoreTrashItems,
  deleteTrashItemPermanently,
  emptyTrash,
  listTrash,
  restoreTrashItem
} from "../api/trashApi";
import { useToast } from "@/providers/ToastProvider";

export function useTrashQuery(params: TrashListRequest) {
  return useQuery({
    queryFn: () => listTrash(params),
    queryKey: queryKeys.trash.list(params)
  });
}

export function useRestoreTrashItemMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: Pick<TrashItem, "entity" | "id">) => restoreTrashItem(item.entity, item.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trash.all });
    }
  });
}

export function useDeleteTrashItemPermanentlyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: TrashItem) => deleteTrashItemPermanently(item.entity, item.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trash.all });
    }
  });
}

export function useBulkRestoreTrashItemsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TrashBulkActionRequest) => bulkRestoreTrashItems(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trash.all });
    }
  });
}

export function useBulkDeleteTrashItemsPermanentlyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TrashBulkActionRequest) => bulkDeleteTrashItemsPermanently(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trash.all });
    }
  });
}

export function useEmptyTrashMutation() {
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: emptyTrash,
    onError: (error: Error) => toast.error({ message: error.message, title: "Couldn't empty trash" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trash.all });
    }
  });
}

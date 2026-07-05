import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TrashBulkActionRequest, TrashEntity, TrashItem, TrashListRequest } from "@nexa-gen/types";
import { queryKeys } from "@/lib/queryKeys";
import {
  bulkDeleteTrashItemsPermanently,
  bulkRestoreTrashItems,
  deleteTrashItemPermanently,
  emptyTrash,
  listTrash,
  restoreTrashItem
} from "../api/trashApi";

export function useTrashQuery(params: TrashListRequest) {
  return useQuery({
    queryFn: () => listTrash(params),
    queryKey: queryKeys.trash.list(params)
  });
}

export function useRestoreTrashItemMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: TrashItem) => restoreTrashItem(item.entity, item.id),
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: emptyTrash,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trash.all });
    }
  });
}

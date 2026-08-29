import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateBatchRequest, UpdateBatchRequest } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import type { ListParams } from "@/lib/pagination";
import {
  archiveBatch,
  createBatch,
  deleteBatch,
  getAssignableBatchUsers,
  listBatches,
  restoreBatch,
  updateBatch
} from "../api/batchApi";

export function useBatchesQuery(params: ListParams = {}) {
  return useQuery({
    queryFn: () => listBatches(params),
    queryKey: queryKeys.batches.list(params),
    placeholderData: keepPreviousData
  });
}

export function useAssignableUsersQuery() {
  return useQuery({
    queryFn: getAssignableBatchUsers,
    queryKey: queryKeys.batches.assignableUsers
  });
}

export function useCreateBatchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateBatchRequest) => createBatch(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
    }
  });
}

export function useUpdateBatchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateBatchRequest }) =>
      updateBatch(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
    }
  });
}

export function useArchiveBatchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; isUndo?: boolean }) => archiveBatch(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
    }
  });
}

export function useRestoreBatchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; isUndo?: boolean }) => restoreBatch(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
    }
  });
}

export function useDeleteBatchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteBatch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
    }
  });
}

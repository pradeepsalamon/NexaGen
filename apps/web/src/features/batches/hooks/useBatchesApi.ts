import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Batch, CreateBatchRequest, UpdateBatchRequest } from "@nexa-chess/types";
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

/**
 * Every batch, for a picker: it reads every page (100 at a time) instead of
 * showing the first page as if it were all of them (FE review D3; CLAUDE.md
 * §3.5 "never a silent cap"). Same `{ batches }` shape as `useBatchesQuery`.
 */
export function useAllBatchesQuery(params: Omit<ListParams, "page" | "pageSize"> = {}) {
  return useQuery({
    queryFn: async () => {
      const batches: Batch[] = [];
      for (let page = 1; ; page += 1) {
        const res = await listBatches({ ...params, page, pageSize: ALL_BATCHES_PAGE_SIZE });
        batches.push(...res.batches);
        const totalPages = res.pagination?.totalPages ?? 1;
        if (page >= totalPages || res.batches.length === 0) break;
      }
      return { batches };
    },
    queryKey: queryKeys.batches.list({ ...params, all: true })
  });
}

const ALL_BATCHES_PAGE_SIZE = 100;

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

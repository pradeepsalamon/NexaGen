import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateLibraryActivityRequest, LibraryListQuery, UpdateLibraryActivityRequest } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { createActivity, getActivity, getLibrary, updateActivity } from "../api/activityApi";

/** The unified list: puzzles, MCQs and Playouts in one page. */
export function useLibrary(query: LibraryListQuery, enabled = true) {
  return useQuery({
    enabled,
    placeholderData: keepPreviousData,
    queryFn: () => getLibrary(query),
    queryKey: queryKeys.puzzles.library(query as Record<string, unknown>)
  });
}

export function useActivity(id: string | null) {
  return useQuery({
    enabled: !!id,
    queryFn: () => getActivity(id as string).then((r) => r.activity),
    queryKey: queryKeys.puzzles.activity(id ?? "")
  });
}

// undo: intentionally excluded — saving a form; the row has its own Delete, which Undo covers.
export function useCreateActivity() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: CreateLibraryActivityRequest) => createActivity(body),
    onError: (error: Error) => toast.error({ message: error.message, title: "Couldn't save" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.puzzles.all })
  });
}

// undo: intentionally excluded — same reasoning as useCreateActivity.
export function useUpdateActivity(id: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: UpdateLibraryActivityRequest) => updateActivity(id, body),
    onError: (error: Error) => toast.error({ message: error.message, title: "Couldn't save" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.puzzles.all })
  });
}

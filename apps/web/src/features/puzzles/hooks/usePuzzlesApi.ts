import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import type {
  CatalogAdoptRequest,
  CatalogListQuery,
  CreatePuzzleRequest,
  CreatePuzzleTopicRequest,
  ImportPuzzlesRequest,
  PuzzleListQuery,
  StudentPuzzleListQuery,
  UpdatePuzzleRequest,
  UpdatePuzzleScoringSettingsRequest,
  UpdatePuzzleTopicRequest
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import {
  adoptCatalogPuzzles,
  createPuzzle,
  getCatalogPreview,
  getCatalogPuzzles,
  materialiseCatalogPuzzle,
  createPuzzleTopic,
  getMyPuzzle,
  getMyPuzzles,
  getPuzzle,
  getPuzzleScoringSettings,
  getPuzzleStats,
  importPuzzles,
  getFolderHomework,
  getFolderPuzzles,
  getPuzzleTopics,
  getPuzzles,
  updatePuzzle,
  updatePuzzleScoringSettings,
  updatePuzzleTopic
} from "../api/puzzleApi";

export function usePuzzleTopics(enabled = true) {
  return useQuery({
    queryKey: queryKeys.puzzles.topics,
    queryFn: getPuzzleTopics,
    enabled
  });
}

/** A homework-approved folder's set, fetched when a coach opens "Assign folder". */
export function useFolderHomework(topicId: string | null) {
  return useQuery({
    queryKey: queryKeys.puzzles.folderHomework(topicId ?? ""),
    queryFn: () => getFolderHomework(topicId!),
    enabled: !!topicId,
    // Approval can be revoked at any moment; always ask again when the dialog opens.
    staleTime: 0
  });
}

export function usePuzzles(query: PuzzleListQuery) {
  return useQuery({
    queryKey: queryKeys.puzzles.list(query),
    queryFn: () => getPuzzles(query),
    placeholderData: keepPreviousData
  });
}

/** A folder's own puzzles (Topics tab). Under `puzzles.list`, so every puzzle mutation refreshes it. */
export function useFolderPuzzles(topicId: string | null) {
  return useQuery({
    queryKey: queryKeys.puzzles.list({ folder: topicId }),
    queryFn: () => getFolderPuzzles(topicId!),
    enabled: !!topicId
  });
}

export function usePuzzle(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.puzzles.detail(id),
    queryFn: () => getPuzzle(id),
    enabled: !!id && enabled
  });
}

export function usePuzzleStats(enabled = true) {
  return useQuery({
    queryKey: queryKeys.puzzles.stats,
    queryFn: getPuzzleStats,
    enabled
  });
}

export function useCreatePuzzle() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: CreatePuzzleRequest) => createPuzzle(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.puzzles.all });
    },
    onError: (error: Error) =>
      toast.error({ title: "Could not save puzzle", message: error.message })
  });
}

export function useImportPuzzles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ImportPuzzlesRequest) => importPuzzles(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.puzzles.all });
    }
  });
}

export function useUpdatePuzzle() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePuzzleRequest }) =>
      updatePuzzle(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.puzzles.all });
    },
    onError: (error: Error) =>
      toast.error({ title: "Could not save puzzle", message: error.message })
  });
}

export function useCreatePuzzleTopic() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: CreatePuzzleTopicRequest) => createPuzzleTopic(data),
    onSuccess: () => {
      toast.success({ title: "Topic created" });
      queryClient.invalidateQueries({ queryKey: queryKeys.puzzles.topics });
    },
    onError: (error: Error) =>
      toast.error({ title: "Could not create topic", message: error.message })
  });
}

export function useUpdatePuzzleTopic() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePuzzleTopicRequest }) =>
      updatePuzzleTopic(id, data),
    onSuccess: () => {
      toast.success({ title: "Topic updated" });
      queryClient.invalidateQueries({ queryKey: queryKeys.puzzles.topics });
    },
    onError: (error: Error) =>
      toast.error({ title: "Could not update topic", message: error.message })
  });
}

export function useMyPuzzles(query: StudentPuzzleListQuery) {
  return useQuery({
    queryKey: queryKeys.puzzles.mine(query),
    queryFn: () => getMyPuzzles(query),
    placeholderData: keepPreviousData
  });
}

export function useMyPuzzle(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.puzzles.mineDetail(id),
    queryFn: () => getMyPuzzle(id),
    enabled: !!id && enabled
  });
}

/** Platform default points + leaderboard rules (staff read, admin write). */
export function usePuzzleScoringSettings(enabled = true) {
  return useQuery({
    queryKey: queryKeys.puzzles.scoringSettings,
    queryFn: getPuzzleScoringSettings,
    enabled,
    staleTime: 60_000
  });
}

// undo: intentionally excluded — singleton settings-form Save (lib/undo/README.md).
export function useUpdatePuzzleScoringSettings() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: UpdatePuzzleScoringSettingsRequest) => updatePuzzleScoringSettings(data),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.puzzles.scoringSettings, data);
      toast.success({ title: "Puzzle scoring defaults saved" });
    },
    onError: (error: Error) =>
      toast.error({ title: "Could not save scoring defaults", message: error.message })
  });
}

// ── Lichess catalogue ──

/** Keyset pages ("Load more"); the API never sends a total. */
export function useCatalogPuzzles(query: Omit<CatalogListQuery, "cursor">, enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.puzzles.catalog(query),
    queryFn: ({ pageParam }) => getCatalogPuzzles({ ...query, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : null),
    enabled
  });
}

export function useCatalogPreview(sourceId: string | null) {
  return useQuery({
    queryKey: queryKeys.puzzles.catalogPreview(sourceId ?? ""),
    queryFn: () => getCatalogPreview(sourceId as string),
    enabled: !!sourceId
  });
}

export function useMaterialiseCatalogPuzzle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) => materialiseCatalogPuzzle(sourceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.puzzles.all })
  });
}

export function useAdoptCatalogPuzzles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CatalogAdoptRequest) => adoptCatalogPuzzles(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.puzzles.all })
  });
}

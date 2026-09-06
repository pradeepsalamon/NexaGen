import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreatePuzzleRequest,
  CreatePuzzleTopicRequest,
  PuzzleListQuery,
  StudentPuzzleListQuery,
  UpdatePuzzleRequest,
  UpdatePuzzleTopicRequest
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import {
  createPuzzle,
  createPuzzleTopic,
  getMyPuzzle,
  getMyPuzzles,
  getPuzzle,
  getPuzzleStats,
  getPuzzleTopics,
  getPuzzles,
  updatePuzzle,
  updatePuzzleTopic
} from "../api/puzzleApi";

export function usePuzzleTopics(enabled = true) {
  return useQuery({
    queryKey: queryKeys.puzzles.topics,
    queryFn: getPuzzleTopics,
    enabled
  });
}

export function usePuzzles(query: PuzzleListQuery) {
  return useQuery({
    queryKey: queryKeys.puzzles.list(query),
    queryFn: () => getPuzzles(query),
    placeholderData: keepPreviousData
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

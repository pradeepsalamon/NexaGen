import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ImportGameRequest, SaveGameAnalysisRequest } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import {
  deleteGame,
  getGame,
  getGameFilterOptions,
  importGame,
  listGames,
  saveGameAnalysis,
  type GameLibraryFilters,
} from "../api/gameLibraryApi";

export function useGameLibrary(filters: GameLibraryFilters) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => listGames(filters),
    queryKey: queryKeys.games.list(filters),
  });
}

export function useGameFilterOptions() {
  return useQuery({ queryFn: getGameFilterOptions, queryKey: queryKeys.games.filterOptions, staleTime: 60_000 });
}

export function useGame(id: string) {
  return useQuery({ queryFn: () => getGame(id), queryKey: queryKeys.games.detail(id) });
}

export function useImportGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ImportGameRequest) => importGame(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.games.all }),
  });
}

export function useSaveGameAnalysis(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveGameAnalysisRequest) => saveGameAnalysis(id, body),
    onSuccess: (detail) => {
      qc.setQueryData(queryKeys.games.detail(id), detail);
      void qc.invalidateQueries({ queryKey: queryKeys.games.lists });
    },
  });
}

export function useDeleteGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteGame(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.games.all }),
  });
}

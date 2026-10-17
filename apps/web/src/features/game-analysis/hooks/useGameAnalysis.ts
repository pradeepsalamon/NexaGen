import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isActiveAnalysis, type GameAnalysisDepth, type ImportPgnRequest, type LinkExternalAccountRequest } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import {
  addTacticToRevision,
  cancelAnalysis,
  getAnalysisState,
  getInsights,
  listAnalysedGames,
  requestAnalysis,
  type AnalysedGameFilters,
} from "../api/gameAnalysisApi";
import { getGameSources, importPgn, linkAccount, syncAccount, unlinkAccount, verifyAccount } from "../api/gameSourcesApi";

/** Polls every 3s while the analysis is queued or running, and stops once it isn't. */
export function useGameAnalysisState(gameId: string) {
  return useQuery({
    queryFn: () => getAnalysisState(gameId),
    queryKey: queryKeys.gameAnalysis.forGame(gameId),
    refetchInterval: (query) => {
      const status = query.state.data?.analysis?.status;
      return status && isActiveAnalysis(status) ? 3_000 : false;
    },
  });
}

export function useRequestAnalysis(gameId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (depth: GameAnalysisDepth) => requestAnalysis(gameId, depth),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.gameAnalysis.forGame(gameId) }),
  });
}

export function useCancelAnalysis(gameId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => cancelAnalysis(gameId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.gameAnalysis.forGame(gameId) }),
  });
}

export function useAddTacticToRevision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ analysisId, ply }: { analysisId: string; ply: number }) => addTacticToRevision(analysisId, ply),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.revision.all }),
  });
}

export function useGameInsights(studentId: string | null) {
  return useQuery({ queryFn: () => getInsights(studentId), queryKey: queryKeys.gameAnalysis.insights(studentId) });
}

export function useAnalysedGames(studentId: string | null, filters: AnalysedGameFilters) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => listAnalysedGames(studentId, filters),
    queryKey: queryKeys.gameAnalysis.games(studentId, filters),
  });
}

export function useGameSources(enabled = true) {
  return useQuery({ enabled, queryFn: getGameSources, queryKey: queryKeys.gameSources.overview, staleTime: 30_000 });
}

export function useImportPgn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ImportPgnRequest) => importPgn(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.games.all });
      void qc.invalidateQueries({ queryKey: queryKeys.gameAnalysis.all });
    },
  });
}

function useAccountMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.gameSources.overview });
      void qc.invalidateQueries({ queryKey: queryKeys.games.all });
    },
  });
}

export const useLinkAccount = () => useAccountMutation((body: LinkExternalAccountRequest) => linkAccount(body));
export const useVerifyAccount = () => useAccountMutation((id: string) => verifyAccount(id));
export const useSyncAccount = () =>
  useAccountMutation(({ id, analyse }: { id: string; analyse: boolean }) => syncAccount(id, analyse));
export const useUnlinkAccount = () =>
  useAccountMutation(({ id, deleteGames }: { id: string; deleteGames: boolean }) => unlinkAccount(id, deleteGames));

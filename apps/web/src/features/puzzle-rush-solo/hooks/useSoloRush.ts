import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PuzzleRushMode, SoloRushPeriod } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { getSoloRushLeaderboard, getSoloRushOverview, startSoloRush } from "../api/soloRushApi";

export function useSoloRushOverview() {
  return useQuery({ queryFn: getSoloRushOverview, queryKey: queryKeys.soloRush.overview });
}

export function useSoloRushLeaderboard(batchId: string | null, mode: PuzzleRushMode, period: SoloRushPeriod) {
  return useQuery({
    enabled: !!batchId,
    queryFn: () => getSoloRushLeaderboard({ batchId: batchId ?? "", mode, period }),
    queryKey: queryKeys.soloRush.leaderboard(batchId ?? "", mode, period)
  });
}

// undo: intentionally excluded — starting a run is not a reversible edit, it opens a timed game.
export function useStartSoloRush() {
  const toast = useToast();
  return useMutation({
    mutationFn: (mode: PuzzleRushMode) => startSoloRush(mode),
    onError: (error: Error) => toast.error({ message: error.message, title: "Couldn't start" })
  });
}

/** After a run: the best scores and the leaderboards may have moved. */
export function useRefreshSoloRush() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: queryKeys.soloRush.all });
}

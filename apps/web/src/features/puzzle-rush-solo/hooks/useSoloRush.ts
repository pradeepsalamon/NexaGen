import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getErrorMessage } from "@/lib/errors";
import type { PuzzleRushMode, SoloRushPeriod } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import {
  getSoloRushBattles,
  getSoloRushLeaderboard,
  getSoloRushOverview,
  startSoloRush
} from "../api/soloRushApi";

export function useSoloRushOverview() {
  return useQuery({ queryFn: getSoloRushOverview, queryKey: queryKeys.soloRush.overview });
}

/** How often an on-screen leaderboard refreshes itself (polled like chat; no websocket). */
const LEADERBOARD_POLL_MS = 45_000;

export function useSoloRushLeaderboard(batchId: string | null, mode: PuzzleRushMode, period: SoloRushPeriod) {
  return useQuery({
    enabled: !!batchId,
    // Only while it is mounted and the tab is visible; a finished run invalidates it at once.
    refetchInterval: LEADERBOARD_POLL_MS,
    refetchIntervalInBackground: false,
    queryFn: () => getSoloRushLeaderboard({ batchId: batchId ?? "", mode, period }),
    queryKey: queryKeys.soloRush.leaderboard(batchId ?? "", mode, period)
  });
}

export function useSoloRushBattles(mode: PuzzleRushMode, period: SoloRushPeriod) {
  return useQuery({
    refetchInterval: LEADERBOARD_POLL_MS,
    refetchIntervalInBackground: false,
    queryFn: () => getSoloRushBattles({ mode, period }),
    queryKey: queryKeys.soloRush.battles(mode, period)
  });
}

// undo: intentionally excluded — starting a run is not a reversible edit, it opens a timed game.
export function useStartSoloRush() {
  const toast = useToast();
  return useMutation({
    mutationFn: (mode: PuzzleRushMode) => startSoloRush(mode),
    onError: (error: Error) => toast.error({ message: getErrorMessage(error), title: "Couldn't start" })
  });
}

/** After a run: the best scores and the leaderboards may have moved. */
export function useRefreshSoloRush() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: queryKeys.soloRush.all });
}

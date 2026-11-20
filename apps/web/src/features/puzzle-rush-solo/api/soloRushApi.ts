import {
  API_ROUTES,
  type PuzzleRushMode,
  type ReportSoloRushProgressRequest,
  type ReportSoloRushProgressResponse,
  type SoloRushLeaderboard,
  type SoloRushOverview,
  type SoloRushPeriod,
  type SoloRushRun
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export const getSoloRushOverview = (): Promise<SoloRushOverview> =>
  apiFetch<SoloRushOverview>(API_ROUTES.puzzleRushSolo.overview);

export const startSoloRush = (mode: PuzzleRushMode): Promise<SoloRushRun> =>
  apiFetch<SoloRushRun>(API_ROUTES.puzzleRushSolo.runs, { method: "POST", body: { mode } });

export const reportSoloRushProgress = (
  runId: string,
  body: ReportSoloRushProgressRequest
): Promise<ReportSoloRushProgressResponse> =>
  apiFetch<ReportSoloRushProgressResponse>(API_ROUTES.puzzleRushSolo.progress(runId), { method: "PUT", body });

export const getSoloRushLeaderboard = (params: {
  batchId: string;
  mode: PuzzleRushMode;
  period: SoloRushPeriod;
}): Promise<SoloRushLeaderboard> => {
  const sp = new URLSearchParams(params);
  return apiFetch<SoloRushLeaderboard>(`${API_ROUTES.puzzleRushSolo.leaderboard}?${sp.toString()}`);
};

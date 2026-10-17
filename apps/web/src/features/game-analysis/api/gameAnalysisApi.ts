import { API_ROUTES } from "@nexa-chess/types";
import type {
  AnalysedGameListResponse,
  GameAnalysisDepth,
  GameAnalysisStateResponse,
  GameAnalysisSummary,
  StudentGameInsights,
  TacticRevisionResponse,
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export type AnalysedGameFilters = { page?: number; pageSize?: number; result?: string; side?: string };

export function getAnalysisState(gameId: string) {
  return apiFetch<GameAnalysisStateResponse>(API_ROUTES.gameAnalysis.forGame(gameId));
}

export function requestAnalysis(gameId: string, depth: GameAnalysisDepth) {
  return apiFetch<GameAnalysisSummary>(API_ROUTES.gameAnalysis.forGame(gameId), { body: { depth }, method: "POST" });
}

export function cancelAnalysis(gameId: string) {
  return apiFetch<GameAnalysisSummary>(API_ROUTES.gameAnalysis.forGame(gameId), { method: "DELETE" });
}

export function addTacticToRevision(analysisId: string, ply: number) {
  return apiFetch<TacticRevisionResponse>(API_ROUTES.gameAnalysis.tacticToRevision(analysisId, String(ply)), { method: "POST" });
}

export function getInsights(studentId: string | null) {
  return apiFetch<StudentGameInsights>(studentId ? API_ROUTES.gameInsights.student(studentId) : API_ROUTES.gameInsights.mine);
}

export function listAnalysedGames(studentId: string | null, filters: AnalysedGameFilters) {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== ""));
  return apiFetch<AnalysedGameListResponse>(
    studentId ? API_ROUTES.gameInsights.games(studentId) : API_ROUTES.gameInsights.gamesMine,
    { params },
  );
}

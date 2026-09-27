import { API_ROUTES } from "@nexa-chess/types";
import type { StockfishAnalysisResult } from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export type { StockfishAnalysisResult };

export async function analyzePosition(
  fen: string,
  signal?: AbortSignal,
  mode: "analysis" | "move" = "analysis"
): Promise<StockfishAnalysisResult> {
  return apiFetch<StockfishAnalysisResult>(API_ROUTES.stockfish.analyze, {
    method: "POST",
    body: { fen, mode },
    signal
  });
}

import { apiFetch } from "@/lib/api";

export interface StockfishAnalysisResult {
  evaluation: number | null;
  mate: number | null;
  bestMove: string;
  depth: number;
  pv: string[];
}

export async function analyzePosition(fen: string, signal?: AbortSignal): Promise<StockfishAnalysisResult> {
  return apiFetch<StockfishAnalysisResult>(
    '/stockfish/analyze',
    {
      method: 'POST',
      body: { fen },
      signal
    }
  );
}

import { API_ROUTES } from "@nexa-chess/types";
import type { StockfishAnalysisResult, StockfishStreamEvent } from "@nexa-chess/types";
import { API_BASE_URL, apiFetch } from "@/lib/api";

export type { StockfishAnalysisResult };

export async function analyzePosition(
  fen: string,
  signal?: AbortSignal,
  mode: "analysis" | "move" = "analysis",
  silent = false
): Promise<StockfishAnalysisResult> {
  return apiFetch<StockfishAnalysisResult>(API_ROUTES.stockfish.analyze, {
    method: "POST",
    body: { fen, mode },
    signal,
    silent
  });
}

/**
 * Streamed analysis: `onUpdate` fires as the engine deepens (first one within
 * milliseconds), and the promise resolves with the final result.
 *
 * Anything other than a clean 200 stream (an expired session, an older API, a
 * browser without readable streams) falls back to the one-shot request, which
 * owns the 401 → refresh → retry logic; the next stream then has a fresh cookie.
 */
export async function analyzePositionStream(
  fen: string,
  options: { signal?: AbortSignal; onUpdate: (partial: StockfishAnalysisResult) => void }
): Promise<StockfishAnalysisResult> {
  const { signal, onUpdate } = options;
  // The panel shows its own error, so a dropped fallback stays out of the global toast.
  const fallback = () => analyzePosition(fen, signal, "analysis", true);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${API_ROUTES.stockfish.analyzeStream}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ fen, mode: "analysis" }),
      signal
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    return fallback();
  }
  if (!response.ok || !response.body) return fallback();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        const event = JSON.parse(data) as StockfishStreamEvent;
        if (event.type === "info") onUpdate(event.result);
        else if (event.type === "done") return event.result;
        else throw new Error(event.message);
      }
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
  throw new Error("The engine stream ended before a result.");
}

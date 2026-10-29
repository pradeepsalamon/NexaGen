import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { evaluationFromEngineResult, formatEvaluation, type Evaluation } from "@nexa-chess/types";
import { analyzePositionStream, type StockfishAnalysisResult } from "../api/stockfishApi";

const ANALYSIS_DEBOUNCE_MS = 150;
const ANALYSIS_RETRY_MS = 3000;
const EVAL_CACHE_LIMIT = 600;

/** White-relative evaluation of `fen` from a raw (side-to-move) engine result. */
export function whiteEvaluation(fen: string, result: Pick<StockfishAnalysisResult, "evaluation" | "mate">): Evaluation | null {
  return evaluationFromEngineResult(result, fen.split(" ")[1] === "b" ? "black" : "white");
}

/**
 * The last finished evaluation of every position analysed in this tab, keyed
 * by FEN, formatted White-relative ("+0.35", "#-2"). A position's score
 * doesn't depend on how the board got there, so one cache serves every board;
 * the move list reads it to show an eval beside each move it has seen.
 */
export const useEngineEvalCache = create<{ evals: Record<string, string>; record: (fen: string, text: string) => void }>(
  (set) => ({
    evals: {},
    record: (fen, text) =>
      set((s) => {
        if (s.evals[fen] === text) return s;
        const next = { ...s.evals, [fen]: text };
        const keys = Object.keys(next);
        if (keys.length > EVAL_CACHE_LIMIT) delete next[keys[0]];
        return { evals: next };
      })
  })
);

/**
 * Streams Stockfish analysis of `fen` (debounced, superseded searches
 * aborted, retried after an error). `analysis.fen` is the position the result
 * describes, so a score is never shown against the wrong side to move.
 */
export function useEngineAnalysis(fen: string | null, enabled: boolean) {
  const [analysis, setAnalysis] = useState<(StockfishAnalysisResult & { fen: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const record = useEngineEvalCache((s) => s.record);

  useEffect(() => {
    if (!fen || !enabled) return;
    let retryId: ReturnType<typeof setTimeout> | undefined;

    const performAnalysis = async () => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsAnalyzing(true);
      setError(null);

      try {
        const result = await analyzePositionStream(fen, {
          signal: controller.signal,
          // Paint each deeper line as it arrives; a superseded stream stays silent.
          onUpdate: (partial) => {
            if (!controller.signal.aborted) setAnalysis({ ...partial, fen });
          }
        });
        if (!controller.signal.aborted) {
          setAnalysis({ ...result, fen });
          const evaluation = whiteEvaluation(fen, result);
          if (evaluation) record(fen, formatEvaluation(evaluation));
        }
        setError(null);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error && err.message ? err.message : "Failed to fetch analysis");
          retryId = setTimeout(() => setRetryTick((tick) => tick + 1), ANALYSIS_RETRY_MS);
        }
      } finally {
        if (!controller.signal.aborted) setIsAnalyzing(false);
      }
    };

    // Debounce so rapid position changes (dragging, syncing) don't spam the engine pool.
    const debounceId = setTimeout(() => void performAnalysis(), ANALYSIS_DEBOUNCE_MS);

    return () => {
      clearTimeout(debounceId);
      clearTimeout(retryId);
      abortControllerRef.current?.abort();
    };
  }, [fen, enabled, retryTick, record]);

  return { analysis, error, isAnalyzing };
}

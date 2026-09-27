import { useEffect, useState, useRef } from 'react';
import { useBoardStore as usePersistedStore } from "../../context/BoardProvider";
import { analyzePosition, StockfishAnalysisResult } from '../../api/stockfishApi';
import { Loader2, Pause, Play } from 'lucide-react';
import { SimpleTooltip } from "@/components/ui/Tooltip";

const ANALYSIS_DEBOUNCE_MS = 150;

export function StockfishPanel() {
  const fen = usePersistedStore(state => state.fen);
  const [analysis, setAnalysis] = useState<StockfishAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!fen || !isEnabled) return;

    const performAnalysis = async () => {
      // Cancel previous analysis request if exists
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      setIsAnalyzing(true);
      setError(null);

      try {
        const result = await analyzePosition(fen, abortControllerRef.current.signal);
        setAnalysis(result);
        setError(null);
      } catch (err: any) {
        const aborted =
          err?.name === 'AbortError' ||
          err?.name === 'CanceledError' ||
          err?.code === 'ERR_CANCELED' ||
          err?.message === 'canceled';
        if (!aborted) {
          setError(err?.message || 'Failed to fetch analysis');
        }
      } finally {
        setIsAnalyzing(false);
      }
    };

    // Debounce so rapid position changes (dragging, syncing) don't spam the engine pool
    const debounceId = setTimeout(() => {
      performAnalysis();
    }, ANALYSIS_DEBOUNCE_MS);

    return () => {
      clearTimeout(debounceId);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fen, isEnabled]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-sm text-red-500 p-4 text-center">
        <span className="font-semibold mb-2">Analysis Error</span>
        <p>{error}</p>
      </div>
    );
  }

  if (!isEnabled) {
    return (
      <div className="flex flex-col h-full text-sm p-4 text-app-text">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
          <span className="text-xs text-app-muted font-semibold uppercase tracking-wider">Engine Analysis</span>
          <SimpleTooltip label="Resume analysis">
            <button
              type="button"
              onClick={() => setIsEnabled(true)}
              aria-label="Resume analysis"
              className="w-8 h-8 rounded-full border border-app-border bg-app-surface hover:bg-app-soft flex items-center justify-center shadow-card transition-colors"
            >
              <Play className="size-3.5" />
            </button>
          </SimpleTooltip>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 text-app-muted p-4 text-center">
          <p>Engine analysis is paused.</p>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-sm text-app-muted p-4 text-center">
        <Loader2 className="animate-spin mb-4" size={24} />
        <p>Waiting for analysis...</p>
      </div>
    );
  }

  const scoreText = analysis.mate !== null 
    ? `M${Math.abs(analysis.mate)}`
    : (analysis.evaluation !== null ? (analysis.evaluation > 0 ? `+${analysis.evaluation.toFixed(2)}` : analysis.evaluation.toFixed(2)) : '0.00');

  return (
    <div className="flex flex-col h-full text-sm p-4 text-app-text">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
        <div className="flex flex-col">
          <span className="text-xs text-app-muted font-semibold uppercase tracking-wider">Evaluation</span>
          <span className={`text-2xl font-bold ${analysis.mate !== null ? 'text-primary-ink' : 'text-app-text'}`}>
            {scoreText}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isAnalyzing && <Loader2 className="animate-spin text-primary-ink" size={20} />}
          <SimpleTooltip label="Pause analysis">
            <button
              type="button"
              onClick={() => setIsEnabled(false)}
              aria-label="Pause analysis"
              className="w-8 h-8 rounded-full border border-app-border bg-app-surface hover:bg-app-soft flex items-center justify-center shadow-card transition-colors"
            >
              <Pause className="size-3.5" />
            </button>
          </SimpleTooltip>
        </div>
      </div>

      {analysis.bestMove && (
        <div className="mb-4">
          <span className="text-xs text-app-muted font-semibold uppercase tracking-wider">Best Move</span>
          <div className="mt-1 font-mono text-lg font-medium">{analysis.bestMove}</div>
        </div>
      )}

      {analysis.pv && analysis.pv.length > 0 && (
        <div>
          <span className="text-xs text-app-muted font-semibold uppercase tracking-wider">Principal Variation (Depth {analysis.depth})</span>
          <div className="mt-2 text-xs text-app-muted leading-relaxed font-mono">
            {analysis.pv.join(' ')}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useBoardStore as usePersistedStore } from "../../context/BoardProvider";
import { useEngineAnalysis } from "../../hooks/useEngineAnalysis";
import type { StockfishAnalysisResult } from '../../api/stockfishApi';
import { Loader2, Pause, Play } from 'lucide-react';
import { SimpleTooltip } from "@/components/ui/Tooltip";

/** The engine scores for the side to move; the panel shows White's view. */
function whitePerspective(fen: string, result: StockfishAnalysisResult) {
  const blackToMove = fen.split(' ')[1] === 'b';
  const flip = (n: number | null) => (n === null || !blackToMove ? n : -n);
  return { evaluation: flip(result.evaluation), mate: flip(result.mate) };
}

export function StockfishPanel() {
  const fen = usePersistedStore(state => state.fen);
  // Stockfish refuses a position with missing / extra kings: don't ask it.
  const positionIssues = usePersistedStore(state => state.positionIssues);
  const setupOnly = positionIssues.length > 0;
  const [isEnabled, setIsEnabled] = useState(true);
  const { analysis, error, isAnalyzing } = useEngineAnalysis(fen, isEnabled && !setupOnly);

  if (setupOnly) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-sm text-app-muted p-4 text-center">
        <span className="font-semibold mb-2 text-app-text">No engine for a set-up position</span>
        <p>Stockfish needs a legal position. This one has {positionIssues.join(", ")}.</p>
      </div>
    );
  }

  if (!isEnabled) {
    return (
      <div className="flex flex-col h-full text-sm p-4 text-app-text">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-app-border">
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

  if (error) {
    return (
      <div className="flex flex-col h-full text-sm p-4">
        <div className="flex justify-end">
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
        <div className="flex flex-1 flex-col items-center justify-center text-center text-app-danger-ink">
          <span className="font-semibold mb-2">Analysis Error</span>
          <p>{error}</p>
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

  const score = whitePerspective(analysis.fen, analysis);
  const scoreText = score.mate !== null
    ? `${score.mate < 0 ? '-' : ''}M${Math.abs(score.mate)}`
    : (score.evaluation !== null ? (score.evaluation > 0 ? `+${score.evaluation.toFixed(2)}` : score.evaluation.toFixed(2)) : '0.00');

  return (
    <div className="flex flex-col h-full text-sm p-4 text-app-text">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-app-border">
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

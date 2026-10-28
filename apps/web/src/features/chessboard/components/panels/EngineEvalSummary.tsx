"use client";

import { useState } from "react";
import { Cpu, Loader2, Pause, Play } from "lucide-react";
import { formatEvaluation } from "@nexa-chess/types";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { useBoardStore } from "../../context/BoardProvider";
import { useEngineAnalysis, whiteEvaluation } from "../../hooks/useEngineAnalysis";

/**
 * Compact Stockfish read-out for the board on screen: White-relative score
 * (positive = White better; a mate shows as "#3" / "#-2", never as a number),
 * the engine's best move, its name and search depth. Real engine output only —
 * while a new position is being searched the previous one is dimmed, and a
 * set-up or unreachable engine says so instead of showing a number.
 */
export function EngineEvalSummary({ className }: { className?: string }) {
  const fen = useBoardStore((s) => s.fen);
  // Stockfish refuses a position with missing / extra kings: don't ask it.
  const positionIssues = useBoardStore((s) => s.positionIssues);
  const setupOnly = positionIssues.length > 0;
  const [paused, setPaused] = useState(false);
  const { analysis, error, isAnalyzing } = useEngineAnalysis(fen, !paused && !setupOnly);

  const current = analysis && analysis.fen === fen ? analysis : null;
  const shown = current ?? analysis;
  const evaluation = shown ? whiteEvaluation(shown.fen, shown) : null;
  const stale = !current || isAnalyzing;

  let body;
  if (setupOnly) {
    body = <p className="text-xs text-app-muted">No engine for a set-up position ({positionIssues.join(", ")}).</p>;
  } else if (paused) {
    body = <p className="text-xs text-app-muted">Engine analysis is paused.</p>;
  } else if (error && !current) {
    body = <p className="text-xs text-app-danger-ink">Engine unavailable: {error} Retrying…</p>;
  } else if (!shown) {
    body = (
      <p className="flex items-center gap-1.5 text-xs text-app-muted">
        <Loader2 className="size-3.5 animate-spin" /> Analysing…
      </p>
    );
  } else {
    const mate = evaluation?.kind === "mate" ? evaluation : null;
    body = (
      <div className={cn("flex items-center gap-3 transition-opacity", stale && "opacity-60")}>
        <span
          className={cn(
            "min-w-16 rounded-control px-2 py-1 text-center font-mono text-lg font-bold tabular-nums",
            !evaluation
              ? "bg-app-soft text-app-muted"
              : (mate ? mate.winner === "white" : evaluation.kind === "cp" && evaluation.cp >= 0)
                ? "bg-app-surface text-app-text ring-1 ring-app-border"
                : "bg-app-text text-app-surface"
          )}
          aria-label={
            !evaluation
              ? "No evaluation"
              : mate
                ? `Mate in ${mate.moves} for ${mate.winner === "white" ? "White" : "Black"}`
                : `Evaluation ${formatEvaluation(evaluation)} pawns`
          }
        >
          {evaluation ? formatEvaluation(evaluation) : "–"}
        </span>
        <div className="min-w-0 text-xs">
          <p className="text-app-muted">
            {mate
              ? `Mate in ${mate.moves} for ${mate.winner === "white" ? "White" : "Black"}`
              : "Pawns · + favours White, − Black"}
          </p>
          <p className="truncate font-semibold text-app-text">
            {shown.bestMove ? (
              <>
                Best move: <span className="font-mono">{shown.bestMove}</span>
              </>
            ) : (
              "No legal moves"
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className={cn("rounded-control border border-app-border bg-app-surface p-2.5", className)} aria-label="Engine evaluation">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-app-muted">
        <Cpu className="size-3.5" strokeWidth={2.5} />
        <span className="min-w-0 flex-1 truncate">
          {shown?.engine ?? "Stockfish"}
          {shown && shown.depth > 0 ? ` · depth ${shown.depth}` : ""}
        </span>
        {isAnalyzing && !paused ? <Loader2 className="size-3.5 animate-spin text-primary-ink" aria-label="Analysing" /> : null}
        {!setupOnly ? (
          <SimpleTooltip label={paused ? "Resume analysis" : "Pause analysis"}>
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "Resume analysis" : "Pause analysis"}
              className="grid size-6 place-items-center rounded-full border border-app-border bg-app-surface text-app-text transition-colors hover:bg-app-soft"
            >
              {paused ? <Play className="size-3" /> : <Pause className="size-3" />}
            </button>
          </SimpleTooltip>
        ) : null}
      </div>
      {body}
    </section>
  );
}

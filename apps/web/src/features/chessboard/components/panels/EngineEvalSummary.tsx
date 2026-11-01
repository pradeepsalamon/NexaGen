"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { formatEvaluation, moveNumberAt, type Evaluation } from "@nexa-chess/types";
import { Switch } from "@/components/ui/Switch";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { useBoardStore } from "../../context/BoardProvider";
import { useEngineAnalysis, whiteEvaluation } from "../../hooks/useEngineAnalysis";

/**
 * Compact, Lichess-style Stockfish read-out for the board on screen: an on/off
 * switch, the White-relative score (positive = White better; a mate shows as
 * "#3" / "#-2", never as a number), the engine's own name and search depth,
 * then one row per principal variation. Real engine output only — while a new
 * position is being searched the previous one is dimmed, and a set-up or
 * unreachable engine says so instead of showing a number.
 */
export function EngineEvalSummary({ className }: { className?: string }) {
  const fen = useBoardStore((s) => s.fen);
  // Stockfish refuses a position with missing / extra kings: don't ask it.
  const positionIssues = useBoardStore((s) => s.positionIssues);
  const setupOnly = positionIssues.length > 0;
  const [paused, setPaused] = useState(false);
  const running = !paused && !setupOnly;
  const { analysis, error, isAnalyzing } = useEngineAnalysis(fen, running);

  const current = analysis && analysis.fen === fen ? analysis : null;
  const shown = running ? (current ?? analysis) : null;
  const evaluation = shown ? whiteEvaluation(shown.fen, shown) : null;
  const stale = !current || isAnalyzing;
  const failed = running && Boolean(error) && !current;

  let status: string;
  if (setupOnly) status = "Set-up position";
  else if (paused) status = "Paused";
  else if (failed) status = "Unavailable";
  else if (shown && shown.depth > 0) status = `Depth ${shown.depth}`;
  else status = "Analysing…";

  // The panel's analysis carries a single line today; every line it is given gets a row.
  const lines = shown ? [{ evaluation, fen: shown.fen, pv: shown.pv }] : [];

  return (
    <section className={cn("border-b border-app-border/60", className)} aria-label="Engine analysis">
      <div className="flex items-center gap-2.5 px-3 py-2">
        <SimpleTooltip label={paused ? "Resume analysis" : "Pause analysis"}>
          <Switch
            checked={running}
            disabled={setupOnly}
            onCheckedChange={(on) => setPaused(!on)}
            aria-label="Engine analysis"
            className="h-5 w-9 [&>span]:size-3.5 data-[state=checked]:[&>span]:translate-x-[18px]"
          />
        </SimpleTooltip>
        <span
          className={cn(
            "min-w-[3.25rem] font-mono text-xl font-bold tabular-nums leading-none text-app-text transition-opacity",
            stale && "opacity-60",
          )}
          aria-label={evaluationLabel(evaluation)}
        >
          {evaluation ? formatEvaluation(evaluation) : "–"}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-xs font-semibold text-app-text">{analysis?.engine ?? "Stockfish"}</p>
          <p className="truncate text-[11px] text-app-muted" aria-live="polite">
            {status}
          </p>
        </div>
        {running && isAnalyzing ? <Loader2 className="size-3.5 shrink-0 animate-spin text-primary-ink" aria-label="Analysing" /> : null}
      </div>

      {setupOnly ? (
        <Notice>No engine for a set-up position ({positionIssues.join(", ")}).</Notice>
      ) : failed ? (
        <Notice tone="danger">Engine unavailable: {error} Retrying…</Notice>
      ) : (
        lines.map((line, i) => (
          <PvLine key={i} fen={line.fen} evaluation={line.evaluation} pv={line.pv} stale={stale} />
        ))
      )}
    </section>
  );
}

function evaluationLabel(evaluation: Evaluation | null) {
  if (!evaluation) return "No evaluation";
  if (evaluation.kind === "mate") return `Mate in ${evaluation.moves} for ${evaluation.winner === "white" ? "White" : "Black"}`;
  return `Evaluation ${formatEvaluation(evaluation)} pawns`;
}

function Notice({ children, tone }: { children: React.ReactNode; tone?: "danger" }) {
  return (
    <p className={cn("border-t border-app-border/40 px-3 py-1.5 text-xs", tone === "danger" ? "text-app-danger-ink" : "text-app-muted")}>
      {children}
    </p>
  );
}

/** One principal variation: its score, then the line in SAN on one row — expandable when it doesn't fit. */
function PvLine({ fen, evaluation, pv, stale }: { fen: string; evaluation: Evaluation | null; pv: string[]; stale: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const movesRef = useRef<HTMLParagraphElement>(null);
  const text = pvText(fen, pv);

  useLayoutEffect(() => {
    const el = movesRef.current;
    if (!el || expanded) return;
    setOverflows(el.scrollWidth > el.clientWidth + 1);
  }, [text, expanded]);

  useEffect(() => {
    const el = movesRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!expanded) setOverflows(el.scrollWidth > el.clientWidth + 1);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded]);

  return (
    <div className={cn("flex items-start gap-2 border-t border-app-border/40 px-3 py-1 text-xs transition-opacity", stale && "opacity-60")}>
      <span className="w-12 shrink-0 font-mono font-bold tabular-nums leading-5 text-app-text">
        {evaluation ? formatEvaluation(evaluation) : "–"}
      </span>
      <p
        ref={movesRef}
        className={cn("min-w-0 flex-1 font-mono leading-5 text-app-text", expanded ? "break-words" : "truncate")}
      >
        {text || <span className="text-app-muted">No legal moves</span>}
      </p>
      {overflows || expanded ? (
        <SimpleTooltip label={expanded ? "Collapse line" : "Show full line"}>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? "Collapse line" : "Show full line"}
            aria-expanded={expanded}
            className="grid size-5 shrink-0 place-items-center rounded-full text-app-muted transition-colors hover:bg-app-soft hover:text-app-text"
          >
            <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} strokeWidth={2.5} />
          </button>
        </SimpleTooltip>
      ) : null}
    </div>
  );
}

/** "12. Nf3 Nc6 13. Bb5" — or "12... Nc6 13. Bb5" when Black is to move. */
function pvText(fen: string, pv: string[]) {
  return pv
    .map((san, ply) => {
      const { number, white } = moveNumberAt(fen, ply);
      if (white) return `${number}. ${san}`;
      return ply === 0 ? `${number}... ${san}` : san;
    })
    .join(" ");
}

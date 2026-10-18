"use client";

import { useState } from "react";
import {
  GAME_ANALYSIS_STATUS_LABELS,
  MOVE_CLASSIFICATION_LABELS,
  REPORT_LIMITATION_TEXT,
  TACTIC_MOTIF_LABELS,
  formatEvaluation,
  isActiveAnalysis,
  isFinishedAnalysis,
  type GameAnalysisDepth,
  type GameAnalysisReport,
  type GameReportMove,
  type TacticalOpportunity,
} from "@nexa-chess/types";
import { BrainCircuit, Cpu, Loader2, Target, X } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useAddTacticToRevision, useCancelAnalysis, useGameAnalysisState, useRequestAnalysis } from "../hooks/useGameAnalysis";
import { CLASSIFICATION_STYLE, KEY_MOMENT_CLASSES, OUTCOME_STYLE, moveNumberLabel } from "../lib/classificationStyle";

const DEPTH_OPTIONS = [
  { label: "Quick (a skim, ~30 s)", value: "QUICK" },
  { label: "Standard (~1–2 min)", value: "STANDARD" },
  { label: "Deep (several minutes)", value: "DEEP" },
];

type Viewer = { id: string; role: string };

type Props = {
  gameId: string;
  viewer: Viewer | null;
  /** Index of the mainline move the board is showing the result of; null off the mainline / at the start. */
  currentPly: number | null;
  /** Show the position after `plies` mainline half-moves. */
  onJump: (plies: number) => void;
};

/**
 * Stockfish analysis of a finished game: request it, follow its progress,
 * then read the report — accuracy, key moments, the selected move's
 * evaluation and line, and tactics found or missed. Nothing is analysed in
 * the browser; it is the stored server report.
 */
export function GameAnalysisPanel({ gameId, viewer, currentPly, onJump }: Props) {
  const state = useGameAnalysisState(gameId);
  const request = useRequestAnalysis(gameId);
  const cancel = useCancelAnalysis(gameId);
  const [depth, setDepth] = useState<GameAnalysisDepth>("STANDARD");

  if (state.isLoading) return <Skeleton className="h-40 w-full rounded-app" />;
  if (state.isError || !state.data) {
    return <WidgetError message="The engine analysis could not be loaded." onRetry={() => void state.refetch()} />;
  }
  const { analysis, report, canRequest, requestBlockedReason } = state.data;

  const ask = () =>
    request.mutate(depth, {
      onError: (err) => toast.error(err instanceof Error ? err.message : "The analysis could not be requested."),
      onSuccess: () => toast.success("Analysis requested — it runs in the background."),
    });

  const requestControls = canRequest ? (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
      <label className="sr-only" htmlFor={`depth-${gameId}`}>
        Analysis depth
      </label>
      <Select
        className="sm:w-60"
        id={`depth-${gameId}`}
        onChange={(e) => setDepth(e.target.value as GameAnalysisDepth)}
        options={DEPTH_OPTIONS}
        value={depth}
      />
      <Button disabled={request.isPending} onClick={ask}>
        {request.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : <Cpu className="mr-2 size-4" aria-hidden />}
        Analyse game
      </Button>
    </div>
  ) : null;

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <BrainCircuit className="size-4 text-primary-ink" aria-hidden strokeWidth={2.25} />
          Engine analysis
        </h2>
        {analysis && <Badge variant={isFinishedAnalysis(analysis.status) ? "success" : "secondary"}>{GAME_ANALYSIS_STATUS_LABELS[analysis.status]}</Badge>}
      </div>

      {!analysis && (
        <div className="space-y-3">
          <p className="text-sm text-app-muted">
            {canRequest
              ? "Stockfish reviews every move of this finished game: mistakes, missed tactics and the better line, move by move."
              : requestBlockedReason}
          </p>
          {requestControls}
        </div>
      )}

      {analysis && isActiveAnalysis(analysis.status) && (
        <div className="space-y-2" aria-live="polite">
          <p className="text-sm text-app-muted">
            {analysis.status === "QUEUED"
              ? "Waiting for a free engine…"
              : `Analysing position ${Math.min(analysis.progress.done + 1, analysis.progress.total)} of ${analysis.progress.total || "…"}`}
          </p>
          <div
            aria-label="Analysis progress"
            aria-valuemax={analysis.progress.total || 1}
            aria-valuemin={0}
            aria-valuenow={analysis.progress.done}
            className="h-2 overflow-hidden rounded-full bg-app-soft"
            role="progressbar"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${analysis.progress.total ? Math.round((analysis.progress.done / analysis.progress.total) * 100) : 4}%` }}
            />
          </div>
          <div className="flex justify-end">
            <Button
              disabled={cancel.isPending}
              onClick={() =>
                cancel.mutate(undefined, {
                  onError: (err) => toast.error(err instanceof Error ? err.message : "Could not cancel."),
                })
              }
              variant="outline"
            >
              <X className="mr-2 size-4" aria-hidden />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {analysis && (analysis.status === "FAILED" || analysis.status === "CANCELLED") && (
        <div className="space-y-3">
          <Alert variant={analysis.status === "FAILED" ? "error" : "info"}>
            {analysis.status === "FAILED" ? analysis.error ?? "The analysis failed." : "The analysis was cancelled."}
          </Alert>
          {requestControls}
        </div>
      )}

      {analysis?.stale && (
        <div className="space-y-3">
          <Alert variant="info">The moves of this game changed after it was analysed. Analyse it again for the current moves.</Alert>
          {requestControls}
        </div>
      )}

      {report && <ReportBody currentPly={currentPly} onJump={onJump} report={report} viewer={viewer} />}
    </Card>
  );
}

function ReportBody({
  report,
  viewer,
  currentPly,
  onJump,
}: {
  report: GameAnalysisReport;
  viewer: Viewer | null;
  currentPly: number | null;
  onJump: (plies: number) => void;
}) {
  const keyMoments = report.moves.filter((m) => KEY_MOMENT_CLASSES.has(m.classification));
  const selected = currentPly !== null ? report.moves[currentPly] ?? null : null;
  const notes = report.limitations.filter((l) => l !== REPORT_LIMITATION_TEXT.NO_HISTORY);

  return (
    <div className="space-y-4">
      {report.limited && (
        <Alert variant="warning">
          This analysis is incomplete. {notes.join(" ")}
        </Alert>
      )}
      {!report.limited && notes.length > 0 && <p className="text-xs text-app-muted">{notes.join(" ")}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(["white", "black"] as const).map((side) => {
          const s = report.sides[side];
          const errors = s.counts.MISTAKE + s.counts.MISSED_WIN + s.counts.MISSED_DRAW;
          const blunders = s.counts.BLUNDER + s.counts.MISSED_MATE + s.counts.MATE_ALLOWED;
          return (
            <div className="rounded-control border border-app-border bg-app-soft p-3" key={side}>
              <p className="truncate text-xs font-semibold text-app-muted">
                {side === "white" ? "White" : "Black"} · {s.name}
              </p>
              <p className="mt-1 text-2xl font-extrabold">
                {s.accuracy.accuracy !== null ? `${s.accuracy.accuracy}%` : "—"}
                <span className="ml-1 text-xs font-medium text-app-muted">accuracy</span>
              </p>
              {s.accuracy.accuracy === null && (
                <p className="text-xs text-app-muted">
                  {s.accuracy.insufficientReason === "LOW_COVERAGE" ? "Too few moves could be judged." : "Too few moves to score."}
                </p>
              )}
              <p className="mt-1 text-xs text-app-muted">
                {s.counts.INACCURACY} inaccuracies · {errors} mistakes · {blunders} blunders
              </p>
            </div>
          );
        })}
      </div>

      {selected ? (
        <SelectedMove move={selected} />
      ) : (
        <p className="text-sm text-app-muted">Step through the moves, or pick a key moment, to see the engine’s view of each move.</p>
      )}

      {keyMoments.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Key moments</h3>
          <ul className="flex flex-wrap gap-2">
            {keyMoments.map((m) => (
              <li key={m.ply}>
                <Button
                  aria-pressed={currentPly === m.ply}
                  className="h-auto min-h-9 px-3 py-1 text-xs"
                  onClick={() => onJump(m.ply + 1)}
                  variant={currentPly === m.ply ? "primary" : "outline"}
                >
                  {moveNumberLabel(m.ply)} {m.san} {CLASSIFICATION_STYLE[m.classification].mark}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Tactics onJump={onJump} report={report} viewer={viewer} />

      <p className="text-xs text-app-muted">
        NexaGen’s own analysis{report.analysis.engine ? ` (${report.analysis.engine}, ${report.analysis.depth.toLowerCase()})` : ""}. Its
        labels and accuracy follow NexaGen’s method and are not the same numbers as other chess sites.
      </p>
    </div>
  );
}

function SelectedMove({ move }: { move: GameReportMove }) {
  const style = CLASSIFICATION_STYLE[move.classification];
  return (
    <section aria-live="polite" className="space-y-2 rounded-control border border-app-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">
          {moveNumberLabel(move.ply)} {move.san}
        </span>
        <Badge variant={style.variant}>{MOVE_CLASSIFICATION_LABELS[move.classification]}</Badge>
        {move.evaluationBefore && move.evaluationAfter && move.classification !== "FORCED" && (
          <span className="text-xs text-app-muted">
            {formatEvaluation(move.evaluationBefore)} → {formatEvaluation(move.evaluationAfter)}
          </span>
        )}
      </div>
      <p className="text-sm">{move.explanation}</p>
      {move.lineSan.length > 0 && move.classification !== "BEST" && move.classification !== "FORCED" && (
        <p className="text-xs text-app-muted">
          <span className="font-semibold text-app-text">Engine line:</span> {move.lineSan.join(" ")}
        </p>
      )}
    </section>
  );
}

function Tactics({ report, viewer, onJump }: { report: GameAnalysisReport; viewer: Viewer | null; onJump: (plies: number) => void }) {
  const add = useAddTacticToRevision();
  const opportunities = report.tactics.opportunities;
  if (opportunities.length === 0) {
    return <p className="text-sm text-app-muted">No clear tactics (a forced mate or won material) came up in this game.</p>;
  }
  const canAddFor = (o: TacticalOpportunity) => {
    if (!viewer || !report.revisionEligiblePlies.includes(o.ply)) return false;
    const playerId = report.sides[o.side].playerId;
    if (!playerId) return false;
    return viewer.role === "STUDENT" ? viewer.id === playerId : true;
  };
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Target className="size-4 text-accent-ink" aria-hidden strokeWidth={2.25} />
        Tactics
      </h3>
      <ul className="space-y-2">
        {opportunities.map((o) => (
          <li className="space-y-2 rounded-control border border-app-border p-3" key={`${o.ply}-${o.side}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{TACTIC_MOTIF_LABELS[o.primaryMotif]}</span>
              <Badge variant={OUTCOME_STYLE[o.outcome].variant}>{OUTCOME_STYLE[o.outcome].label}</Badge>
              <span className="text-xs text-app-muted">
                {o.side === "white" ? "White" : "Black"} at {moveNumberLabel(o.ply)} ·{" "}
                {o.gain.kind === "MATE" ? `mate in ${o.gain.moves}` : `wins about ${o.gain.pawns} pawns`}
              </span>
            </div>
            <p className="text-xs text-app-muted">
              <span className="font-semibold text-app-text">Line:</span> {o.lineSan.join(" ")}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button className="h-9 text-xs" onClick={() => onJump(o.ply)} variant="outline">
                Show position
              </Button>
              {canAddFor(o) && (
                <Button
                  className="h-9 text-xs"
                  disabled={add.isPending}
                  onClick={() =>
                    add.mutate(
                      { analysisId: report.analysis.id, ply: o.ply },
                      {
                        onError: (err) => toast.error(err instanceof Error ? err.message : "Could not add it to revision."),
                        onSuccess: (res) => toast.success(res.alreadyAdded ? "Already in Smart Revision — it's due now." : "Added to Smart Revision"),
                      },
                    )
                  }
                >
                  Add to Smart Revision
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

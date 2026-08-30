"use client";

import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import type { AssignmentActivityType, AssignmentEvaluationResult } from "@nexa-chess/types";
import { ArrowLeft, CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { PracticeBoard } from "@/features/chessboard/components/board/PracticeBoard";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Props {
  result: AssignmentEvaluationResult;
  activityType: AssignmentActivityType;
  startFen: string;
  timeSpentSeconds: number;
  onRetry?: () => void;
  onBack: () => void;
}

export function AssignmentResultView({
  result,
  activityType,
  startFen,
  timeSpentSeconds,
  onRetry,
  onBack
}: Props) {
  const showAccuracy = result.accuracyPercent !== null;
  const reviewFens = useMemo(() => {
    // Positions to step through when clicking a review row.
    return result.review.map((r) => r.fenBefore);
  }, [result.review]);
  const [cursor, setCursor] = useState<number | null>(null);
  const boardFen = cursor !== null ? reviewFens[cursor] ?? startFen : startFen;

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-center gap-3">
          {result.passed ? (
            <CheckCircle2 className="size-8 text-green-600" strokeWidth={2.5} />
          ) : (
            <XCircle className="size-8 text-red-500" strokeWidth={2.5} />
          )}
          <div>
            <h2 className="text-xl font-extrabold text-app-text">
              {result.passed
                ? "Assignment completed"
                : result.attemptsRemaining === 0
                  ? "Not passed — no attempts left"
                  : "Attempt finished"}
            </h2>
            <p className="text-sm text-app-muted">Result: {result.result}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Score" value={`${result.scorePercent}%`} />
          {showAccuracy && <Stat label="Accuracy" value={`${result.accuracyPercent}%`} />}
          <Stat label="Attempts" value={String(result.attemptCount)} />
          <Stat label="Time" value={formatTime(timeSpentSeconds)} />
        </div>

        {result.engineUnavailable && (
          <p className="mt-3 rounded-app border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
            The engine was offline, so this game was scored from the final position only.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {!result.passed && result.attemptsRemaining !== 0 && onRetry && (
            <Button onClick={onRetry}>
              <RotateCcw className="mr-2 size-4" strokeWidth={2.5} />
              Try again
              {result.attemptsRemaining !== null && ` (${result.attemptsRemaining} left)`}
            </Button>
          )}
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 size-4" strokeWidth={2.5} />
            Back to assignments
          </Button>
        </div>
      </Card>

      {activityType === "SOLVE_LINE" && result.review.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-app-muted">
            Move-by-move review
          </h3>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <PracticeBoard fen={boardFen} interactive={false} className="lg:w-[360px]" />
            <div className="min-w-0 flex-1 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-app-muted">
                    <th className="py-1 pr-3">#</th>
                    <th className="py-1 pr-3">Your move</th>
                    <th className="py-1 pr-3">Expected</th>
                    <th className="py-1">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {result.review.map((r, i) => (
                    <tr
                      key={r.ply}
                      onClick={() => setCursor(i)}
                      className={cn(
                        "cursor-pointer border-t border-app-border/50 transition-colors hover:bg-app-soft",
                        cursor === i && "bg-app-soft"
                      )}
                    >
                      <td className="py-1.5 pr-3 text-app-muted">{Math.floor(r.ply / 2) + 1}</td>
                      <td className="py-1.5 pr-3 font-medium text-app-text">{r.yourMove ?? "—"}</td>
                      <td className="py-1.5 pr-3 text-app-text">{r.expectedMove ?? "—"}</td>
                      <td className="py-1.5">
                        {r.correct === true ? (
                          <span className="text-green-600">✓ Correct</span>
                        ) : r.correct === false ? (
                          <span className="text-red-500">✗ Incorrect</span>
                        ) : (
                          <span className="text-app-muted">— Not reached</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.solutionMoves && (
                <p className="mt-3 text-xs text-app-muted">
                  Full line:{" "}
                  <span className="font-mono text-app-text">
                    {solutionLineSan(startFen, result.solutionMoves)}
                  </span>
                </p>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-app border border-app-border bg-app-background/50 p-3 text-center">
      <p className="text-xs uppercase tracking-wide text-app-muted">{label}</p>
      <p className="text-lg font-bold text-app-text">{value}</p>
    </div>
  );
}

function solutionLineSan(startFen: string, moves: { uci: string }[]): string {
  try {
    const chess = new Chess(startFen);
    const parts: string[] = [];
    moves.forEach((m, i) => {
      const res = chess.move({
        from: m.uci.slice(0, 2),
        to: m.uci.slice(2, 4),
        promotion: m.uci.slice(4) || undefined
      });
      parts.push(i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ${res.san}` : res.san);
    });
    return parts.join(" ");
  } catch {
    return moves.map((m) => m.uci).join(" ");
  }
}

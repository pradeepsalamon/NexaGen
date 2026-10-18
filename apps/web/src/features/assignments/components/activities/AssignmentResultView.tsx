"use client";

import { useMemo, useState } from "react";
import { Chess } from "@/lib/chess";
import type { AssignmentActivityType, AssignmentEvaluationResult } from "@nexa-chess/types";
import { ArrowLeft, CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { PracticeBoard } from "@/features/chessboard/components/board/PracticeBoard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";

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
            <CheckCircle2 className="size-8 text-success-ink" strokeWidth={2.5} />
          ) : (
            <XCircle className="size-8 text-warning-ink" strokeWidth={2.5} />
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
          <p className="mt-3 rounded-app border border-warning/40 bg-warning/10 p-2 text-xs text-warning-ink">
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
          <h3 className="mb-3 text-sm font-bold text-app-muted">
            Move-by-move review
          </h3>
          <div className="flex flex-col gap-4 md:flex-row md:items-start">
            <PracticeBoard fen={boardFen} interactive={false} className="md:w-[min(360px,50%)] md:shrink-0" />
            <div className="min-w-0 flex-1 overflow-x-auto">
              <Table className="w-full text-sm">
                <TableHeader>
                  <TableRow className="text-left text-xs text-app-muted">
                    <TableHead className="py-1 pr-3">#</TableHead>
                    <TableHead className="py-1 pr-3">Your move</TableHead>
                    <TableHead className="py-1 pr-3">Expected</TableHead>
                    <TableHead className="py-1">Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.review.map((r, i) => (
                    <TableRow
                      key={r.ply}
                      onClick={() => setCursor(i)}
                      className={cn(
                        "cursor-pointer border-t border-app-border/50 transition-colors hover:bg-app-soft",
                        cursor === i && "bg-app-soft"
                      )}
                    >
                      <TableCell className="text-left py-1.5 pr-3 text-app-muted">{Math.floor(r.ply / 2) + 1}</TableCell>
                      <TableCell className="text-left py-1.5 pr-3 font-medium text-app-text">{r.yourMove ?? "—"}</TableCell>
                      <TableCell className="text-left py-1.5 pr-3 text-app-text">{r.expectedMove ?? "—"}</TableCell>
                      <TableCell className="text-left py-1.5">
                        {r.correct === true ? (
                          <span className="text-success-ink">✓ Correct</span>
                        ) : r.correct === false ? (
                          <span className="text-warning-ink">✗ Incorrect</span>
                        ) : (
                          <span className="text-app-muted">— Not reached</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
      <p className="text-xs text-app-muted">{label}</p>
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

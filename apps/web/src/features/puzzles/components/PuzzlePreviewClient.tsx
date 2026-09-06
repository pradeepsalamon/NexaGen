"use client";

import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { usePuzzle } from "../hooks/usePuzzlesApi";
import {
  PUZZLE_DIFFICULTY_LABELS,
  PUZZLE_TYPE_LABELS,
  difficultyBadgeVariant,
  statusBadgeVariant
} from "../lib/puzzleMeta";
import { PuzzleSolver } from "./solver/PuzzleSolver";

export function PuzzlePreviewClient({ id, basePath }: { id: string; basePath: string }) {
  const { data, isLoading, isError, refetch } = usePuzzle(id);

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (isError || !data) {
    return <WidgetError message="Could not load this puzzle." onRetry={() => refetch()} />;
  }

  const p = data.puzzle;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href={basePath}>
          <ArrowLeft className="mr-1.5 size-4" strokeWidth={2.5} />
          Puzzle Library
        </Link>
      </Button>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-app-text">{p.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{p.topicName}</Badge>
            <Badge variant="outline">{PUZZLE_TYPE_LABELS[p.puzzleType]}</Badge>
            <Badge variant={difficultyBadgeVariant(p.difficulty)}>
              {PUZZLE_DIFFICULTY_LABELS[p.difficulty]}
            </Badge>
            <Badge variant={statusBadgeVariant(p.status)}>{p.status}</Badge>
            {p.visibility === "GLOBAL" && <Badge variant="default">Admin Library</Badge>}
          </div>
          {p.description ? (
            <p className="mt-2 max-w-2xl text-sm text-app-muted">{p.description}</p>
          ) : null}
        </div>
        {p.canManage && (
          <Button variant="outline" asChild>
            <Link href={`${basePath}/${p.id}/edit`}>
              <Pencil className="mr-2 size-4" strokeWidth={2.5} />
              Edit
            </Link>
          </Button>
        )}
      </div>

      <Card className="p-4 sm:p-6">
        <p className="mb-3 text-sm font-semibold text-app-text">
          {p.sideToMove === "white" ? "White" : "Black"} to move — find the best continuation.
        </p>
        {p.solutionMoves && p.solutionMoves.length > 0 ? (
          <PuzzleSolver
            key={p.id}
            fen={p.fen}
            orientation={p.orientation}
            solutionMoves={p.solutionMoves}
            hints={p.hints}
            explanation={p.explanation}
          />
        ) : (
          <p className="text-sm text-app-muted">
            This puzzle has no solution line recorded yet.
          </p>
        )}
      </Card>
    </div>
  );
}

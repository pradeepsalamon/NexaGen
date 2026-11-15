"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
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
import { enumLabel } from "@/lib/utils";

export function PuzzlePreviewClient({ id, basePath }: { id: string; basePath: string }) {
  const { data, isLoading, isError, refetch } = usePuzzle(id);

  if (isLoading) {
    return <Skeleton className="h-96 rounded-app" />;
  }
  if (isError || !data) {
    return (
      <WidgetError
        message="Couldn't load this puzzle. Check your connection and try again."
        onRetry={() => refetch()}
      />
    );
  }

  const p = data.puzzle;

  return (
    <div className="animate-fade-in pb-10">
      <PageHeader
        actions={
          p.canManage ? (
            <Button asChild variant="outline">
              <Link href={`${basePath}/${p.id}/edit`}>
                <Pencil aria-hidden="true" className="size-4" strokeWidth={2.5} />
                Edit
              </Link>
            </Button>
          ) : null
        }
        breadcrumbs={[{ href: basePath, label: "Puzzle library" }, { label: p.title }]}
        description={p.description || undefined}
        title={p.title}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{p.topicName}</Badge>
          <Badge variant="outline">{PUZZLE_TYPE_LABELS[p.puzzleType]}</Badge>
          <Badge variant={difficultyBadgeVariant(p.difficulty)}>{PUZZLE_DIFFICULTY_LABELS[p.difficulty]}</Badge>
          <Badge variant={statusBadgeVariant(p.status)}>{enumLabel(p.status)}</Badge>
          {p.visibility === "GLOBAL" ? <Badge variant="default">Admin library</Badge> : null}
        </div>
      </PageHeader>

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

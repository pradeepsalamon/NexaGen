"use client";

import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { usePuzzle } from "../hooks/usePuzzlesApi";
import { PuzzleForm } from "./PuzzleForm";

export function PuzzleEditClient({
  id,
  basePath,
  role
}: {
  id: string;
  basePath: string;
  role: "admin" | "coach";
}) {
  const { data, isLoading, isError, refetch } = usePuzzle(id);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (isError || !data) {
    return <WidgetError message="Could not load this puzzle." onRetry={() => refetch()} />;
  }
  return <PuzzleForm mode="edit" basePath={basePath} role={role} puzzle={data.puzzle} />;
}

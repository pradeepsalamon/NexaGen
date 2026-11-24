"use client";

import { ResourceLoadError } from "@/components/common/ResourceLoadError";
import { Skeleton } from "@/components/ui/Skeleton";
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
  const { data, error, isLoading, isError, refetch } = usePuzzle(id);

  if (isLoading) return <Skeleton className="h-96 rounded-app" />;
  if (isError || !data) {
    return (
      <ResourceLoadError backHref={basePath} backLabel="All puzzles" error={error} onRetry={() => void refetch()} resource="puzzle" />
    );
  }
  return <PuzzleForm mode="edit" basePath={basePath} role={role} puzzle={data.puzzle} />;
}

"use client";

import { ResourceLoadError } from "@/components/common/ResourceLoadError";
import { Skeleton } from "@/components/ui/Skeleton";
import { useActivity } from "../../hooks/useActivitiesApi";
import { ActivityForm } from "./ActivityForm";

export function ActivityEditClient({ id, basePath }: { id: string; basePath: string }) {
  const { data, error, isLoading, refetch } = useActivity(id);
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error || !data) {
    return <ResourceLoadError backHref={basePath} backLabel="All puzzles" error={error} onRetry={() => void refetch()} resource="activity" />;
  }
  // Keyed: the form reads the activity once, into its own state.
  return <ActivityForm key={data.id} kind={data.kind} activity={data} basePath={basePath} />;
}

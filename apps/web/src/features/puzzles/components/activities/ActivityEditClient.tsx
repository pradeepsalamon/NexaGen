"use client";

import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useActivity } from "../../hooks/useActivitiesApi";
import { ActivityForm } from "./ActivityForm";

export function ActivityEditClient({ id, basePath }: { id: string; basePath: string }) {
  const { data, error, isLoading, refetch } = useActivity(id);
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error || !data) return <WidgetError message="Couldn't load this activity." onRetry={() => void refetch()} />;
  // Keyed: the form reads the activity once, into its own state.
  return <ActivityForm key={data.id} kind={data.kind} activity={data} basePath={basePath} />;
}

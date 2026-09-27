"use client";

import { TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useMyProgress } from "../hooks/useProgress";
import { ProgressView } from "./ProgressView";

export function StudentProgressClient() {
  const { data, isLoading, isError, refetch } = useMyProgress();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight flex items-center gap-2 text-app-text">
          <TrendingUp className="size-6 text-primary-ink" strokeWidth={2.5} />
          My Progress
        </h1>
        <p className="mt-1 text-app-muted">
          Solve puzzles and finish assignments every day to grow your rating and your streak.
        </p>
      </div>
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-app" />
          ))}
        </div>
      ) : isError || !data ? (
        <WidgetError onRetry={() => refetch()} />
      ) : (
        <ProgressView progress={data.progress} />
      )}
    </div>
  );
}

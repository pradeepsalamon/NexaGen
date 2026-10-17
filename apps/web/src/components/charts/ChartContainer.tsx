"use client";

import type { ReactNode } from "react";
import { AlertTriangle, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

interface ChartContainerProps {
  isLoading?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  onRetry?: () => void;
  emptyMessage?: string;
  errorMessage?: string;
  height?: number;
  className?: string;
  children: ReactNode;
}

/**
 * Wraps a chart with independent loading / error / empty states so one failed
 * analytics endpoint never blanks the surrounding dashboard.
 */
export function ChartContainer({
  isLoading,
  isError,
  isEmpty,
  onRetry,
  emptyMessage = "No data available for this period.",
  errorMessage = "Couldn't load this chart.",
  height = 260,
  className,
  children
}: ChartContainerProps) {
  if (isLoading) {
    return <Skeleton className={cn("w-full rounded-app", className)} style={{ height }} />;
  }

  if (isError) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-control bg-app-soft/50 p-6 text-center",
          className
        )}
        style={{ minHeight: height }}
      >
        <AlertTriangle aria-hidden="true" className="size-6 text-app-danger-ink" strokeWidth={2} />
        <p className="text-sm text-app-muted">{errorMessage}</p>
        {onRetry ? (
          <Button onClick={onRetry} size="sm" variant="outline">
            Retry
          </Button>
        ) : null}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-control bg-app-soft/50 p-6 text-center",
          className
        )}
        style={{ minHeight: height }}
      >
        <BarChart3 aria-hidden="true" className="size-6 text-app-muted" strokeWidth={2} />
        <p className="text-sm text-app-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn("w-full overflow-x-auto", className)} style={{ minHeight: height }}>
      {children}
    </div>
  );
}

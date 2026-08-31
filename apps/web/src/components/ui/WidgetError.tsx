"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export function WidgetError({
  message = "Something went wrong loading this.",
  onRetry,
  className
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-app border border-dashed border-app-border p-6 text-center",
        className
      )}
    >
      <AlertTriangle className="size-6 text-app-danger" strokeWidth={2} />
      <p className="text-sm text-app-muted">{message}</p>
      {onRetry ? (
        <Button onClick={onRetry} size="sm" variant="outline">
          Retry
        </Button>
      ) : null}
    </div>
  );
}

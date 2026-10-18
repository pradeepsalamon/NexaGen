"use client";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

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
    <Alert
      action={
        onRetry ? (
          <Button onClick={onRetry} size="sm" variant="outline">
            Retry
          </Button>
        ) : null
      }
      className={className}
      variant="error"
    >
      {message}
    </Alert>
  );
}

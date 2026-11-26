"use client";

import { CloudOff, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyStateIcon } from "@/components/ui/EmptyState";
import { readableErrorText } from "@/lib/errors";
import { cn } from "@/lib/utils";

const DEFAULT_TITLE = "This part couldn't load";

/**
 * The one shared template for a part of a page that couldn't load
 * (docs/UI_RULES.md § "Errors", owner 2026-11-26): a calm block in its place,
 * never a red box and never raw server text ("Internal server error"). The
 * reason is in the error toast the query client raises for every failed load
 * (lib/errorToast.ts). `message` is used as the title only when it is written
 * for people ("Couldn't load closure requests."); anything technical falls
 * back to the default. Use one per failed part, not one per query.
 */
export function WidgetError({
  message,
  onRetry,
  className
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const title = readableErrorText(message) ?? DEFAULT_TITLE;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-app border border-dashed border-app-line-strong bg-app-surface px-6 py-10 text-center animate-fade-in",
        className
      )}
    >
      <EmptyStateIcon icon={CloudOff} size="lg" />
      <h3 className="mt-5 text-base font-semibold text-app-text">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-app-muted">Try again in a moment. If it keeps happening, tell your academy.</p>
      {onRetry ? (
        <Button className="mt-5" onClick={onRetry} variant="neutral">
          <RotateCw aria-hidden className="size-4" strokeWidth={2.5} />
          Try again
        </Button>
      ) : null}
    </div>
  );
}

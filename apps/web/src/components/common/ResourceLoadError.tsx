"use client";

import { ArrowLeft, CloudOff, Lock, RotateCw, SearchX, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { EmptyStateIcon } from "@/components/ui/EmptyState";
import { errorStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

export type ResourceLoadFailure = "not-found" | "forbidden" | "failed";

/**
 * Why loading one record by the id in the URL failed. A made-up or deleted id
 * is a 404 (a malformed one can be a 400): retrying can't help, so the page
 * says "not found" instead of "check your connection".
 */
export function resourceLoadFailure(error: unknown): ResourceLoadFailure {
  const status = errorStatus(error);
  if (status === 404 || status === 400) return "not-found";
  if (status === 403) return "forbidden";
  return "failed";
}

const COPY: Record<ResourceLoadFailure, { description: string; icon: LucideIcon; title: (thing: string) => string }> = {
  failed: {
    description: "Check your connection and try again.",
    icon: CloudOff,
    title: (thing) => `We couldn't load this ${thing}`
  },
  forbidden: {
    description: "It belongs to someone else, or your role can't open it. Ask an admin if you think you should.",
    icon: Lock,
    title: (thing) => `You don't have access to this ${thing}`
  },
  "not-found": {
    description: "The link may be out of date, or it was deleted.",
    icon: SearchX,
    title: (thing) => `We can't find this ${thing}`
  }
};

/**
 * What a page that loads one record by the id in its URL shows when that load
 * fails, instead of a skeleton that never ends. Pick it with
 * `if (query.isError) return <ResourceLoadError … />` before the loading check.
 */
export function ResourceLoadError({
  backHref,
  backLabel,
  className,
  error,
  onRetry,
  resource
}: {
  /** Where "back" goes: the list the record lives in. */
  backHref?: string;
  backLabel?: string;
  className?: string;
  error: unknown;
  /** Offered only when the failure might pass (a network error, a 5xx). */
  onRetry?: () => void;
  /** The thing, lower case: "class", "invoice", "puzzle". */
  resource: string;
}) {
  const failure = resourceLoadFailure(error);
  const copy = COPY[failure];
  const canRetry = failure === "failed" && onRetry;

  return (
    <div
      className={cn(
        "flex min-h-[300px] flex-col items-center justify-center rounded-app border border-dashed border-app-line-strong bg-app-surface p-8 text-center animate-fade-in",
        className
      )}
      role={failure === "failed" ? "alert" : undefined}
    >
      <EmptyStateIcon icon={copy.icon} size="lg" />
      <h2 className="mt-5 text-base font-semibold text-app-text">{copy.title(resource)}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-app-muted">{copy.description}</p>
      {backHref || canRetry ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {canRetry ? (
            <Button onClick={onRetry} variant="primary">
              <RotateCw aria-hidden="true" className="size-4" strokeWidth={2.5} />
              Try again
            </Button>
          ) : null}
          {backHref ? (
            <Button asChild variant={canRetry ? "neutral" : "primary"}>
              <Link href={backHref}>
                <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={2.5} />
                {backLabel ?? "Go back"}
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

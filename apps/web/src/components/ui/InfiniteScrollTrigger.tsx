"use client";

import type { RefObject } from "react";
import { Button } from "@/components/ui/Button";
import { WidgetError } from "@/components/ui/WidgetError";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { cn } from "@/lib/utils";

/**
 * Footer for a cursor-paged (`useInfiniteQuery`) list: loads the next page as
 * it scrolls into view, and keeps a real "Load more" button for keyboard and
 * screen-reader users (and browsers without IntersectionObserver). A failed
 * page shows a retry and stops auto-loading until the user retries.
 *
 * ```tsx
 * <InfiniteScrollTrigger query={query} />
 * ```
 */
export function InfiniteScrollTrigger({
  className,
  endLabel,
  label = "Load more",
  query,
  root,
  size = "default"
}: {
  className?: string;
  /** Shown once every page is loaded (omit to show nothing). */
  endLabel?: string;
  label?: string;
  /** The `useInfiniteQuery` result, or the same four fields. */
  query: {
    fetchNextPage: () => unknown;
    hasNextPage: boolean | undefined;
    isFetchNextPageError: boolean;
    isFetchingNextPage: boolean;
  };
  /** The scroll container when it is not the page (popover, dialog body). */
  root?: RefObject<Element | null>;
  size?: "default" | "sm";
}) {
  const { fetchNextPage, hasNextPage, isFetchNextPageError, isFetchingNextPage } = query;
  const sentinelRef = useInfiniteScroll({
    disabled: isFetchNextPageError,
    hasNextPage,
    isFetchingNextPage,
    onLoadMore: fetchNextPage,
    root
  });

  if (isFetchNextPageError) {
    return (
      <WidgetError
        className={className}
        message="Couldn't load more."
        onRetry={() => void fetchNextPage()}
      />
    );
  }

  if (!hasNextPage) {
    return endLabel ? (
      <p className={cn("py-2 text-center text-xs text-app-muted", className)}>{endLabel}</p>
    ) : null;
  }

  return (
    <div className={cn("flex justify-center py-2", className)} ref={sentinelRef}>
      <Button
        isLoading={isFetchingNextPage}
        onClick={() => void fetchNextPage()}
        size={size}
        type="button"
        variant="outline"
      >
        {isFetchingNextPage ? "Loading…" : label}
      </Button>
    </div>
  );
}

import { useEffect, useRef, type RefObject } from "react";

interface UseInfiniteScrollOptions {
  /** Another page exists (TanStack `hasNextPage`). */
  hasNextPage: boolean | undefined;
  /** A page is already in flight (TanStack `isFetchingNextPage`). */
  isFetchingNextPage: boolean;
  /** Stop auto-loading — e.g. after the last page failed, so it never retries in a loop. */
  disabled?: boolean;
  onLoadMore: () => unknown;
  /**
   * The scroll container, when it is not the page itself (a popover, a
   * dialog body). Omit for page-level lists.
   */
  root?: RefObject<Element | null>;
  /** How far ahead of the end to start loading. */
  rootMargin?: string;
}

/**
 * Infinite scroll: attach the returned ref to a sentinel after the last row
 * and the next page loads as the sentinel nears the visible area. One
 * `IntersectionObserver`, no scroll listeners or layout reads. See
 * docs/PAGINATION.md; use `InfiniteScrollTrigger` for the ready-made footer.
 *
 * The observer is rebuilt whenever a fetch settles; a new observer reports the
 * sentinel's current state immediately, so a page too short to scroll keeps
 * loading until it fills the view (or the list ends).
 */
export function useInfiniteScroll<T extends Element = HTMLDivElement>({
  disabled = false,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  root,
  rootMargin = "320px 0px"
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<T | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || disabled || !hasNextPage || isFetchingNextPage) return;
    if (typeof IntersectionObserver === "undefined") return; // the trigger's button still works

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          void onLoadMoreRef.current();
        }
      },
      { root: root?.current ?? null, rootMargin }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [disabled, hasNextPage, isFetchingNextPage, root, rootMargin]);

  return sentinelRef;
}

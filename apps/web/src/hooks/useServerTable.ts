import { useCallback, useEffect, useMemo, useState } from "react";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import type { ListParams } from "@/lib/pagination";

interface UseServerTableOptions {
  pageSize?: number;
  initialSorting?: SortingState;
  /** Debounce for the search box before it hits the server, ms. */
  searchDebounceMs?: number;
}

/**
 * State container for a server-paginated data table (AUDIT H26). Owns page /
 * page-size / debounced search / status-filter / sorting, and exposes both the
 * `ListParams` to feed the query and the controlled props to hand to
 * `useDataTable` (with `manualPagination`/`manualSorting`).
 *
 * Any filter change (search, status, sort) resets back to page 1 so the user
 * never lands on an out-of-range page.
 */
export function useServerTable({
  pageSize = 20,
  initialSorting = [],
  searchDebounceMs = 350
}: UseServerTableOptions = {}) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize
  });
  const [sorting, setSortingState] = useState<SortingState>(initialSorting);
  const [status, setStatusState] = useState("ALL");

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const toFirstPage = useCallback(
    () => setPagination((p) => (p.pageIndex === 0 ? p : { ...p, pageIndex: 0 })),
    []
  );

  // A filter change and the reset to page 1 land in the same update, so
  // `params` never pairs the new filter with the old page (a wasted request
  // for a page that may not exist).
  useEffect(() => {
    const handle = setTimeout(() => {
      const next = searchInput.trim();
      if (next === debouncedSearch) return;
      setDebouncedSearch(next);
      toFirstPage();
    }, searchDebounceMs);
    return () => clearTimeout(handle);
  }, [searchInput, searchDebounceMs, debouncedSearch, toFirstPage]);

  const setSorting: typeof setSortingState = useCallback((updater) => {
    setSortingState(updater);
    setPagination((p) => (p.pageIndex === 0 ? p : { ...p, pageIndex: 0 }));
  }, []);
  const setStatus = useCallback(
    (next: string) => {
      setStatusState(next);
      toFirstPage();
    },
    [toFirstPage]
  );

  // Guard against a stale page number after the row count shrinks. Stable
  // identity so callers can put it in a `useEffect` dep list.
  const clampToPageCount = useCallback((pageCount: number) => {
    setPagination((p) =>
      p.pageIndex > pageCount - 1 ? { ...p, pageIndex: Math.max(0, pageCount - 1) } : p
    );
  }, []);

  const params: ListParams = useMemo(() => {
    const sort = sorting[0];
    return {
      page: pagination.pageIndex + 1,
      pageSize: pagination.pageSize,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(sort ? { sort: sort.id, order: sort.desc ? "desc" : "asc" } : {}),
      ...(status !== "ALL" ? { status } : {})
    };
  }, [pagination.pageIndex, pagination.pageSize, debouncedSearch, sorting, status]);

  return {
    params,
    // search box
    search: searchInput,
    setSearch: setSearchInput,
    // status filter
    status,
    setStatus,
    // table wiring
    pagination,
    setPagination,
    sorting,
    setSorting,
    clampToPageCount,
    manual: { manualPagination: true, manualSorting: true } as const
  };
}

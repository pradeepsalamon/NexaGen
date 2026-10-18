"use client";

import type { PaginatedQuery, PaginationMeta } from "@nexa-chess/types";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SortButton } from "@/components/ui/DataTableSortButton";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";

export interface DrillColumn<Row> {
  key: string;
  header: string;
  sortable?: boolean;
  align?: "left" | "right";
  render: (row: Row) => ReactNode;
}

interface Props<Row> {
  name: string;
  columns: DrillColumn<Row>[];
  fetcher: (
    params: PaginatedQuery
  ) => Promise<{ rows: Row[]; pagination: PaginationMeta }>;
  extraParams?: Record<string, string | number | undefined>;
  rowKey: (row: Row) => string;
  searchPlaceholder?: string;
  defaultSort?: { key: string; order: "asc" | "desc" };
  emptyMessage?: string;
}

export function AnalyticsDrillTable<Row>({
  name,
  columns,
  fetcher,
  extraParams = {},
  rowKey,
  searchPlaceholder = "Search…",
  defaultSort,
  emptyMessage = "No rows for this period."
}: Props<Row>) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [sort, setSort] = useState(defaultSort ?? null);

  const serializedExtra = JSON.stringify(extraParams);
  const prevExtraRef = useRef(serializedExtra);
  useEffect(() => {
    if (prevExtraRef.current !== serializedExtra) {
      prevExtraRef.current = serializedExtra;
      setPage(1);
    }
  }, [serializedExtra]);

  const params = useMemo<PaginatedQuery & Record<string, unknown>>(
    () => ({
      page,
      pageSize: 20,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(sort ? { sort: sort.key, order: sort.order } : {}),
      ...extraParams
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, debouncedSearch, sort, serializedExtra]
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.analytics.table(name, params),
    queryFn: () => fetcher(params),
    placeholderData: keepPreviousData,
    staleTime: 60_000
  });

  const toggleSort = (key: string) => {
    setPage(1);
    setSort((prev) =>
      prev?.key === key
        ? { key, order: prev.order === "asc" ? "desc" : "asc" }
        : { key, order: "asc" }
    );
  };

  const meta = data?.pagination;

  return (
    <div className="rounded-app border border-app-border bg-app-surface shadow-card">
      <div className="flex items-center gap-2 border-b border-app-border p-3">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-muted" />
          <Input
            className="h-9 pl-9"
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder={searchPlaceholder}
            value={search}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table className="w-full min-w-[640px] text-left text-sm">
          <TableHeader className="bg-app-soft text-xs text-app-muted">
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  className={cn("px-4 py-2.5", col.align === "right" && "text-right")}
                  key={col.key}
                >
                  {col.sortable ? (
                    <SortButton
                      direction={sort?.key === col.key ? sort.order : false}
                      label={col.header}
                      onClick={() => toggleSort(col.key)}
                    />
                  ) : (
                    col.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-app-border">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((col) => (
                    <TableCell className="text-left px-4 py-3" key={col.key}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell className="px-4 py-6 text-center text-app-muted" colSpan={columns.length}>
                  Couldn&apos;t load this table.{" "}
                  <button className="text-primary-ink underline" onClick={() => refetch()} type="button">
                    Retry
                  </button>
                </TableCell>
              </TableRow>
            ) : (data?.rows.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell className="px-4 py-6 text-center text-app-muted" colSpan={columns.length}>
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              data?.rows.map((row) => (
                <TableRow className="hover:bg-app-soft/50" key={rowKey(row)}>
                  {columns.map((col) => (
                    <TableCell
                      className={cn(
                        "px-4 py-2.5",
                        col.align === "right" && "text-right"
                      )}
                      key={col.key}
                    >
                      {col.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-app-border p-3 text-sm text-app-muted">
        <span>
          {meta
            ? `${meta.total.toLocaleString()} total · page ${meta.page} of ${meta.totalPages}`
            : ""}
        </span>
        <div className="flex gap-2">
          <Button
            disabled={!meta || meta.page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            size="sm"
            variant="outline"
          >
            Previous
          </Button>
          <Button
            disabled={!meta || meta.page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
            size="sm"
            variant="outline"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

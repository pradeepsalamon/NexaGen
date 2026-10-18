import { useCallback, useMemo, useState } from "react";
import type { SortDirection } from "@/components/ui/DataTableSortButton";

type SortValue = string | number | boolean | null | undefined;

interface UseTableSortOptions<Row, Key extends string> {
  rows: readonly Row[] | undefined;
  accessors: Record<Key, (row: Row) => SortValue>;
}

function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Opt-in client-side sorting for plain `<Table>`s. Rows keep the order the API
 * returned until a header is clicked: a new column sorts ascending, the active
 * one flips to descending, then back to unsorted. Empty values always sort last.
 */
export function useTableSort<Row, Key extends string>({
  rows,
  accessors
}: UseTableSortOptions<Row, Key>) {
  const [sort, setSort] = useState<{ key: Key; direction: SortDirection } | null>(null);

  const sortedRows = useMemo(() => {
    if (!rows) return [];
    if (!sort) return rows as Row[];
    const get = accessors[sort.key];
    const sign = sort.direction === "asc" ? 1 : -1;
    return rows
      .map((row, index) => ({ index, row, value: get(row) }))
      .sort((a, b) => {
        const aEmpty = a.value === null || a.value === undefined || a.value === "";
        const bEmpty = b.value === null || b.value === undefined || b.value === "";
        if (aEmpty || bEmpty) return aEmpty === bEmpty ? a.index - b.index : aEmpty ? 1 : -1;
        return sign * compareValues(a.value, b.value) || a.index - b.index;
      })
      .map((entry) => entry.row);
    // accessors is usually an inline object; the sort only depends on its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);

  const toggle = useCallback((key: Key) => {
    setSort((prev) => {
      if (prev?.key !== key) return { key, direction: "asc" };
      return prev.direction === "asc" ? { key, direction: "desc" } : null;
    });
  }, []);

  const sortProps = useCallback(
    (key: Key) => ({
      direction: sort?.key === key ? sort.direction : (false as const),
      onClick: () => toggle(key)
    }),
    [sort, toggle]
  );

  return { rows: sortedRows, sort, sortProps, toggle };
}

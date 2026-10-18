import { useState, type Dispatch, type SetStateAction } from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  useReactTable
} from "@tanstack/react-table";

interface UseDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  initialPagination?: PaginationState;
  initialSorting?: SortingState;
  initialColumnVisibility?: VisibilityState;
  onRowSelectionChange?: (selection: RowSelectionState) => void;
  /**
   * Optional controlled row-selection state.
   *
   * Lift this into the component when row handlers need to clear the selection
   * *and* those handlers are referenced by `columns` — otherwise you get a
   * cycle (hook -> setRowSelection -> handlers -> columns -> hook) that
   * previously forced callers into `columns: []` plus a `setOptions()` call
   * during render. See AUDIT.md H4.
   */
  rowSelection?: RowSelectionState;
  setRowSelection?: Dispatch<SetStateAction<RowSelectionState>>;
  /**
   * Optional controlled pagination/sorting. Lift these when the table's `data`
   * is fetched *using* them (server-side paging), which otherwise creates a
   * cycle between the query and the table.
   */
  pagination?: PaginationState;
  setPagination?: Dispatch<SetStateAction<PaginationState>>;
  sorting?: SortingState;
  setSorting?: Dispatch<SetStateAction<SortingState>>;
  /**
   * Server-side paging/sorting: the caller fetches the page itself, so the
   * table must not slice or re-sort `data`. `pageCount` is the total number of
   * server-side pages.
   */
  manualPagination?: boolean;
  manualSorting?: boolean;
  pageCount?: number;
}

/**
 * Wraps `useReactTable` with the state this app always needs.
 *
 * Pass real `columns` and `data` — callers must NOT mutate the returned table
 * with `table.setOptions()` during render. That is a side effect in the render
 * phase and is not safe under React 18 concurrent rendering. See AUDIT.md H4.
 */
export function useDataTable<TData, TValue>({
  columns,
  data,
  initialPagination = { pageIndex: 0, pageSize: 10 },
  initialSorting = [],
  initialColumnVisibility = {},
  onRowSelectionChange,
  rowSelection: controlledRowSelection,
  setRowSelection: setControlledRowSelection,
  pagination: controlledPagination,
  setPagination: setControlledPagination,
  sorting: controlledSorting,
  setSorting: setControlledSorting,
  manualPagination,
  manualSorting,
  pageCount
}: UseDataTableProps<TData, TValue>) {
  const [internalRowSelection, setInternalRowSelection] =
    useState<RowSelectionState>({});
  const rowSelection = controlledRowSelection ?? internalRowSelection;
  const setRowSelection = setControlledRowSelection ?? setInternalRowSelection;
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    initialColumnVisibility
  );
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [internalSorting, setInternalSorting] =
    useState<SortingState>(initialSorting);
  const sorting = controlledSorting ?? internalSorting;
  const setSorting = setControlledSorting ?? setInternalSorting;

  const [internalPagination, setInternalPagination] =
    useState<PaginationState>(initialPagination);
  const pagination = controlledPagination ?? internalPagination;
  const setPagination = setControlledPagination ?? setInternalPagination;

  const table = useReactTable({
    data,
    columns,
    ...(manualPagination === undefined ? {} : { manualPagination }),
    ...(manualSorting === undefined ? {} : { manualSorting }),
    ...(pageCount === undefined ? {} : { pageCount }),
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      globalFilter,
      pagination
    },
    enableRowSelection: true,
    onRowSelectionChange: (updater) => {
      setRowSelection((old) => {
        const newSelection = typeof updater === "function" ? updater(old) : updater;
        onRowSelectionChange?.(newSelection);
        return newSelection;
      });
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  return {
    table,
    rowSelection,
    setRowSelection,
    globalFilter,
    setGlobalFilter,
    sorting,
    setSorting,
    columnFilters,
    setColumnFilters,
    columnVisibility,
    setColumnVisibility,
    pagination,
    setPagination
  };
}

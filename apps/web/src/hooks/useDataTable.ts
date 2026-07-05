import { useState } from "react";
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
  useReactTable,
  type Table
} from "@tanstack/react-table";

interface UseDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  initialPagination?: PaginationState;
  initialSorting?: SortingState;
  initialColumnVisibility?: VisibilityState;
  onRowSelectionChange?: (selection: RowSelectionState) => void;
}

export function useDataTable<TData, TValue>({
  columns,
  data,
  initialPagination = { pageIndex: 0, pageSize: 10 },
  initialSorting = [],
  initialColumnVisibility = {},
  onRowSelectionChange
}: UseDataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    initialColumnVisibility
  );
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [pagination, setPagination] = useState<PaginationState>(initialPagination);

  const table = useReactTable({
    data,
    columns,
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

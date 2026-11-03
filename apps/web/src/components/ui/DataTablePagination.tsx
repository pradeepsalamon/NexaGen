import { type Table as ReactTable } from "@tanstack/react-table";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";

interface DataTablePaginationProps<TData> {
  table: ReactTable<TData>;
  totalRows: number;
}

const pageSizeOptions = [
  { label: "10 per page", value: "10" },
  { label: "20 per page", value: "20" },
  { label: "50 per page", value: "50" },
  { label: "100 per page", value: "100" }
];

export function DataTablePagination<TData>({
  table,
  totalRows
}: DataTablePaginationProps<TData>) {
  // A table without a selection column has nothing to count as selected.
  const selectable = table.getAllLeafColumns().some((column) => column.id === "select");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-semibold text-app-muted">
        {selectable
          ? `${table.getFilteredSelectedRowModel().rows.length} of ${totalRows} selected`
          : `${totalRows} ${totalRows === 1 ? "row" : "rows"}`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Rows per page"
          className="w-32"
          onChange={(event) => table.setPageSize(Number(event.target.value))}
          options={pageSizeOptions}
          value={String(table.getState().pagination.pageSize)}
        />
        <Button
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
          type="button"
          variant="neutral"
        >
          Previous
        </Button>
        <span className="px-2 text-sm font-medium text-app-muted">
          Page {table.getState().pagination.pageIndex + 1} of{" "}
          {table.getPageCount() || 1}
        </span>
        <Button
          disabled={!table.getCanNextPage()}
          onClick={() => table.nextPage()}
          type="button"
          variant="neutral"
        >
          Next
        </Button>
      </div>
    </div>
  );
}

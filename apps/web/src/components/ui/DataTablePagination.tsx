import { type Table as ReactTable } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { SimpleTooltip } from "@/components/ui/Tooltip";

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
      {/* On the right; below `sm` Previous/Next are arrows so the row fits on one line. */}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <Select
          aria-label="Rows per page"
          className="w-32"
          onChange={(event) => table.setPageSize(Number(event.target.value))}
          options={pageSizeOptions}
          value={String(table.getState().pagination.pageSize)}
        />
        <SimpleTooltip label="Previous page">
          <Button
            aria-label="Previous page"
            className="px-2.5 sm:px-4"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
            type="button"
            variant="neutral"
          >
            <ChevronLeft aria-hidden="true" className="size-4 sm:hidden" strokeWidth={2.5} />
            <span className="hidden sm:inline">Previous</span>
          </Button>
        </SimpleTooltip>
        <span className="whitespace-nowrap px-1 text-sm sm:px-2 font-medium text-app-muted">
          Page {table.getState().pagination.pageIndex + 1} of{" "}
          {table.getPageCount() || 1}
        </span>
        <SimpleTooltip label="Next page">
          <Button
            aria-label="Next page"
            className="px-2.5 sm:px-4"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
            type="button"
            variant="neutral"
          >
            <ChevronRight aria-hidden="true" className="size-4 sm:hidden" strokeWidth={2.5} />
            <span className="hidden sm:inline">Next</span>
          </Button>
        </SimpleTooltip>
      </div>
    </div>
  );
}

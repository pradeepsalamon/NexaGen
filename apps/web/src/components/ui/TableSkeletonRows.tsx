import { Skeleton } from "@/components/ui/Skeleton";
import { TableCell, TableRow } from "@/components/ui/Table";
import { cn } from "@/lib/utils";

const WIDTHS = ["w-3/4", "w-1/2", "w-2/3", "w-5/12"];

/**
 * Placeholder rows for a hand-built `<Table>` while its data loads (DataTable has
 * its own). The first column is wider, like a name; bar widths vary so the rows
 * read as text rather than a grid.
 */
export function TableSkeletonRows({ columns, label = "Loading…", rows = 5 }: { columns: number; label?: string; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <TableRow className="hover:bg-transparent" key={rowIndex}>
          {Array.from({ length: columns }, (_, columnIndex) => (
            <TableCell key={columnIndex}>
              {rowIndex === 0 && columnIndex === 0 ? (
                <span className="sr-only" role="status">
                  {label}
                </span>
              ) : null}
              <Skeleton
                aria-hidden="true"
                className={cn("h-4", columnIndex === 0 ? "w-32 max-w-full" : WIDTHS[(columnIndex + rowIndex) % WIDTHS.length])}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

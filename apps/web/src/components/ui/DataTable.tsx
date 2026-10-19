import {
  flexRender,
  type Cell,
  type RowData,
  type Table as ReactTable
} from "@tanstack/react-table";
import { type ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/Table";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Plain-text column name, shown beside the value in the stacked phone layout. */
    label?: string;
  }
}

interface DataTableProps<TData> {
  table: ReactTable<TData>;
  columnsLength: number;
  isLoading?: boolean;
  loadingText?: string;
  noDataText?: string | ReactNode;
  /** Below `sm`, render each row as a card so no column (or its actions) sits off-screen. */
  stackOnMobile?: boolean;
}

export function DataTable<TData>({
  table,
  columnsLength,
  isLoading,
  loadingText = "Loading...",
  noDataText = "No results.",
  stackOnMobile = false
}: DataTableProps<TData>) {
  const rows = table.getRowModel().rows ?? [];

  return (
    <>
      <div
        className={
          stackOnMobile
            ? "hidden overflow-hidden rounded-[20px] border border-app-border bg-app-surface shadow-card sm:block"
            : "overflow-hidden rounded-[20px] border border-app-border bg-app-surface shadow-card"
        }
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} pin={header.column.id === "actions" ? "end" : undefined}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  className="h-28 text-center font-semibold text-app-muted"
                  colSpan={columnsLength}
                >
                  {loadingText}
                </TableCell>
              </TableRow>
            ) : rows.length ? (
              rows.map((row) => (
                <TableRow
                  data-state={row.getIsSelected() && "selected"}
                  key={row.id}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} pin={cell.column.id === "actions" ? "end" : undefined}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="h-28 text-center font-semibold text-app-muted"
                  colSpan={columnsLength}
                >
                  {noDataText}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {stackOnMobile ? (
        <div className="sm:hidden">
          {isLoading || !rows.length ? (
            <div className="rounded-[20px] border border-app-border bg-app-surface px-4 py-10 text-center text-sm font-semibold text-app-muted shadow-card">
              {isLoading ? loadingText : noDataText}
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((row) => (
                <StackedRow cells={row.getVisibleCells()} key={row.id} selected={row.getIsSelected()} />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </>
  );
}

function columnLabel<TData>(cell: Cell<TData, unknown>) {
  const { columnDef, id } = cell.column;
  if (columnDef.meta?.label) return columnDef.meta.label;
  return typeof columnDef.header === "string" ? columnDef.header : id;
}

const renderCell = <TData,>(cell: Cell<TData, unknown>) =>
  flexRender(cell.column.columnDef.cell, cell.getContext());

function StackedRow<TData>({ cells, selected }: { cells: Cell<TData, unknown>[]; selected: boolean }) {
  const select = cells.find((cell) => cell.column.id === "select");
  const actions = cells.find((cell) => cell.column.id === "actions");
  const [primary, ...rest] = cells.filter((cell) => cell !== select && cell !== actions);

  return (
    <li
      className="rounded-[20px] border border-app-border bg-app-surface p-4 text-sm shadow-card data-[state=selected]:border-primary/50 data-[state=selected]:bg-primary/5"
      data-state={selected ? "selected" : undefined}
    >
      {primary ? (
        <div className="flex items-start gap-3 font-semibold text-app-text [&_*]:!min-w-0">
          {select ? <div className="pt-0.5">{renderCell(select)}</div> : null}
          <div className="min-w-0 flex-1 text-left">{renderCell(primary)}</div>
        </div>
      ) : null}

      {rest.length ? (
        <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2">
          {rest.map((cell) => (
            <div className="contents" key={cell.id}>
              <dt className="text-app-muted">{columnLabel(cell)}</dt>
              <dd className="min-w-0 text-right text-app-text [&_*]:!min-w-0 [&>*]:ml-auto">
                {renderCell(cell)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {actions ? (
        <div className="mt-3 flex justify-end border-t border-app-border pt-3">{renderCell(actions)}</div>
      ) : null}
    </li>
  );
}

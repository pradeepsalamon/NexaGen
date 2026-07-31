"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { SlidersHorizontal, Info } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { AdminBatchClass } from "@nexa-gen/types";

import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { DataTablePagination } from "@/components/ui/DataTablePagination";
import { DataTableToolbar } from "@/components/ui/DataTableToolbar";
import { DataTableSortButton } from "@/components/ui/DataTableSortButton";
import { Select } from "@/components/ui/Select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

import { useDataTable } from "@/hooks/useDataTable";
import { useAdminBatchClassesQuery } from "../hooks/useAdminBatchClasses";
import { BatchClassDetailsDialog } from "./BatchClassDetailsDialog";

const statusOptions = [
  { label: "Scheduled", value: "SCHEDULED" },
  { label: "Live", value: "LIVE" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Cancelled", value: "CANCELLED" }
];

export function BatchClassesClient() {
  const { data, isLoading } = useAdminBatchClassesQuery();
  const classes = data?.classes || [];

  const [detailsClassId, setDetailsClassId] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");

  const filteredClasses = useMemo(() => {
    if (statusFilter === "ALL") return classes;
    return classes.filter(c => c.status === statusFilter);
  }, [classes, statusFilter]);

  const columns = useMemo<ColumnDef<AdminBatchClass>[]>(
    () => [
      {
        accessorKey: "topic",
        enableColumnFilter: true,
        header: ({ column }) => (
          <DataTableSortButton
            label="Class Title"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-52">
            <p className="font-extrabold text-app-text">
              {row.original.topic || (row.original as any).title || "Untitled"}
            </p>
            {row.original.description && (
              <p className="mt-1 line-clamp-2 text-xs text-app-muted">
                {row.original.description}
              </p>
            )}
          </div>
        )
      },
      {
        accessorKey: "batchName",
        enableColumnFilter: true,
        header: ({ column }) => (
          <DataTableSortButton
            label="Batch"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="font-medium text-app-text">{row.original.batchName}</span>
        )
      },
      {
        accessorKey: "coachName",
        enableColumnFilter: true,
        header: ({ column }) => (
          <DataTableSortButton
            label="Coach"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span className="text-app-text">{row.original.coachName}</span>
        )
      },
      {
        accessorKey: "startsAt",
        enableColumnFilter: true,
        header: ({ column }) => (
          <DataTableSortButton
            label="Scheduled"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-40 text-sm text-app-text">
            <div>
              <span className="font-semibold">Starts: </span>
              {format(new Date(row.original.startsAt), "MMM d, yyyy h:mm a")}
            </div>
            <div className="mt-1">
              <span className="font-semibold">Ends: </span>
              {format(new Date(row.original.endsAt), "h:mm a")}
            </div>
          </div>
        )
      },
      {
        accessorKey: "status",
        enableColumnFilter: true,
        header: ({ column }) => (
          <DataTableSortButton
            label="Status"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => {
          const status = row.getValue("status") as string;
          return (
            <Badge
              variant={
                status === "LIVE"
                  ? "success"
                  : status === "COMPLETED"
                  ? "secondary"
                  : status === "CANCELLED"
                  ? "destructive"
                  : "default"
              }
            >
              {status}
            </Badge>
          );
        }
      },
      {
        id: "actions",
        enableHiding: false,
        enableSorting: false,
        header: "Actions",
        cell: ({ row }) => {
          return (
            <TooltipProvider>
              <div className="flex items-center gap-2 justify-center">
                {row.original.status === "COMPLETED" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label="View batch class details"
                        className="size-8 rounded-full border-primary p-0 text-app-text transition-colors hover:border-primary hover:bg-primary hover:text-white"
                        onClick={() => {
                          setDetailsClassId(row.original.id);
                          setIsDetailsOpen(true);
                        }}
                        size="icon"
                        type="button"
                        variant="outline"
                      >
                        <Info aria-hidden="true" className="size-4" strokeWidth={2.5} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>View Details</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </TooltipProvider>
          );
        }
      }
    ],
    []
  );

  const { table, globalFilter, setGlobalFilter } = useDataTable<AdminBatchClass, unknown>({
    data: filteredClasses,
    columns,
    initialPagination: { pageIndex: 0, pageSize: 10 }
  });

  table.setOptions((prev) => ({
    ...prev,
    data: filteredClasses,
    columns,
  }));

  return (
    <main className="min-h-[calc(100vh-64px)] bg-app-background px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase text-primary">
              Classes Management
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight text-app-text">
              Batch Classes
            </h1>
          </div>
        </header>

        <Card className="grid gap-4 p-4">
          <DataTableToolbar
            actions={<ColumnVisibilityMenu table={table} />}
            filters={
              <Select
                className="w-40"
                onChange={(event) => setStatusFilter(event.target.value)}
                options={[{ label: "All Statuses", value: "ALL" }, ...statusOptions]}
                value={statusFilter}
              />
            }
            onSearchChange={setGlobalFilter}
            searchPlaceholder="Filter batch classes..."
            searchValue={globalFilter}
          />

          <DataTable
            columnsLength={columns.length}
            isLoading={isLoading}
            noDataText="No batch classes found."
            table={table}
          />

          <DataTablePagination
            table={table}
            totalRows={table.getFilteredRowModel().rows.length}
          />
        </Card>
      </div>

      <BatchClassDetailsDialog
        classId={detailsClassId}
        isOpen={isDetailsOpen}
        onOpenChange={(open) => {
          setIsDetailsOpen(open);
          if (!open) setTimeout(() => setDetailsClassId(null), 300);
        }}
      />
    </main>
  );
}

function ColumnVisibilityMenu<TData>({ table }: { table: import("@tanstack/react-table").Table<TData> }) {
  const columns = table.getAllColumns().filter((column) => column.getCanHide());

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline">
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          View
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            checked={column.getIsVisible()}
            key={column.id}
            onCheckedChange={(checked) => column.toggleVisibility(!!checked)}
          >
            {formatColumnLabel(column.id)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatColumnLabel(columnId: string) {
  const labels: Record<string, string> = {
    topic: "Class Title",
    batchName: "Batch",
    coachName: "Coach",
    startsAt: "Scheduled",
    status: "Status",
  };
  return labels[columnId] ?? columnId;
}

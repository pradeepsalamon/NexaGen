"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { SlidersHorizontal, Info, Download, Radio } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import type { AdminBatchClass } from "@nexa-chess/types";
import { getRecordingDownloadUrl } from "@/features/live-class/api/live-class";

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
import { useServerTable } from "@/hooks/useServerTable";
import { useAdminBatchClassesQuery } from "../hooks/useAdminBatchClasses";
import { BatchClassDetailsDialog } from "./BatchClassDetailsDialog";
import { LiveClassMonitorDialog } from "@/features/attendance/components/LiveClassMonitor";

const statusOptions = [
  { label: "Scheduled", value: "SCHEDULED" },
  { label: "Live", value: "LIVE" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Cancelled", value: "CANCELLED" }
];

export function BatchClassesClient() {
  // Server-side pagination / search / sort / status filter (AUDIT H26).
  const serverTable = useServerTable({ pageSize: 10 });
  const { clampToPageCount } = serverTable;
  const { data, isLoading } = useAdminBatchClassesQuery(serverTable.params);
  const classes = data?.classes || [];
  const pageCount = data?.pagination?.totalPages ?? 1;
  useEffect(() => {
    clampToPageCount(pageCount);
  }, [pageCount, clampToPageCount]);

  const [detailsClassId, setDetailsClassId] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [monitorClassId, setMonitorClassId] = useState<string | null>(null);

  const handleDownload = async (classId: string) => {
    try {
      const data = await getRecordingDownloadUrl(classId, { download: true });
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error) {
      console.error("Failed to download recording:", error);
      toast.error("Failed to download recording. It may have expired or is unavailable.");
    }
  };


  const columns = useMemo<ColumnDef<AdminBatchClass>[]>(
    () => [
      {
        accessorKey: "topic",
        enableColumnFilter: true,
        header: ({ column }) => (
          <DataTableSortButton
            label="Class Title"
            column={column}
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
            column={column}
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
            column={column}
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
            column={column}
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
            column={column}
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
                {(row.original.status === "LIVE" || row.original.status === "IN_PROGRESS") && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label="Monitor live class"
                        className="size-8 rounded-full border border-accent bg-accent p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-accent)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-accent)_75%,white)] hover:text-white"
                        onClick={() => setMonitorClassId(row.original.id)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Radio aria-hidden="true" className="size-4" strokeWidth={2.5} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Monitor Live</TooltipContent>
                  </Tooltip>
                )}
                {row.original.status === "COMPLETED" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label="View batch class details"
                        className="size-8 rounded-full border border-primary bg-primary p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-white"
                        onClick={() => {
                          setDetailsClassId(row.original.id);
                          setIsDetailsOpen(true);
                        }}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Info aria-hidden="true" className="size-4" strokeWidth={2.5} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>View Details</TooltipContent>
                  </Tooltip>
                )}
                {row.original.hasRecording && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label="Download Recording"
                        className="size-8 rounded-full border border-accent bg-accent p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-accent)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-accent)_75%,white)] hover:text-white"
                        onClick={() => handleDownload(row.original.id)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Download aria-hidden="true" className="size-4" strokeWidth={2.5} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Download Recording</TooltipContent>
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

  const { table } = useDataTable<AdminBatchClass, unknown>({
    data: classes,
    columns,
    pagination: serverTable.pagination,
    setPagination: serverTable.setPagination,
    sorting: serverTable.sorting,
    setSorting: serverTable.setSorting,
    pageCount,
    ...serverTable.manual
  });

  return (
    <div>
      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold text-primary-ink">
              Classes Management
            </p>
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight mt-2 text-app-text">
              Batch classes
            </h1>
          </div>
        </header>

        <Card className="grid gap-4 p-4">
          <DataTableToolbar
            actions={<ColumnVisibilityMenu table={table} />}
            filters={
              <Select
                className="w-40"
                onChange={(event) => serverTable.setStatus(event.target.value)}
                options={[{ label: "All Statuses", value: "ALL" }, ...statusOptions]}
                value={serverTable.status}
              />
            }
            onSearchChange={serverTable.setSearch}
            searchPlaceholder="Search batch classes..."
            searchValue={serverTable.search}
          />

          <DataTable
            columnsLength={columns.length}
            isLoading={isLoading}
            noDataText="No batch classes found."
            table={table}
          />

          <DataTablePagination
            table={table}
            totalRows={data?.pagination?.total ?? 0}
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

      <LiveClassMonitorDialog
        classId={monitorClassId}
        open={!!monitorClassId}
        onOpenChange={(open) => {
          if (!open) setMonitorClassId(null);
        }}
      />
    </div>
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

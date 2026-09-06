"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { History, Eye, Info, Download } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import type { CoachClass } from "@nexa-chess/types";
import { getRecordingDownloadUrl } from "@/features/live-class/api/live-class";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { DataTablePagination } from "@/components/ui/DataTablePagination";
import { DataTableSortButton } from "@/components/ui/DataTableSortButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useDataTable } from "../../../hooks/useDataTable";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip";
import { useClassHistory } from "../hooks/useCoachApi";
import { formatFullDate, formatTime } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { CoachClassDetailsDialog } from "./CoachClassDetailsDialog";

export function CoachHistoryClient() {
  const { data, isLoading } = useClassHistory();
  const tz = useUserTimeZone();
  const [detailsClassId, setDetailsClassId] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

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

  const columns = useMemo<ColumnDef<CoachClass>[]>(
    () => [
      {
        accessorKey: "date",
        header: ({ column }) => (
          <DataTableSortButton 
            label="Date & Time" 
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} 
          />
        ),
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">
              {formatFullDate(row.original.startsAt, tz)}
            </span>
            <span className="text-xs text-app-muted">
              {formatTime(row.original.startsAt, tz)}
            </span>
          </div>
        ),
        sortingFn: (a, b) => {
          return new Date(a.original.startsAt).getTime() - new Date(b.original.startsAt).getTime();
        }
      },
      {
        accessorKey: "batchName",
        header: ({ column }) => (
          <DataTableSortButton 
            label="Batch" 
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} 
          />
        ),
      },
      {
        accessorKey: "title",
        header: "Topic",
        cell: ({ row }) => {
          return (
            <span className="line-clamp-1 max-w-[200px]">
              {row.original.title || row.original.topic || "Regular Session"}
            </span>
          );
        }
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = row.original.status;
          const variant = status === "COMPLETED" ? "success" : status === "CANCELLED" ? "destructive" : "secondary";
          return (
            <Badge variant={variant} className="text-[10px]">
              {status}
            </Badge>
          );
        }
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <TooltipProvider>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild variant="outline" size="icon" className="size-8 rounded-full border-yellow-500 p-0 text-app-text transition-colors hover:border-yellow-500 hover:bg-yellow-500 hover:text-black">
                    <Link href={`/classes/${row.original.id}`} aria-label={`View ${row.original.title || row.original.topic}`}>
                      <Eye className="size-4" strokeWidth={2.5} aria-hidden="true" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View Class Page</TooltipContent>
              </Tooltip>

              {row.original.status === "COMPLETED" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label="View completed details"
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

              {row.original.hasRecording && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label="Download Recording"
                      className="size-8 rounded-full border-green-500 p-0 text-app-text transition-colors hover:border-green-500 hover:bg-green-500 hover:text-white"
                      onClick={() => handleDownload(row.original.id)}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      <Download aria-hidden="true" className="size-4" strokeWidth={2.5} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Download Recording</TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        )
      }
    ],
    [tz]
  );

  const { table } = useDataTable({
    data: data?.classes || [],
    columns,
    initialSorting: [{ id: "date", desc: true }]
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold text-app-text tracking-tight">Class History</h1>
        <p className="text-app-muted mt-1">Review your past and cancelled classes.</p>
      </div>

      <div className="rounded-app border border-app-border bg-app-surface shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-app-muted">Loading history...</div>
        ) : data?.classes?.length === 0 ? (
          <div className="p-6 sm:p-12">
            <EmptyState
              icon={History}
              title="No class history"
              description="You haven't completed or cancelled any classes yet."
            />
          </div>
        ) : (
          <>
            <DataTable columnsLength={columns.length} table={table as any} />
            <div className="border-t border-app-border p-4 bg-app-soft">
              <DataTablePagination table={table as any} totalRows={data?.classes.length || 0} />
            </div>
          </>
        )}
      </div>
      <CoachClassDetailsDialog
        classId={detailsClassId}
        isOpen={isDetailsOpen}
        onOpenChange={(open) => {
          setIsDetailsOpen(open);
          if (!open) setTimeout(() => setDetailsClassId(null), 300);
        }}
      />
    </div>
  );
}

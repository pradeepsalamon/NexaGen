"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, Eye, History, Info, NotebookPen } from "lucide-react";
import { toast } from "sonner";
import type { CoachClass } from "@nexa-chess/types";
import { getRecordingDownloadUrl } from "@/features/live-class/api/live-class";
import { openInNewTab } from "@/lib/openInNewTab";
import { PageHeader } from "@/components/layout/PageHeader";
import { ClassStatusBadge } from "@/components/ui/ClassStatusBadge";
import { DataTable } from "@/components/ui/DataTable";
import { DataTablePagination } from "@/components/ui/DataTablePagination";
import { DataTableSortButton } from "@/components/ui/DataTableSortButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { RowActions, type RowAction } from "@/components/ui/RowActions";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useDataTable } from "../../../hooks/useDataTable";
import { useClassHistory } from "../hooks/useCoachApi";
import { formatFullDate, formatTime } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { ClassNotesDialog } from "./ClassNotesDialog";
import { coachClassTitle } from "./CoachClassRow";
import { CoachClassDetailsDialog } from "./CoachClassDetailsDialog";

export function CoachHistoryClient() {
  const { data, error, isLoading, refetch } = useClassHistory();
  const tz = useUserTimeZone();
  const [detailsClassId, setDetailsClassId] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [notesClass, setNotesClass] = useState<CoachClass | null>(null);

  const handleDownload = async (classId: string) => {
    try {
      await openInNewTab(async () => (await getRecordingDownloadUrl(classId, { download: true }))?.url);
    } catch (error) {
      console.error("Failed to download recording:", error);
      toast.error("Failed to download recording. It may have expired or is unavailable.");
    }
  };

  const columns = useMemo<ColumnDef<CoachClass>[]>(
    () => [
      {
        accessorKey: "date", meta: { label: "Date & time" },
        header: ({ column }) => (
          <DataTableSortButton 
            label="Date & time" 
            column={column}
          />
        ),
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium text-app-text">
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
        accessorKey: "batchName", meta: { label: "Batch" },
        header: ({ column }) => (
          <DataTableSortButton 
            label="Batch" 
            column={column}
          />
        ),
      },
      {
        accessorKey: "title",
        header: "Class",
        meta: { label: "Class" },
        cell: ({ row }) => <span className="line-clamp-2 max-w-64">{coachClassTitle(row.original)}</span>
      },
      {
        accessorKey: "status",
        header: "Status",
        meta: { label: "Status" },
        // Completed, Cancelled, or Not held (scheduled but never started).
        cell: ({ row }) => (
          <ClassStatusBadge endsAt={row.original.endsAt} status={row.original.status} />
        )
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const cls = row.original;
          const title = coachClassTitle(cls);
          const actions: RowAction[] = [
            { ariaLabel: `View ${title}`, href: `/classes/${cls.id}`, icon: Eye, label: "View class page" }
          ];
          if (cls.status === "COMPLETED") {
            actions.push({
              ariaLabel: "View completed details",
              icon: Info,
              label: "Class summary",
              onSelect: () => {
                setDetailsClassId(cls.id);
                setIsDetailsOpen(true);
              }
            });
          }
          if (cls.status !== "CANCELLED") {
            actions.push({ ariaLabel: "Edit class notes", icon: NotebookPen, label: "Edit notes", onSelect: () => setNotesClass(cls) });
          }
          if (cls.hasRecording) {
            actions.push({
              ariaLabel: "Download recording",
              icon: Download,
              label: "Download recording",
              onSelect: () => void handleDownload(cls.id)
            });
          }
          return <RowActions actions={actions} />;
        }
      }
    ],
    [tz]
  );

  const { table } = useDataTable({
    data: data?.classes || [],
    columns
  });

  const classes = data?.classes ?? [];

  return (
    <div className="animate-fade-in pb-10">
      <PageHeader description="Your past and cancelled classes, with notes and recordings." title="Class history" />

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 rounded-app" />
          <Skeleton className="h-12 rounded-app" />
          <Skeleton className="h-12 rounded-app" />
        </div>
      ) : error ? (
        <WidgetError
          message="Couldn't load your class history. Check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : classes.length === 0 ? (
        <EmptyState
          description="Classes you've taught or that were cancelled will show up here."
          icon={History}
          title="No class history yet"
        />
      ) : (
        <div className="overflow-hidden rounded-app border border-app-border bg-app-surface shadow-card">
          <DataTable columnsLength={columns.length} stackOnMobile table={table} />
          <div className="border-t border-app-border p-4">
            <DataTablePagination table={table} totalRows={classes.length} />
          </div>
        </div>
      )}
      <ClassNotesDialog
        classItem={notesClass}
        open={notesClass !== null}
        onOpenChange={(open) => {
          if (!open) setNotesClass(null);
        }}
      />
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

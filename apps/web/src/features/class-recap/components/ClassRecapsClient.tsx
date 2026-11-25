"use client";

import { CLASS_RECAP_STATUS_LABELS, CLASS_RECAP_STATUSES, type ClassRecapListItem, type ClassRecapStatus } from "@nexa-chess/types";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { DataTablePagination } from "@/components/ui/DataTablePagination";
import { DataTableToolbar } from "@/components/ui/DataTableToolbar";
import { RowActions } from "@/components/ui/RowActions";
import { Select } from "@/components/ui/Select";
import { WidgetError } from "@/components/ui/WidgetError";
import { useDataTable } from "@/hooks/useDataTable";
import { useServerTable } from "@/hooks/useServerTable";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatLongDate } from "@/lib/datetime";
import { useClassRecapList } from "../hooks/useClassRecaps";
import { ClassRecapDialog } from "./ClassRecapDialog";
import { ClassRecapSettingsCard } from "./ClassRecapSettingsCard";
import { ClassRecapStatusBadge } from "./ClassRecapStatusBadge";

const STATUS_OPTIONS = [
  { label: "All recaps", value: "ALL" },
  ...CLASS_RECAP_STATUSES.map((status) => ({ label: CLASS_RECAP_STATUS_LABELS[status], value: status }))
];

/** Coach: recaps of their own classes. Admin: every class's, plus the academy's settings. */
export function ClassRecapsClient({ scope }: { scope: "admin" | "coach" }) {
  const timeZone = useUserTimeZone();
  const serverTable = useServerTable({ pageSize: 20 });
  const { clampToPageCount } = serverTable;
  const status = serverTable.status === "ALL" ? undefined : (serverTable.status as ClassRecapStatus);
  const { data, isError, isLoading, refetch } = useClassRecapList({
    page: serverTable.params.page ?? 1,
    pageSize: serverTable.params.pageSize ?? 20,
    search: serverTable.params.search || undefined,
    status
  });
  const [openClassId, setOpenClassId] = useState<string | null>(null);
  const rows = useMemo(() => data?.items ?? [], [data?.items]);
  const pageCount = data?.pagination.totalPages ?? 1;
  useEffect(() => {
    clampToPageCount(pageCount);
  }, [pageCount, clampToPageCount]);

  const columns = useMemo<ColumnDef<ClassRecapListItem>[]>(
    () => [
      {
        cell: ({ row }) => (
          <div className="min-w-40">
            <p className="font-semibold text-app-text">{row.original.class.topic}</p>
            {row.original.class.batchName ? <p className="text-xs text-app-muted">{row.original.class.batchName}</p> : null}
          </div>
        ),
        header: "Class",
        id: "class",
        meta: { label: "Class" }
      },
      {
        cell: ({ row }) => <span className="whitespace-nowrap text-sm text-app-text">{formatLongDate(row.original.class.startsAt, timeZone)}</span>,
        header: "Date",
        id: "date",
        meta: { label: "Date" }
      },
      ...(scope === "admin"
        ? [
            {
              cell: ({ row }) => <span className="text-sm text-app-text">{row.original.class.coachName}</span>,
              header: "Coach",
              id: "coach",
              meta: { label: "Coach" }
            } satisfies ColumnDef<ClassRecapListItem>
          ]
        : []),
      {
        cell: ({ row }) => <ClassRecapStatusBadge status={row.original.status} />,
        header: "Status",
        id: "status",
        meta: { label: "Status" }
      },
      {
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                ariaLabel: `Open the recap of ${row.original.class.topic}`,
                icon: Eye,
                label: row.original.status === "READY" ? "Review" : "Open",
                onSelect: () => setOpenClassId(row.original.class.classId)
              }
            ]}
          />
        ),
        header: () => <span className="sr-only">Actions</span>,
        id: "actions"
      }
    ],
    [scope, timeZone]
  );

  const { table } = useDataTable<ClassRecapListItem, unknown>({
    columns,
    data: rows,
    pageCount,
    pagination: serverTable.pagination,
    setPagination: serverTable.setPagination,
    setSorting: serverTable.setSorting,
    sorting: serverTable.sorting,
    ...serverTable.manual
  });

  return (
    <div className="space-y-6">
      <PageHeader
        description={
          scope === "admin"
            ? "AI drafts a short recap of each class from the coach's transcript. Review, edit and publish them for students."
            : "AI drafts a short recap of your classes from your transcript. Review, edit and publish them for your students."
        }
        title="Class recaps"
      />
      {scope === "admin" ? <ClassRecapSettingsCard /> : null}
      {isError ? (
        <WidgetError message="Class recaps couldn't be loaded." onRetry={() => void refetch()} />
      ) : (
        <Card className="grid gap-4 p-4">
          <DataTableToolbar
            filters={
              <Select
                aria-label="Filter by status"
                className="w-full sm:w-48"
                onChange={(event) => serverTable.setStatus(event.target.value)}
                options={STATUS_OPTIONS}
                value={serverTable.status}
              />
            }
            onSearchChange={serverTable.setSearch}
            searchPlaceholder="Search by topic..."
            searchValue={serverTable.search}
          />
          <DataTable
            columnsLength={columns.length}
            isLoading={isLoading}
            noDataText={
              status === "READY"
                ? "Nothing waiting for review."
                : "No recaps yet. They appear after classes that have a transcript."
            }
            stackOnMobile
            table={table}
          />
          <DataTablePagination table={table} totalRows={data?.pagination.total ?? 0} />
        </Card>
      )}
      <ClassRecapDialog classId={openClassId} onOpenChange={(open) => !open && setOpenClassId(null)} />
    </div>
  );
}

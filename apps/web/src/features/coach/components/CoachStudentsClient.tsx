"use client";

import { useMemo, useState, useEffect } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeftRight, Search, TrendingUp, Users } from "lucide-react";
import type { CoachStudent } from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { RowActions } from "@/components/ui/RowActions";
import { Skeleton } from "@/components/ui/Skeleton";
import { ChangeStudentBatchDialog } from "@/features/approvals/components/BatchStudentRequestDialogs";
import { DataTable } from "@/components/ui/DataTable";
import { DataTablePagination } from "@/components/ui/DataTablePagination";
import { DataTableSortButton } from "@/components/ui/DataTableSortButton";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { useDataTable } from "../../../hooks/useDataTable";
import { useCoachStudents, useCoachBatches } from "../hooks/useCoachApi";
import { enumLabel } from "@/lib/utils";

export function CoachStudentsClient({ initialBatchId }: { initialBatchId?: string }) {
  const { data: studentsData, isLoading: studentsLoading } = useCoachStudents();
  const { data: batchesData } = useCoachBatches();

  const [search, setSearch] = useState("");
  const [selectedBatch, setSelectedBatch] = useState<string>(initialBatchId || "ALL");
  const [changingBatch, setChangingBatch] = useState<CoachStudent | null>(null);

  // Sync state if navigating via Link with different search params
  useEffect(() => {
    setSelectedBatch(initialBatchId || "ALL");
  }, [initialBatchId]);

  const columns = useMemo<ColumnDef<CoachStudent>[]>(
    () => [
      {
        accessorKey: "name", meta: { label: "Name" },
        header: ({ column }) => (
          <DataTableSortButton 
            label="Name" 
            column={column}
          />
        ),
        cell: ({ row }) => {
          const student = row.original;
          const fullName = `${student.firstName} ${student.lastName || ""}`.trim();
          return (
            <div className="flex min-w-48 flex-col">
              <span className="font-semibold text-app-text">{fullName}</span>
              <span className="break-words text-xs text-app-muted">{student.email}</span>
            </div>
          );
        }
      },
      {
        accessorKey: "batches",
        header: "Batches",
        meta: { label: "Batches" },
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1">
            {row.original.batches.map((b) => (
              <Badge key={b.id} variant="secondary">
                {b.name}
              </Badge>
            ))}
          </div>
        )
      },
      {
        accessorKey: "chessRating", meta: { label: "Rating" },
        header: ({ column }) => (
          <DataTableSortButton 
            label="Rating" 
            column={column}
          />
        ),
        cell: ({ row }) => (
          <span className={row.original.chessRating ? "font-medium tabular-nums text-app-text" : "text-app-muted"}>
            {row.original.chessRating || "Unrated"}
          </span>
        )
      },
      {
        accessorKey: "status",
        header: "Status",
        meta: { label: "Status" },
        cell: ({ row }) => (
          <Badge
            variant={row.original.status === "ACTIVE" ? "success" : "secondary"}
          >
            {enumLabel(row.original.status)}
          </Badge>
        )
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const name = `${row.original.firstName} ${row.original.lastName || ""}`.trim();
          return (
            <RowActions
              actions={[
                {
                  ariaLabel: `View ${name}'s progress and activity history`,
                  href: `/coach/students/${row.original.id}`,
                  icon: TrendingUp,
                  label: "Progress & activity history"
                },
                {
                  ariaLabel: `Ask to move or remove ${name}`,
                  icon: ArrowLeftRight,
                  label: "Ask to move or remove",
                  onSelect: () => setChangingBatch(row.original)
                }
              ]}
            />
          );
        }
      }
    ],
    []
  );

  const filteredStudents = useMemo(() => {
    let result = studentsData?.students || [];

    if (search) {
      const lowerSearch = search.toLowerCase();
      result = result.filter(s => 
        s.firstName.toLowerCase().includes(lowerSearch) || 
        (s.lastName && s.lastName.toLowerCase().includes(lowerSearch)) ||
        s.email.toLowerCase().includes(lowerSearch)
      );
    }

    if (selectedBatch !== "ALL") {
      result = result.filter(s => s.batches.some(b => b.id === selectedBatch));
    }

    return result;
  }, [studentsData, search, selectedBatch]);

  const { table } = useDataTable({
    data: filteredStudents,
    columns
  });

  const batchOptions = [
    { label: "All batches", value: "ALL" },
    ...(batchesData?.batches.map((b) => ({ label: b.name, value: b.id })) || [])
  ];

  return (
    <div className="animate-fade-in pb-10">
      <PageHeader description="Every student in the batches you teach." title="Students" />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <div className="w-full sm:w-64">
          <Input
            aria-label="Search students"
            leadingIcon={<Search aria-hidden="true" className="size-4" strokeWidth={2.25} />}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email"
            value={search}
          />
        </div>
        <div className="w-full sm:w-56">
          <Select
            aria-label="Filter by batch"
            onChange={(e) => setSelectedBatch(e.target.value)}
            options={batchOptions}
            value={selectedBatch}
          />
        </div>
      </div>

      {studentsLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 rounded-app" />
          <Skeleton className="h-12 rounded-app" />
          <Skeleton className="h-12 rounded-app" />
        </div>
      ) : filteredStudents.length === 0 ? (
        <EmptyState
          description={
            search || selectedBatch !== "ALL"
              ? "Try another name or all batches."
              : "Students appear here once an admin adds them to one of your batches."
          }
          icon={Users}
          title={search || selectedBatch !== "ALL" ? "No students match" : "No students yet"}
        />
      ) : (
        <div className="overflow-hidden rounded-app border border-app-border bg-app-surface shadow-card">
          <DataTable columnsLength={columns.length} stackOnMobile table={table} />
          <div className="border-t border-app-border p-4">
            <DataTablePagination table={table} totalRows={filteredStudents.length} />
          </div>
        </div>
      )}

      <ChangeStudentBatchDialog
        batches={batchesData?.batches ?? []}
        onClose={() => setChangingBatch(null)}
        student={changingBatch}
      />
    </div>
  );
}

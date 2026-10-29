"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { TrendingUp, Users } from "lucide-react";
import type { CoachStudent } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SimpleTooltip } from "@/components/ui/Tooltip";
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
            <div className="flex flex-col">
              <span className="font-medium">{fullName}</span>
              <span className="text-xs text-app-muted">{student.email}</span>
            </div>
          );
        }
      },
      {
        accessorKey: "batches",
        header: "Batches",
        cell: ({ row }) => {
          const batches = row.original.batches;
          return (
            <div className="flex flex-wrap gap-1 justify-center items-center">
              {batches.map(b => (
                <Badge key={b.id} variant="secondary" className="">
                  {b.name}
                </Badge>
              ))}
            </div>
          );
        }
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
          <span className="font-medium">
            {row.original.chessRating || "Unrated"}
          </span>
        )
      },
      {
        accessorKey: "status",
        header: "Status",
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
        header: "Actions",
        cell: ({ row }) => {
          const name = `${row.original.firstName} ${row.original.lastName || ""}`.trim();
          return (
            <SimpleTooltip label="Progress & activity history">
              <Button
                asChild
                className="size-8 rounded-full border border-primary bg-primary p-0 text-on-primary shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-on-primary"
                size="icon"
                variant="ghost"
              >
                <Link aria-label={`View ${name}'s progress and activity history`} href={`/coach/students/${row.original.id}`}>
                  <TrendingUp aria-hidden="true" className="size-4" strokeWidth={2.5} />
                </Link>
              </Button>
            </SimpleTooltip>
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">Students</h1>
        <p className="text-app-muted mt-1">View and search for students across your assigned batches.</p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Input
          placeholder="Search students..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={selectedBatch}
          onChange={(e) => setSelectedBatch(e.target.value)}
          options={[
            { label: "All Batches", value: "ALL" },
            ...(batchesData?.batches.map(b => ({ label: b.name, value: b.id })) || [])
          ]}
          className="w-full sm:w-[200px]"
        />
      </div>

      <div className="rounded-app border border-app-border bg-app-surface shadow-card overflow-hidden">
        {studentsLoading ? (
          <div className="p-8 text-center text-app-muted">Loading students...</div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-6 sm:p-12">
            <EmptyState
              icon={Users}
              title="No students found"
              description="There are no students matching your current filters."
            />
          </div>
        ) : (
          <>
            <DataTable columnsLength={columns.length} stackOnMobile table={table as any} />
            <div className="border-t border-app-border p-4 bg-app-soft">
              <DataTablePagination table={table as any} totalRows={filteredStudents.length} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

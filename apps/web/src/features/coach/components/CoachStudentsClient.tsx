"use client";

import { useMemo, useState, useEffect } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Users } from "lucide-react";
import type { CoachStudent } from "@nexa-gen/types";
import { Badge } from "../../../components/ui/Badge";
import { DataTable } from "../../../components/ui/DataTable";
import { DataTablePagination } from "../../../components/ui/DataTablePagination";
import { DataTableSortButton } from "../../../components/ui/DataTableSortButton";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { EmptyState } from "../../../components/ui/EmptyState";
import { useDataTable } from "../../../hooks/useDataTable";
import { useCoachStudents, useCoachBatches } from "../hooks/useCoachApi";

export function CoachStudentsClient({ initialBatchId }: { initialBatchId?: string }) {
  const { data: studentsData, isLoading: studentsLoading } = useCoachStudents();
  const { data: batchesData } = useCoachBatches();

  const [search, setSearch] = useState("");
  const [selectedBatch, setSelectedBatch] = useState<string>(initialBatchId || "ALL");

  // Sync state if navigating via Link with different search params
  useEffect(() => {
    if (initialBatchId) {
      setSelectedBatch(initialBatchId);
    }
  }, [initialBatchId]);

  const columns = useMemo<ColumnDef<CoachStudent>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableSortButton 
            label="First Name" 
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} 
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
        accessorKey: "chessRating",
        header: ({ column }) => (
          <DataTableSortButton 
            label="Rating" 
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} 
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
            {row.original.status}
          </Badge>
        )
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
        <h1 className="text-2xl font-extrabold text-app-text tracking-tight">Students</h1>
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
          <div className="p-12">
            <EmptyState
              icon={Users}
              title="No students found"
              description="There are no students matching your current filters."
            />
          </div>
        ) : (
          <>
            <DataTable columnsLength={columns.length} table={table as any} />
            <div className="border-t border-app-border p-4 bg-app-soft">
              <DataTablePagination table={table as any} totalRows={filteredStudents.length} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

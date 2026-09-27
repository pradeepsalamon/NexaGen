"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RowSelectionState } from "@tanstack/react-table";
import {
  Archive,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Trash2,
  UsersRound
} from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { Batch, BatchUserSummary } from "@nexa-chess/types";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/DropdownMenu";
import { Select } from "@/components/ui/Select";
import { DataTable } from "@/components/ui/DataTable";
import { DataTablePagination } from "@/components/ui/DataTablePagination";
import { DataTableToolbar } from "@/components/ui/DataTableToolbar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { BulkActionsBar } from "@/components/ui/BulkActionsBar";
import { RowActions } from "@/components/ui/RowActions";
import { DataTableSortButton } from "@/components/ui/DataTableSortButton";
import { BulkResultDialog } from "@/components/common/BulkResultDialog";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { useBulkAction } from "@/hooks/useBulkAction";
import { useDataTable } from "@/hooks/useDataTable";
import { useServerTable } from "@/hooks/useServerTable";
import { queryKeys } from "@/lib/queryKeys";

import { BatchForm } from "./BatchForm";
import { BatchStatusBadge } from "./BatchStatusBadge";
import { BatchSettings } from "./BatchSettings";
import {
  useBatchesQuery
} from "../hooks/useBatchesApi";
import { archiveBatch, restoreBatch, deleteBatch } from "../api/batchApi";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { restoreTrashItem } from "@/features/trash/api/trashApi";

type BatchManagementTab = "all" | "create" | "settings";

const statusOptions = [
  { label: "Upcoming", value: "UPCOMING" },
  { label: "Active", value: "ACTIVE" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Archived", value: "ARCHIVED" }
];

export function BatchManagementClient() {
  const [activeTab, setActiveTab] = useState<BatchManagementTab>("all");
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);

  // Server-side pagination / search / sort / status filter (AUDIT H26).
  const serverTable = useServerTable({ pageSize: 10 });
  const { clampToPageCount } = serverTable;
  const batchesQuery = useBatchesQuery(serverTable.params);
  const pageCount = batchesQuery.data?.pagination?.totalPages ?? 1;
  useEffect(() => {
    clampToPageCount(pageCount);
  }, [pageCount, clampToPageCount]);
  const { run: handleArchive, isPending: isArchiving } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: (id: string) => archiveBatch(id),
    undo: (id) => restoreBatch(id),
    toast: () => ({ title: "Batch archived" }),
    invalidates: [queryKeys.batches.all, queryKeys.trash.all]
  });

  const { run: handleRestore, isPending: isRestoring } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: (id: string) => restoreBatch(id),
    undo: (id) => archiveBatch(id),
    toast: () => ({ title: "Batch unarchived" }),
    invalidates: [queryKeys.batches.all, queryKeys.trash.all]
  });

  const { run: handleDelete, isPending: isDeleting } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: (id: string) => deleteBatch(id),
    undo: (id) => restoreTrashItem("Batch", id),
    toast: () => ({ title: "Batch deleted" }),
    invalidates: [queryKeys.batches.all, queryKeys.trash.all]
  });

  const selectedBatch = useMemo(
    () =>
      batchesQuery.data?.batches.find((batch) => batch.id === editingBatchId) ??
      null,
    [batchesQuery.data?.batches, editingBatchId]
  );

  const batches = batchesQuery.data?.batches ?? [];

  // Row selection is owned here so the row handlers below can clear it while
  // still being referenced by `columns`, which the table needs up front.
  // See AUDIT.md H4.
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const bulk = useBulkAction<Batch>({
    invalidates: [queryKeys.batches.all, queryKeys.trash.all],
    labelOf: (batch) => batch.name
  });
  const [bulkConfirm, setBulkConfirm] = useState<"archive" | "delete" | null>(null);

  const editBatch = useCallback((batch: Batch) => {
    setEditingBatchId(batch.id);
    setActiveTab("create");
  }, []);

  function handleNewBatch() {
    setEditingBatchId(null);
    setActiveTab("create");
  }



  const columns = useMemo<ColumnDef<Batch>[]>(
    () => [
      {
        id: "select",
        enableHiding: false,
        enableSorting: false,
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all rows"
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(checked) =>
              table.toggleAllPageRowsSelected(!!checked)
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Select ${row.original.name}`}
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(!!checked)}
          />
        )
      },
      {
        accessorKey: "name",
        enableColumnFilter: true,
        header: ({ column }) => (
          <DataTableSortButton
            label="Name"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-52">
            <p className="font-extrabold text-app-text">{row.original.name}</p>
            {row.original.description && (
              <p className="mt-1 line-clamp-2 text-xs text-app-muted">
                {row.original.description}
              </p>
            )}
          </div>
        )
      },
      {
        accessorKey: "startsAt",
        enableColumnFilter: true,
        header: ({ column }) => (
          <DataTableSortButton
            label="Date range"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-48 text-sm text-app-text">
            <div>
              <span className="font-semibold">From: </span>
              {formatDate(row.original.startsAt)}
            </div>
            {row.original.endsAt && (
              <div className="mt-1">
                <span className="font-semibold">To: </span>
                {formatDate(row.original.endsAt)}
              </div>
            )}
          </div>
        )
      },
      {
        accessorKey: "scheduleNotes",
        enableColumnFilter: true,
        header: ({ column }) => (
          <DataTableSortButton
            label="Schedule"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-40 text-sm text-app-text">
            {row.original.scheduleNotes || (
              <span className="italic text-app-muted">Not specified</span>
            )}
          </div>
        )
      },
      {
        id: "coachCount",
        header: "Coaches",
        cell: ({ row }) => (
          <UserSummary
            count={row.original.coachCount}
            users={row.original.coaches}
          />
        )
      },
      {
        id: "studentCount",
        header: "Students",
        cell: ({ row }) => (
          <UserSummary
            count={row.original.studentCount}
            users={row.original.students}
          />
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
        cell: ({ row }) => (
          <BatchStatusBadge status={row.original.status} />
        )
      },
      {
        id: "actions",
        enableHiding: false,
        enableSorting: false,
        header: "Actions",
        cell: ({ row }) => {
          const isArchived = row.original.status === "ARCHIVED";
          const name = row.original.name;
          return (
            <RowActions
              actions={[
                {
                  ariaLabel: `Edit ${name}`,
                  icon: Pencil,
                  label: "Edit batch",
                  onSelect: () => editBatch(row.original)
                },
                {
                  ariaLabel: isArchived ? `Unarchive ${name}` : `Archive ${name}`,
                  disabled: isArchiving || isRestoring,
                  icon: isArchived ? RotateCcw : Archive,
                  label: isArchived ? "Unarchive batch" : "Archive batch",
                  onSelect: () =>
                    isArchived ? handleRestore(row.original.id) : handleArchive(row.original.id),
                  tone: "warning"
                },
                {
                  ariaLabel: `Delete ${name}`,
                  disabled: isDeleting,
                  icon: Trash2,
                  label: "Delete batch",
                  onSelect: () => handleDelete(row.original.id),
                  tone: "danger"
                }
              ]}
            />
          );
        }
      }
    ],
    [
      isArchiving,
      isDeleting,
      editBatch,
      handleArchive,
      handleDelete,
      handleRestore,
      isRestoring
    ]
  );

  const {
    table,
    columnVisibility,
    setColumnVisibility,
    setColumnFilters
  } = useDataTable<Batch, unknown>({
    columns,
    data: batches,
    rowSelection,
    setRowSelection,
    pagination: serverTable.pagination,
    setPagination: serverTable.setPagination,
    sorting: serverTable.sorting,
    setSorting: serverTable.setSorting,
    pageCount,
    ...serverTable.manual
  });

  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);

  // undo: intentionally excluded — bulk ops confirm first and report per-row results; deleted rows restore from Trash
  const runBulk = async (kind: "archive" | "delete") => {
    await bulk.run(kind === "archive" ? "Archive" : "Delete", selectedRows, (batch) =>
      kind === "archive" ? archiveBatch(batch.id) : deleteBatch(batch.id)
    );
    setBulkConfirm(null);
    setRowSelection({});
  };

  return (
    <main className="min-h-[calc(100vh-64px)] bg-app-background px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-5">
        <Tabs
          onValueChange={(value) => {
            if (value === "create") {
              handleNewBatch();
            } else {
              setEditingBatchId(null);
              setActiveTab(value as BatchManagementTab);
            }
          }}
          value={activeTab}
        >
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase text-primary-ink">
                Batch management
              </p>
              <h1 className="text-2xl font-extrabold leading-tight tracking-tight mt-2 text-app-text">
                Batches
              </h1>
            </div>
            <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
              <TabsTrigger value="all">
                <UsersRound aria-hidden="true" className="size-4" />
                All Batches
              </TabsTrigger>
              <TabsTrigger value="create">
                {editingBatchId ? (
                  <Pencil aria-hidden="true" className="size-4" />
                ) : (
                  <Plus aria-hidden="true" className="size-4" />
                )}
                {editingBatchId ? "Edit" : "Create"}
              </TabsTrigger>
              <TabsTrigger value="settings">
                <Settings2 aria-hidden="true" className="size-4" />
                Settings
              </TabsTrigger>
            </TabsList>
          </header>

          <TabsContent value="all" className="mt-6 outline-none">
            <Card className="grid gap-4 p-4">
              <DataTableToolbar
                actions={<ColumnVisibilityMenu table={table} />}
                filters={
                  <Select
                    className="w-40"
                    onChange={(event) => serverTable.setStatus(event.target.value)}
                    options={[{ label: "All status", value: "ALL" }, ...statusOptions]}
                    value={serverTable.status}
                  />
                }
                onSearchChange={serverTable.setSearch}
                searchPlaceholder="Search batches..."
                searchValue={serverTable.search}
              />

              <DataTable
                columnsLength={columns.length}
                isLoading={batchesQuery.isLoading}
                noDataText={
                  <div className="flex flex-col items-center justify-center space-y-4 py-4">
                    <p>No batches found.</p>
                    <Button onClick={handleNewBatch} size="sm">
                      <Plus className="mr-2 size-4" /> Create Batch
                    </Button>
                  </div>
                }
                table={table}
              />

              <DataTablePagination
                table={table}
                totalRows={batchesQuery.data?.pagination?.total ?? 0}
              />

              <BulkActionsBar
                actions={[
                  { disabled: bulk.isPending, icon: Archive, label: "Archive", onSelect: () => setBulkConfirm("archive") },
                  { disabled: bulk.isPending, icon: Trash2, label: "Delete", onSelect: () => setBulkConfirm("delete"), tone: "danger" }
                ]}
                count={selectedRows.length}
                noun="batch"
                onClear={() => setRowSelection({})}
              />
              <ConfirmationModal
                confirmLabel={bulkConfirm === "delete" ? "Delete" : "Archive"}
                icon={bulkConfirm === "delete" ? Trash2 : Archive}
                isConfirming={bulk.isPending}
                isOpen={bulkConfirm !== null}
                onCancel={() => setBulkConfirm(null)}
                onConfirm={() => bulkConfirm && runBulk(bulkConfirm)}
                title={`${bulkConfirm === "delete" ? "Delete" : "Archive"} ${selectedRows.length} batch${selectedRows.length === 1 ? "" : "es"}?`}
              >
                {bulkConfirm === "delete"
                  ? "Deleted batches move to Trash and can be restored from there."
                  : "Archived batches are hidden from active lists and can be unarchived later."}
              </ConfirmationModal>
              <BulkResultDialog onClose={bulk.clearResult} result={bulk.result} />
            </Card>
          </TabsContent>

          <TabsContent value="create" className="mt-6 outline-none">
            <BatchForm
              key={editingBatchId ?? "new"}
              selectedBatch={selectedBatch}
              onSuccess={() => setActiveTab("all")}
            />
          </TabsContent>

          <TabsContent value="settings" className="mt-6 outline-none">
            <BatchSettings
              columnVisibility={columnVisibility}
              pageSize={serverTable.pagination.pageSize}
              resetTable={() => {
                serverTable.setSearch("");
                serverTable.setStatus("ALL");
                serverTable.setSorting([]);
                setColumnFilters([]);
                setColumnVisibility({});
                setRowSelection({});
                serverTable.setPagination({ pageIndex: 0, pageSize: 10 });
              }}
              setColumnVisibility={setColumnVisibility}
              setPageSize={(pageSize) =>
                serverTable.setPagination((current) => ({ ...current, pageIndex: 0, pageSize }))
              }
            />
          </TabsContent>
        </Tabs>
      </div>
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

function UserSummary({ count, users }: { count: number; users: BatchUserSummary[] }) {
  return (
    <div className="min-w-32">
      <p className="font-extrabold text-app-text">{count}</p>
      <p className="mt-1 line-clamp-1 text-xs text-app-muted">
        {users.map(formatUserName).join(", ") || "Unassigned"}
      </p>
    </div>
  );
}

function formatUserName(user: BatchUserSummary) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
}

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  
  // Create a UTC date from the ISO date string to avoid timezone shifts
  const date = new Date(value);
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC"
  }).format(date);
}

function formatColumnLabel(columnId: string) {
  const labels: Record<string, string> = {
    coachCount: "Coaches",
    name: "Batch",
    scheduleNotes: "Schedule",
    startsAt: "Starts",
    status: "Status",
    studentCount: "Students"
  };
  return labels[columnId] ?? columnId;
}

"use client";

import { useCallback, useMemo, useState } from "react";
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
import type { ColumnDef, VisibilityState } from "@tanstack/react-table";
import type { Batch, BatchStatus, BatchUserSummary } from "@nexa-gen/types";

import { useToast } from "@/providers/ToastProvider";
import { Badge } from "@/components/ui/Badge";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip";
import { DataTableSortButton } from "@/components/ui/DataTableSortButton";
import { useDataTable } from "@/hooks/useDataTable";
import { queryKeys } from "@/lib/queryKeys";
import { useRestoreTrashItemMutation } from "@/features/trash/hooks/useTrashApi";
import { useQueryClient } from "@tanstack/react-query";

import { BatchForm } from "./BatchForm";
import { BatchSettings } from "./BatchSettings";
import {
  useArchiveBatchMutation,
  useBatchesQuery,
  useCreateBatchMutation,
  useDeleteBatchMutation,
  useRestoreBatchMutation,
  useUpdateBatchMutation
} from "../hooks/useBatchesApi";

type BatchManagementTab = "all" | "create" | "settings";

const statusOptions = [
  { label: "Upcoming", value: "UPCOMING" },
  { label: "Active", value: "ACTIVE" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Archived", value: "ARCHIVED" }
];

export function BatchManagementClient() {
  const { showToast, error, success, info } = useToast();

  const [activeTab, setActiveTab] = useState<BatchManagementTab>("all");
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  
  const [statusFilter, setStatusFilter] = useState("ALL");
  
  const batchesQuery = useBatchesQuery();
  const updateMutation = useUpdateBatchMutation();
  const deleteMutation = useDeleteBatchMutation();
  const archiveMutation = useArchiveBatchMutation();
  const restoreMutation = useRestoreBatchMutation();
  const restoreTrashItemMutation = useRestoreTrashItemMutation();
  const queryClient = useQueryClient();

  const selectedBatch = useMemo(
    () =>
      batchesQuery.data?.batches.find((batch) => batch.id === editingBatchId) ??
      null,
    [batchesQuery.data?.batches, editingBatchId]
  );

  const filteredBatches = useMemo(() => {
    const batches = batchesQuery.data?.batches ?? [];
    return statusFilter === "ALL"
      ? batches
      : batches.filter((batch) => batch.status === statusFilter);
  }, [batchesQuery.data?.batches, statusFilter]);

  const {
    table,
    globalFilter,
    setGlobalFilter,
    columnVisibility,
    setColumnVisibility,
    pagination,
    setPagination,
    setRowSelection,
    setSorting,
    setColumnFilters
  } = useDataTable<Batch, unknown>({
    columns: [],
    data: filteredBatches,
    initialPagination: { pageIndex: 0, pageSize: 10 }
  });

  const editBatch = useCallback((batch: Batch) => {
    setEditingBatchId(batch.id);
    setActiveTab("create");
  }, []);

  function handleNewBatch() {
    setEditingBatchId(null);
    setActiveTab("create");
  }

  const handleArchive = useCallback((id: string, isUndo?: boolean) => {
    archiveMutation.mutate({ id, isUndo }, {
      onSuccess: () => {
        setRowSelection({});
        showToast({
          type: isUndo ? "info" : "success",
          title: isUndo ? "Action undone." : "Batch archived",
          durationMs: 5000,
          ...(isUndo ? {} : {
            action: {
              label: "Undo",
              onClick: () => {
                restoreMutation.mutate(
                  { id, isUndo: true },
                  {
                    onError: () => error({ title: "Failed to undo archive" }),
                    onSuccess: () => info({ title: "Action undone." })
                  }
                );
              }
            }
          })
        });
      },
      onError: () => error({ title: "Failed to archive batch" })
    });
  }, [archiveMutation, error, info, restoreMutation, setRowSelection, showToast]);

  const handleRestore = useCallback((id: string, isUndo?: boolean) => {
    restoreMutation.mutate({ id, isUndo }, {
      onSuccess: () => {
        showToast({
          type: isUndo ? "info" : "success",
          title: isUndo ? "Action undone." : "Batch unarchived",
          durationMs: 5000,
          ...(isUndo ? {} : {
            action: {
              label: "Undo",
              onClick: () => {
                archiveMutation.mutate(
                  { id, isUndo: true },
                  {
                    onError: () => error({ title: "Failed to undo unarchive" }),
                    onSuccess: () => info({ title: "Action undone." })
                  }
                );
              }
            }
          })
        });
      },
      onError: () => error({ title: "Failed to unarchive batch" })
    });
  }, [archiveMutation, error, info, restoreMutation, showToast]);

  const handleDelete = useCallback((id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        setRowSelection({});
        success({
          title: "Batch deleted",
          action: {
              label: "Undo",
              onClick: () => {
                restoreTrashItemMutation.mutate(
                { entity: "Batch", id },
                {
                  onSuccess: () => {
                    info({ title: "Action undone." });
                    queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
                  },
                  onError: () => error({ title: "Failed to undo delete" })
                }
              );
            }
          }
        });
      },
      onError: () => error({ title: "Failed to delete batch" })
    });
  }, [
    deleteMutation,
    error,
    info,
    queryClient,
    restoreTrashItemMutation,
    setRowSelection,
    success
  ]);

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
          <Badge variant={getStatusBadgeVariant(row.original.status)}>
            {formatStatus(row.original.status)}
          </Badge>
        )
      },
      {
        id: "actions",
        enableHiding: false,
        enableSorting: false,
        header: "Actions",
        cell: ({ row }) => {
          const isArchived = row.original.status === "ARCHIVED";
          return (
            <TooltipProvider>
              <div className="flex items-center gap-2 justify-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={`Edit ${row.original.name}`}
                      className="size-8 rounded-full border-primary p-0 text-app-text transition-colors hover:border-primary hover:bg-primary hover:text-white"
                      onClick={() => editBatch(row.original)}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      <Pencil aria-hidden="true" className="size-4" strokeWidth={2.5} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit batch</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={isArchived ? `Unarchive ${row.original.name}` : `Archive ${row.original.name}`}
                      className="size-8 rounded-full border-secondary p-0 text-app-text transition-colors hover:border-secondary hover:bg-secondary hover:text-black"
                      disabled={archiveMutation.isPending || restoreMutation.isPending}
                      onClick={() => isArchived ? handleRestore(row.original.id) : handleArchive(row.original.id)}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      {isArchived ? (
                        <RotateCcw aria-hidden="true" className="size-4" strokeWidth={2.5} />
                      ) : (
                        <Archive aria-hidden="true" className="size-4" strokeWidth={2.5} />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isArchived ? "Unarchive batch" : "Archive batch"}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={`Delete ${row.original.name}`}
                      className="size-8 rounded-full border-app-danger p-0 text-app-text transition-colors hover:border-app-danger hover:bg-app-danger hover:text-white"
                      disabled={deleteMutation.isPending}
                      onClick={() => handleDelete(row.original.id)}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      <Trash2 aria-hidden="true" className="size-4" strokeWidth={2.5} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete batch</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          );
        }
      }
    ],
    [
      archiveMutation.isPending,
      deleteMutation.isPending,
      editBatch,
      handleArchive,
      handleDelete,
      handleRestore,
      restoreMutation.isPending
    ]
  );

  table.setOptions((prev) => ({
    ...prev,
    data: filteredBatches,
    columns,
  }));

  return (
    <main className="min-h-[calc(100vh-64px)] bg-app-background px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-5">
        <Tabs
          onValueChange={(value) => {
            if (value === "create") {
              handleNewBatch();
            } else {
              setActiveTab(value as BatchManagementTab);
            }
          }}
          value={activeTab}
        >
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase text-primary">
                Batch management
              </p>
              <h1 className="mt-2 text-3xl font-extrabold leading-tight text-app-text">
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
                    onChange={(event) => setStatusFilter(event.target.value)}
                    options={[{ label: "All status", value: "ALL" }, ...statusOptions]}
                    value={statusFilter}
                  />
                }
                onSearchChange={setGlobalFilter}
                searchPlaceholder="Filter batches..."
                searchValue={globalFilter}
              />

              <DataTable
                columnsLength={columns.length}
                isLoading={batchesQuery.isLoading}
                noDataText="No batches found."
                table={table}
              />

              <DataTablePagination
                table={table}
                totalRows={table.getFilteredRowModel().rows.length}
              />
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
              pageSize={pagination.pageSize}
              resetTable={() => {
                setGlobalFilter("");
                setStatusFilter("ALL");
                setSorting([]);
                setColumnFilters([]);
                setColumnVisibility({});
                setRowSelection({});
                setPagination({ pageIndex: 0, pageSize: 10 });
              }}
              setColumnVisibility={setColumnVisibility}
              setPageSize={(pageSize) =>
                setPagination((current) => ({ ...current, pageIndex: 0, pageSize }))
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

function formatStatus(status: BatchStatus) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function getStatusBadgeVariant(status: BatchStatus) {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "UPCOMING":
      return "warning";
    case "COMPLETED":
      return "secondary";
    case "ARCHIVED":
    default:
      return "default";
  }
}

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
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

"use client";

import {
  Archive,
  ChevronsUpDown,
  ListFilter,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Trash2,
  SlidersHorizontal,
  UsersRound
} from "lucide-react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  useReactTable
} from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Batch,
  BatchStatus,
  BatchUserSummary,
  CreateBatchRequest
} from "@nexa-gen/types";
import { type FormEvent, useMemo, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/Tooltip";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/DropdownMenu";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { DataTable } from "@/components/ui/DataTable";
import { DataTablePagination } from "@/components/ui/DataTablePagination";
import { DataTableToolbar } from "@/components/ui/DataTableToolbar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/Table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/providers/ToastProvider";
import {
  archiveBatch,
  createBatch,
  deleteBatch,
  getAssignableBatchUsers,
  listBatches,
  restoreBatch,
  updateBatch
} from "../api/batchApi";
import { restoreTrashItem } from "../../trash/api/trashApi";

type BatchFormState = {
  coachIds: string[];
  description: string;
  endsAt: string;
  name: string;
  scheduleNotes: string;
  startsAt: string;
  status: BatchStatus;
  studentIds: string[];
};

type BatchManagementTab = "all" | "create" | "settings";

const defaultFormState: BatchFormState = {
  coachIds: [],
  description: "",
  endsAt: "",
  name: "",
  scheduleNotes: "",
  startsAt: "",
  status: "ACTIVE",
  studentIds: []
};

const statusOptions = [
  { label: "Upcoming", value: "UPCOMING" },
  { label: "Active", value: "ACTIVE" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Archived", value: "ARCHIVED" }
];

const pageSizeOptions = [5, 10, 20, 50].map((value) => ({
  label: `${value} rows`,
  value: String(value)
}));

export function BatchManagementClient() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<BatchManagementTab>("all");
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [formState, setFormState] = useState<BatchFormState>(defaultFormState);
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10
  });

  const batchesQuery = useQuery({
    queryFn: listBatches,
    queryKey: ["batches"]
  });
  const assignableUsersQuery = useQuery({
    queryFn: getAssignableBatchUsers,
    queryKey: ["batches", "assignable-users"]
  });

  const selectedBatch = useMemo(
    () =>
      batchesQuery.data?.batches.find((batch) => batch.id === editingBatchId) ??
      null,
    [batchesQuery.data?.batches, editingBatchId]
  );

  const saveMutation = useMutation({
    mutationFn: (payload: CreateBatchRequest) =>
      editingBatchId
        ? updateBatch(editingBatchId, payload)
        : createBatch(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["batches"] });
      resetForm();
      setActiveTab("all");
    }
  });

  const archiveMutation = useMutation({
    mutationFn: archiveBatch,
    onMutate: async (batchId) => {
      await queryClient.cancelQueries({ queryKey: ["batches"] });
      const previousBatches = queryClient.getQueryData<{ batches: Batch[] }>(["batches"]);

      if (previousBatches) {
        queryClient.setQueryData<{ batches: Batch[] }>(["batches"], {
          ...previousBatches,
          batches: previousBatches.batches.map((batch) =>
            batch.id === batchId ? { ...batch, status: "ARCHIVED" } : batch
          )
        });
      }
      return { previousBatches };
    },
    onError: (error, batchId, context) => {
      if (context?.previousBatches) {
        queryClient.setQueryData(["batches"], context.previousBatches);
      }
      toast.error({
        title: "Failed to archive batch"
      });
    },
    onSuccess: (data, batchId) => {
      toast.showToast({
        type: "success",
        title: "Batch archived",
        durationMs: 5000,
        action: {
          label: "Undo",
          onClick: () => {
            restoreMutation.mutate(batchId);
          }
        }
      });
      setRowSelection({});
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
    }
  });

  const undeleteMutation = useMutation({
    mutationFn: (batchId: string) => restoreTrashItem("Batch", batchId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["batches"] });
      toast.success({ title: "Batch restored from trash" });
    },
    onError: () => {
      toast.error({ title: "Failed to restore batch" });
    }
  });

  const restoreMutation = useMutation({
    mutationFn: restoreBatch,
    onSuccess: async (data, batchId) => {
      await queryClient.invalidateQueries({ queryKey: ["batches"] });
      toast.showToast({
        type: "success",
        title: "Batch unarchived",
        durationMs: 5000,
        action: {
          label: "Undo",
          onClick: () => {
            archiveMutation.mutate(batchId);
          }
        }
      });
    },
    onError: (error) => {
      toast.error({
        title: "Failed to unarchive batch"
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBatch,
    onSuccess: async (data, batchId) => {
      await queryClient.invalidateQueries({ queryKey: ["batches"] });
      setRowSelection({});
      toast.showToast({
        type: "warning",
        title: "Batch moved to trash",
        durationMs: 5000,
        action: {
          label: "Undo",
          onClick: () => {
            undeleteMutation.mutate(batchId);
          }
        }
      });
    },
    onError: () => {
      toast.error({ title: "Failed to delete batch" });
    }
  });

  const filteredBatches = useMemo(
    () => {
      const batches = batchesQuery.data?.batches ?? [];

      return statusFilter === "ALL"
        ? batches
        : batches.filter((batch) => batch.status === statusFilter);
    },
    [batchesQuery.data?.batches, statusFilter]
  );
  const coaches = assignableUsersQuery.data?.coaches ?? [];
  const students = assignableUsersQuery.data?.students ?? [];

  function resetForm() {
    setEditingBatchId(null);
    setFormState(defaultFormState);
  }

  function editBatch(batch: Batch) {
    setEditingBatchId(batch.id);
    setFormState({
      coachIds: batch.coaches.map((coach) => coach.id),
      description: batch.description ?? "",
      endsAt: toDateTimeInputValue(batch.endsAt),
      name: batch.name,
      scheduleNotes: batch.scheduleNotes ?? "",
      startsAt: toDateTimeInputValue(batch.startsAt),
      status: batch.status,
      studentIds: batch.students.map((student) => student.id)
    });
    setActiveTab("create");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = {
      coachIds: formState.coachIds,
      description: formState.description || undefined,
      endsAt: toIsoDateTime(formState.endsAt),
      name: formState.name,
      scheduleNotes: formState.scheduleNotes || undefined,
      startsAt: toIsoDateTime(formState.startsAt),
      status: formState.status,
      studentIds: formState.studentIds
    };

    toast.promise(saveMutation.mutateAsync(payload), {
      loading: editingBatchId ? "Saving batch..." : "Creating batch...",
      success: editingBatchId ? "Batch updated." : "Batch created.",
      error: "Failed to save batch."
    });
  }

  function handleNewBatch() {
    resetForm();
    setActiveTab("create");
  }

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

          <TabsContent value="all">
            <BatchDataTable
              archiveBatch={(batchId) => archiveMutation.mutate(batchId)}
              deleteBatch={(batchId) => deleteMutation.mutate(batchId)}
              restoreBatch={(batchId) => restoreMutation.mutate(batchId)}
              batches={filteredBatches}
              columnFilters={columnFilters}
              columnVisibility={columnVisibility}
              editBatch={editBatch}
              globalFilter={globalFilter}
              isArchiving={archiveMutation.isPending}
              isDeleting={deleteMutation.isPending}
              isRestoring={restoreMutation.isPending}
              isLoading={batchesQuery.isLoading}
              pagination={pagination}
              rowSelection={rowSelection}
              setColumnFilters={setColumnFilters}
              setColumnVisibility={setColumnVisibility}
              setGlobalFilter={setGlobalFilter}
              setPagination={setPagination}
              setRowSelection={setRowSelection}
              setSorting={setSorting}
              sorting={sorting}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
            />
          </TabsContent>

          <TabsContent value="create">
            <BatchForm
              coaches={coaches}
              formState={formState}
              handleSubmit={handleSubmit}
              isLoadingUsers={assignableUsersQuery.isLoading}
              isSaving={saveMutation.isPending}
              resetForm={resetForm}
              selectedBatch={selectedBatch}
              setFormState={setFormState}
              students={students}
            />
          </TabsContent>

          <TabsContent value="settings">
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

function BatchDataTable({
  archiveBatch,
  deleteBatch,
  restoreBatch,
  batches,
  columnFilters,
  columnVisibility,
  editBatch,
  globalFilter,
  isArchiving,
  isDeleting,
  isRestoring,
  isLoading,
  pagination,
  rowSelection,
  setColumnFilters,
  setColumnVisibility,
  setGlobalFilter,
  setPagination,
  setRowSelection,
  setSorting,
  setStatusFilter,
  sorting,
  statusFilter
}: {
  archiveBatch: (batchId: string) => void;
  deleteBatch: (batchId: string) => void;
  restoreBatch: (batchId: string) => void;
  batches: Batch[];
  columnFilters: ColumnFiltersState;
  columnVisibility: VisibilityState;
  editBatch: (batch: Batch) => void;
  globalFilter: string;
  isArchiving: boolean;
  isDeleting: boolean;
  isRestoring: boolean;
  isLoading: boolean;
  pagination: PaginationState;
  rowSelection: RowSelectionState;
  setColumnFilters: (value: ColumnFiltersState | ((old: ColumnFiltersState) => ColumnFiltersState)) => void;
  setColumnVisibility: (value: VisibilityState | ((old: VisibilityState) => VisibilityState)) => void;
  setGlobalFilter: (value: string) => void;
  setPagination: (value: PaginationState | ((old: PaginationState) => PaginationState)) => void;
  setRowSelection: (value: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => void;
  setSorting: (value: SortingState | ((old: SortingState) => SortingState)) => void;
  setStatusFilter: (value: string) => void;
  sorting: SortingState;
  statusFilter: string;
}) {
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
          <SortButton
            label="Batch"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-52">
            <p className="font-extrabold text-app-text">{row.original.name}</p>
            <p className="mx-auto mt-1 max-w-[200px] truncate text-xs font-medium text-app-muted">
              {row.original.description || "No description"}
            </p>
          </div>
        )
      },
      {
        accessorKey: "status",
        enableColumnFilter: true,
        header: ({ column }) => (
          <SortButton
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
        accessorKey: "coachCount",
        header: ({ column }) => (
          <SortButton
            label="Coaches"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <UserSummary count={row.original.coachCount} users={row.original.coaches} />
        )
      },
      {
        accessorKey: "studentCount",
        header: ({ column }) => (
          <SortButton
            label="Students"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <UserSummary count={row.original.studentCount} users={row.original.students} />
        )
      },
      {
        accessorKey: "startsAt",
        header: ({ column }) => (
          <SortButton
            label="Starts"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => formatDate(row.original.startsAt)
      },
      {
        accessorKey: "scheduleNotes",
        header: "Schedule",
        cell: ({ row }) => row.original.scheduleNotes || "Not set"
      },
      {
        id: "actions",
        enableHiding: false,
        enableSorting: false,
        header: "Actions",
        cell: ({ row }) => {
          const isArchived = row.original.status === "ARCHIVED";
          return (
            <div className="flex items-center justify-end gap-2">
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
                    disabled={isArchiving || isRestoring}
                    onClick={() => isArchived ? restoreBatch(row.original.id) : archiveBatch(row.original.id)}
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
                    disabled={isDeleting}
                    onClick={() => deleteBatch(row.original.id)}
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
          );
        }
      }
    ],
    [archiveBatch, deleteBatch, restoreBatch, editBatch, isArchiving, isDeleting, isRestoring]
  );
  const table = useReactTable({
    data: batches,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    state: {
      columnFilters,
      columnVisibility,
      globalFilter,
      pagination,
      rowSelection,
      sorting
    }
  });
  const selectedCount = table.getFilteredSelectedRowModel().rows.length;

  return (
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
        isLoading={isLoading}
        noDataText="No batches found."
        table={table}
      />

      <DataTablePagination
        table={table}
        totalRows={table.getFilteredRowModel().rows.length}
      />
    </Card>
  );
}

function BatchForm({
  coaches,
  formState,
  handleSubmit,
  isLoadingUsers,
  isSaving,
  resetForm,
  selectedBatch,
  setFormState,
  students
}: {
  coaches: BatchUserSummary[];
  formState: BatchFormState;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isLoadingUsers: boolean;
  isSaving: boolean;
  resetForm: () => void;
  selectedBatch: Batch | null;
  setFormState: (value: BatchFormState | ((old: BatchFormState) => BatchFormState)) => void;
  students: BatchUserSummary[];
}) {
  return (
    <Card className="p-5">
      <form className="grid gap-5" onSubmit={handleSubmit}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase text-primary">
              {selectedBatch ? "Edit batch" : "Create batch"}
            </p>
            <h2 className="mt-2 text-xl font-extrabold text-app-text">
              {selectedBatch?.name ?? "Batch details"}
            </h2>
          </div>
          <div>
            <Button
              disabled={isSaving}
              isLoading={isSaving}
              type="submit"
            >
              <Save aria-hidden="true" className="size-4" strokeWidth={2.5} />
              {selectedBatch ? "Save Batch" : "Create Batch"}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <FormField id="batch-name" label="Name">
            <Input
              id="batch-name"
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  name: event.target.value
                }))
              }
              required
              value={formState.name}
            />
          </FormField>

          <FormField id="batch-status" label="Status">
            <Select
              id="batch-status"
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  status: event.target.value as BatchStatus
                }))
              }
              options={statusOptions}
              value={formState.status}
            />
          </FormField>

          <FormField id="batch-start" label="Starts">
            <DateTimePicker
              onChange={(date) =>
                setFormState((current) => ({
                  ...current,
                  startsAt: date ? date.toISOString() : ""
                }))
              }
              value={formState.startsAt ? new Date(formState.startsAt) : undefined}
            />
          </FormField>

          <FormField id="batch-end" label="Ends">
            <DateTimePicker
              onChange={(date) =>
                setFormState((current) => ({
                  ...current,
                  endsAt: date ? date.toISOString() : ""
                }))
              }
              value={formState.endsAt ? new Date(formState.endsAt) : undefined}
            />
          </FormField>
        </div>

        <FormField id="batch-schedule" label="Schedule">
          <Input
            id="batch-schedule"
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                scheduleNotes: event.target.value
              }))
            }
            value={formState.scheduleNotes}
          />
        </FormField>

        <FormField id="batch-description" label="Description">
          <Textarea
            id="batch-description"
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                description: event.target.value
              }))
            }
            value={formState.description}
          />
        </FormField>

        <div className="grid gap-4 lg:grid-cols-2">
          <UserSelector
            isLoading={isLoadingUsers}
            label="Coaches"
            onChange={(coachIds) =>
              setFormState((current) => ({ ...current, coachIds }))
            }
            selectedIds={formState.coachIds}
            users={coaches}
          />
          <UserSelector
            isLoading={isLoadingUsers}
            label="Students"
            onChange={(studentIds) =>
              setFormState((current) => ({ ...current, studentIds }))
            }
            selectedIds={formState.studentIds}
            users={students}
          />
        </div>

      </form>
    </Card>
  );
}

function BatchSettings({
  columnVisibility,
  pageSize,
  resetTable,
  setColumnVisibility,
  setPageSize
}: {
  columnVisibility: VisibilityState;
  pageSize: number;
  resetTable: () => void;
  setColumnVisibility: (value: VisibilityState | ((old: VisibilityState) => VisibilityState)) => void;
  setPageSize: (pageSize: number) => void;
}) {
  return (
    <Card className="grid gap-5 p-5">
      <div>
        <p className="text-xs font-extrabold uppercase text-primary">
          Table settings
        </p>
        <h2 className="mt-2 text-xl font-extrabold text-app-text">
          Display preferences
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField id="settings-page-size" label="Default rows">
          <Select
            id="settings-page-size"
            onChange={(event) => setPageSize(Number(event.target.value))}
            options={pageSizeOptions}
            value={String(pageSize)}
          />
        </FormField>

        <div className="grid gap-2">
          <h3 className="text-sm font-semibold text-app-text">Visible columns</h3>
          <div className="grid gap-1 rounded-app border border-app-border bg-app-soft/45 p-3">
            {["status", "coachCount", "studentCount", "startsAt", "scheduleNotes"].map(
              (columnId) => (
                <Checkbox
                  checked={columnVisibility[columnId] !== false}
                  id={`settings-${columnId}`}
                  key={columnId}
                  label={formatColumnLabel(columnId)}
                  onCheckedChange={(checked) =>
                    setColumnVisibility((current) => ({
                      ...current,
                      [columnId]: !!checked
                    }))
                  }
                />
              )
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={resetTable} type="button" variant="outline">
          <RotateCcw aria-hidden="true" className="size-4" strokeWidth={2.5} />
          Reset Table
        </Button>
      </div>
    </Card>
  );
}

function ColumnVisibilityMenu({
  table
}: {
  table: ReturnType<typeof useReactTable<Batch>>;
}) {
  const columns = table
    .getAllColumns()
    .filter((column) => column.getCanHide());

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

function SortButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="inline-flex items-center gap-1 rounded-control text-xs font-extrabold uppercase text-app-muted transition hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
      onClick={onClick}
      type="button"
    >
      {label}
      <ChevronsUpDown aria-hidden="true" className="size-3.5" />
    </button>
  );
}

function UserSummary({
  count,
  users
}: {
  count: number;
  users: BatchUserSummary[];
}) {
  return (
    <div className="min-w-32">
      <p className="font-extrabold text-app-text">{count}</p>
      <p className="mt-1 line-clamp-1 text-xs text-app-muted">
        {users.map(formatUserName).join(", ") || "Unassigned"}
      </p>
    </div>
  );
}

function UserSelector({
  isLoading,
  label,
  onChange,
  selectedIds,
  users
}: {
  isLoading: boolean;
  label: string;
  onChange: (selectedIds: string[]) => void;
  selectedIds: string[];
  users: BatchUserSummary[];
}) {
  function toggleUser(userId: string) {
    if (selectedIds.includes(userId)) {
      onChange(selectedIds.filter((selectedId) => selectedId !== userId));
      return;
    }

    onChange([...selectedIds, userId]);
  }

  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-app-text">{label}</h3>
        <span className="text-xs font-bold text-app-muted">
          {selectedIds.length}
        </span>
      </div>
      <div className="grid max-h-64 gap-2 overflow-y-auto rounded-app border border-app-border bg-app-soft/45 p-2">
        {isLoading ? (
          <p className="px-2 py-3 text-sm font-medium text-app-muted">
            Loading users...
          </p>
        ) : users.length ? (
          users.map((user) => (
            <Checkbox
              checked={selectedIds.includes(user.id)}
              className="rounded-control bg-app-surface px-3 py-1 text-app-text shadow-sm transition hover:text-primary"
              id={`${label}-${user.id}`}
              key={user.id}
              label={formatUserName(user)}
              onCheckedChange={() => toggleUser(user.id)}
            />
          ))
        ) : (
          <p className="px-2 py-3 text-sm font-medium text-app-muted">
            No users found.
          </p>
        )}
      </div>
    </section>
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
  if (!value) {
    return "Not set";
  }

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

function toDateTimeInputValue(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

function toIsoDateTime(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

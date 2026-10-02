"use client";

import { useCallback, useMemo, useState } from "react";
import {
  type ColumnDef,
  type PaginationState,
  type RowSelectionState,
  type SortingState
} from "@tanstack/react-table";
import {
  FilterX,
  ListFilter,
  RotateCcw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import type { TrashEntity, TrashItem } from "@nexa-chess/types";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { DatePicker } from "@/components/ui/DatePicker";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { DataTable } from "@/components/ui/DataTable";
import { DataTablePagination } from "@/components/ui/DataTablePagination";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { DataTableSortButton } from "@/components/ui/DataTableSortButton";
import { useDataTable } from "@/hooks/useDataTable";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { queryKeys } from "@/lib/queryKeys";
import {
  useBulkDeleteTrashItemsPermanentlyMutation,
  useBulkRestoreTrashItemsMutation,
  useDeleteTrashItemPermanentlyMutation,
  useEmptyTrashMutation,
  useRestoreTrashItemMutation,
  useTrashQuery,
} from "../hooks/useTrashApi";

const entityOptions = [
  { label: "All entities", value: "ALL" },
  { label: "Users", value: "User" },
  { label: "Student profiles", value: "StudentProfile" },
  { label: "Coach profiles", value: "CoachProfile" },
  { label: "Batches", value: "Batch" },
  { label: "Batch coaches", value: "BatchCoach" },
  { label: "Batch students", value: "BatchStudent" },
  { label: "Puzzles", value: "Puzzle" },
  { label: "Puzzle topics", value: "PuzzleTopic" },
  { label: "Courses", value: "Course" },
  { label: "Course modules", value: "CourseModule" }
];

export function TrashManagementClient() {
  const [search, setSearch] = useState("");
  const [entity, setEntity] = useState<TrashEntity | "ALL">("ALL");
  const [deletedFrom, setDeletedFrom] = useState("");
  const [deletedTo, setDeletedTo] = useState("");

  const [hiddenItems, setHiddenItems] = useState<Record<string, boolean>>({});

  // Pagination, sorting and row selection are owned here: the query is driven
  // by pagination/sorting, and the row handlers referenced by `columns` clear
  // the selection — both of which would otherwise create a cycle with the
  // table. See AUDIT.md H4.
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [sorting, setSorting] = useState<SortingState>([
    { id: "deletedAt", desc: false }
  ]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10
  });

  const query = useTrashQuery({
    deletedFrom,
    deletedTo,
    entity,
    page: pagination.pageIndex + 1,
    pageSize: pagination.pageSize,
    search,
    sortBy: sorting[0]?.id as any || "deletedAt",
    sortOrder: sorting[0]?.desc ? "desc" : "asc"
  });

  const items = useMemo(() => {
    const rawItems = query.data?.items ?? [];
    return rawItems.filter((item) => !hiddenItems[getItemKey(item)]);
  }, [query.data?.items, hiddenItems]);

  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pagination.pageSize));

  const selectedItems = useMemo(() => {
    return Object.keys(rowSelection)
      .filter((key) => rowSelection[key])
      .map((key) => items[parseInt(key, 10)])
      .filter(Boolean);
  }, [items, rowSelection]);

  const restoreMutation = useRestoreTrashItemMutation();
  const deleteMutation = useDeleteTrashItemPermanentlyMutation();
  const bulkRestoreMutation = useBulkRestoreTrashItemsMutation();
  const bulkDeleteMutation = useBulkDeleteTrashItemsPermanentlyMutation();
  const emptyMutation = useEmptyTrashMutation();

  const hideItems = useCallback((itemsToActOn: TrashItem[]) => {
    const keys = itemsToActOn.map(getItemKey);
    setHiddenItems((prev) => {
      const next = { ...prev };
      for (const key of keys) next[key] = true;
      return next;
    });
  }, []);

  const unhideItems = useCallback((itemsToActOn: TrashItem[]) => {
    const keys = itemsToActOn.map(getItemKey);
    setHiddenItems((prev) => {
      const next = { ...prev };
      for (const key of keys) delete next[key];
      return next;
    });
  }, []);

  const { run: runRestore } = useUndoableMutation<TrashItem[], void>({
    strategy: "defer",
    mutationFn: async (itemsToActOn) => {
      if (itemsToActOn.length === 1) {
        await restoreMutation.mutateAsync(itemsToActOn[0]);
      } else {
        await bulkRestoreMutation.mutateAsync({ items: itemsToActOn.map(toRef) });
      }
    },
    undo: async () => {},
    onSchedule: hideItems,
    onCancel: unhideItems,
    toast: (itemsToActOn) => ({
      title: itemsToActOn.length === 1 ? "Item restored." : "Selected items restored."
    }),
    invalidates: [queryKeys.trash.all]
  });

  const { run: runDelete } = useUndoableMutation<TrashItem[], void>({
    strategy: "defer",
    mutationFn: async (itemsToActOn) => {
      if (itemsToActOn.length === 1) {
        await deleteMutation.mutateAsync(itemsToActOn[0]);
      } else {
        await bulkDeleteMutation.mutateAsync({ items: itemsToActOn.map(toRef) });
      }
    },
    undo: async () => {},
    onSchedule: hideItems,
    onCancel: unhideItems,
    toast: (itemsToActOn) => ({
      title: itemsToActOn.length === 1 ? "Item permanently deleted." : "Selected items permanently deleted."
    }),
    invalidates: [queryKeys.trash.all]
  });

  function resetFilters() {
    setSearch("");
    setEntity("ALL");
    setDeletedFrom("");
    setDeletedTo("");
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    setRowSelection({});
  }

  const columns = useMemo<ColumnDef<TrashItem>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all trash rows"
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Select ${row.original.title}`}
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
          />
        )
      },
      {
        accessorKey: "entity",
        header: ({ column }) => (
          <DataTableSortButton
            label="Entity"
            column={column}
          />
        ),
        cell: ({ row }) => <Badge variant="secondary">{formatEntity(row.original.entity)}</Badge>
      },
      {
        accessorKey: "title",
        header: ({ column }) => (
          <DataTableSortButton
            label="Title"
            column={column}
          />
        ),
        cell: ({ row }) => (
          <>
            <p className="max-w-56 truncate font-extrabold text-app-text">
              {row.original.title}
            </p>
            <p className="mt-1 text-xs font-medium text-app-muted">
              {row.original.id}
            </p>
          </>
        )
      },
      {
        accessorKey: "deletedAt",
        header: ({ column }) => (
          <DataTableSortButton
            label="Deleted At"
            column={column}
          />
        ),
        cell: ({ row }) => formatDate(row.original.deletedAt)
      },
      {
        id: "deletedBy",
        accessorKey: "deletedBy",
        header: ({ column }) => (
          <DataTableSortButton
            label="Deleted By"
            column={column}
          />
        ),
        cell: ({ row }) => formatDeletedBy(row.original)
      },
      {
        id: "retention",
        header: "Retention",
        cell: ({ row }) => (
          <Badge variant={getRetentionVariant(row.original)}>
            Auto deletes in {row.original.daysUntilPermanentDeletion ?? 0} days
          </Badge>
        )
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <TooltipProvider>
            <div className="flex justify-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={`Restore ${row.original.title}`}
                    className="size-8 rounded-full border border-primary bg-primary p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-white"
                    disabled={restoreMutation.isPending || deleteMutation.isPending}
                    onClick={() => runRestore([row.original])}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <RotateCcw aria-hidden="true" className="size-4" strokeWidth={2.5} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Restore item</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={`Delete ${row.original.title} permanently`}
                    className="size-8 rounded-full border border-app-danger bg-app-danger p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:text-white"
                    disabled={restoreMutation.isPending || deleteMutation.isPending}
                    onClick={() => runDelete([row.original])}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 aria-hidden="true" className="size-4" strokeWidth={2.5} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete permanently</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        )
      }
    ],
    [runRestore, runDelete, restoreMutation.isPending, deleteMutation.isPending]
  );

  // Trash pages and sorts on the server, so the table must not slice or
  // re-sort the rows it is handed.
  const { table } = useDataTable<TrashItem, unknown>({
    columns,
    data: items,
    pageCount,
    manualPagination: true,
    manualSorting: true,
    rowSelection,
    setRowSelection,
    pagination,
    setPagination,
    sorting,
    setSorting
  });

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    action: "delete-selected" | "empty";
  }>({ isOpen: false, action: "delete-selected" });

  const confirmAction = () => {
    if (confirmModal.action === "delete-selected") {
      runDelete(selectedItems);
    } else if (confirmModal.action === "empty") {
      emptyMutation.mutate();
    }
    setConfirmModal({ isOpen: false, action: "delete-selected" });
  };

  return (
    <main className="min-h-[calc(100vh-64px)] bg-app-background px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-5">
        <PageHeader 
          title="Trash" 
          description="Manage deleted entities." 
          actions={
            <>
              <Button
                disabled={!selectedItems.length}
                isLoading={bulkRestoreMutation.isPending}
                onClick={() => runRestore(selectedItems)}
                type="button"
                variant="primary"
              >
                <RotateCcw aria-hidden="true" className="size-4" />
                Restore Selected
              </Button>

              <Button
                disabled={!selectedItems.length}
                isLoading={bulkDeleteMutation.isPending}
                onClick={() => {
                  runDelete(selectedItems);
                  table.toggleAllPageRowsSelected(false);
                }}
                type="button"
                variant="destructive"
              >
                <Trash2 aria-hidden="true" className="size-4" />
                Delete Selected
              </Button>

              <Button
                disabled={items.length === 0}
                isLoading={emptyMutation.isPending}
                onClick={() => setConfirmModal({ isOpen: true, action: "empty" })}
                type="button"
                variant="destructive"
              >
                Empty Trash
              </Button>
            </>
          } 
        />

        <ConfirmationModal
          isOpen={confirmModal.isOpen}
          onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
          onConfirm={confirmAction}
          title={confirmModal.action === "empty" ? "Empty Trash?" : "Delete permanently?"}
          confirmLabel={confirmModal.action === "empty" ? "Empty Trash" : "Delete Permanently"}
          isConfirming={bulkDeleteMutation.isPending || emptyMutation.isPending}
        >
          {confirmModal.action === "empty" 
            ? "Are you sure you want to permanently delete all items in the trash? This action cannot be undone."
            : "Are you sure you want to permanently delete the selected items? This action cannot be undone."}
        </ConfirmationModal>

        <Card className="grid gap-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Select
                className="w-40"
                onChange={(event) => {
                  setEntity(event.target.value as TrashEntity | "ALL");
                  setPagination((prev) => ({ ...prev, pageIndex: 0 }));
                }}
                options={entityOptions}
                value={entity}
              />
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-app-muted">From</span>
                <DatePicker
                  onChange={(date) => setDeletedFrom(date ? date.toISOString() : "")}
                  value={deletedFrom ? new Date(deletedFrom) : undefined}
                  placeholder="Deleted from"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-app-muted">To</span>
                <DatePicker
                  onChange={(date) => setDeletedTo(date ? date.toISOString() : "")}
                  value={deletedTo ? new Date(deletedTo) : undefined}
                  placeholder="Deleted to"
                />
              </div>
              {(search || entity !== "ALL" || deletedFrom || deletedTo) && (
                <Button aria-label="Clear filters" className="shrink-0 text-app-muted hover:text-app-text" onClick={resetFilters} size="icon" type="button" variant="ghost">
                  <FilterX aria-hidden="true" className="size-4" strokeWidth={2.5} />
                </Button>
              )}
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
                <ListFilter
                  aria-hidden="true"
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-muted"
                  strokeWidth={2.5}
                />
                <Input
                  className="pl-9"
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
                  }}
                  placeholder="Search trash..."
                  value={search}
                />
              </div>
            </div>
          </div>

          {items.length === 0 && !query.isLoading ? (
            <EmptyState 
              title="Trash is empty."
              description="No deleted items found matching your filters."
              icon={ShieldAlert}
            />
          ) : (
            <DataTable
              columnsLength={columns.length}
              isLoading={query.isLoading}
              loadingText="Loading trash..."
              noDataText=""
              table={table}
            />
          )}

          <DataTablePagination
            table={table}
            totalRows={total}
          />
        </Card>
      </div>
    </main>
  );
}

function toRef(item: TrashItem) {
  return {
    entity: item.entity,
    id: item.id
  };
}

function getItemKey(item: TrashItem) {
  return `${item.entity}:${item.id}`;
}

function formatEntity(entity: string) {
  return entity.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function formatDeletedBy(item: TrashItem) {
  if (!item.deletedBy) {
    return "System";
  }

  return (
    [item.deletedBy.firstName, item.deletedBy.lastName].filter(Boolean).join(" ") ||
    item.deletedBy.email
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function getRetentionVariant(item: TrashItem) {
  const days = item.daysUntilPermanentDeletion ?? 0;

  if (days <= 3) {
    return "destructive";
  }

  if (days <= 7) {
    return "warning";
  }

  return "default";
}

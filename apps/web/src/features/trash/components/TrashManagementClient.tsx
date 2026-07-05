"use client";

import { useCallback, useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  FilterX,
  ListFilter,
  RotateCcw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import type { TrashEntity, TrashItem } from "@nexa-gen/types";

import { useToast } from "@/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
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
  { label: "Batch students", value: "BatchStudent" }
];

export function TrashManagementClient() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [entity, setEntity] = useState<TrashEntity | "ALL">("ALL");
  const [deletedFrom, setDeletedFrom] = useState("");
  const [deletedTo, setDeletedTo] = useState("");

  const [pendingActions, setPendingActions] = useState<Record<string, number>>({});
  const [hiddenItems, setHiddenItems] = useState<Record<string, boolean>>({});

  const {
    table,
    rowSelection,
    setRowSelection,
    pagination,
    setPagination,
    sorting,
    setSorting
  } = useDataTable<TrashItem, unknown>({
    columns: [],
    data: [],
    initialSorting: [{ id: "deletedAt", desc: true }]
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
    const selectedKeys = Object.keys(rowSelection).filter(key => rowSelection[key]);
    return items.filter(item => selectedKeys.includes(getItemKey(item)));
  }, [items, rowSelection]);

  const restoreMutation = useRestoreTrashItemMutation();
  const deleteMutation = useDeleteTrashItemPermanentlyMutation();
  const bulkRestoreMutation = useBulkRestoreTrashItemsMutation();
  const bulkDeleteMutation = useBulkDeleteTrashItemsPermanentlyMutation();
  const emptyMutation = useEmptyTrashMutation();

  const handleDelayedAction = useCallback((
    itemsToActOn: TrashItem[],
    action: "restore" | "delete",
    title: string
  ) => {
    const keys = itemsToActOn.map(getItemKey);

    setHiddenItems((prev) => {
      const next = { ...prev };
      for (const key of keys) {
        next[key] = true;
      }
      return next;
    });

    const timeoutId = window.setTimeout(() => {
      if (action === "restore") {
        if (itemsToActOn.length === 1) {
          restoreMutation.mutate(itemsToActOn[0] as TrashItem);
        } else {
          bulkRestoreMutation.mutate({ items: itemsToActOn.map(toRef) });
        }
      } else {
        if (itemsToActOn.length === 1) {
          deleteMutation.mutate(itemsToActOn[0] as TrashItem);
        } else {
          bulkDeleteMutation.mutate({ items: itemsToActOn.map(toRef) });
        }
      }

      setPendingActions((prev) => {
        const next = { ...prev };
        delete next[timeoutId];
        return next;
      });
    }, 5000);

    setPendingActions((prev) => ({ ...prev, [timeoutId]: timeoutId }));

    toast.showToast({
      type: "success",
      title,
      durationMs: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          window.clearTimeout(timeoutId);
          setPendingActions((prev) => {
            const next = { ...prev };
            delete next[timeoutId];
            return next;
          });
          setHiddenItems((prev) => {
            const next = { ...prev };
            for (const key of keys) {
              delete next[key];
            }
            return next;
          });
          toast.info({ title: "Action undone." });
        }
      }
    });
  }, [
    restoreMutation,
    bulkRestoreMutation,
    deleteMutation,
    bulkDeleteMutation,
    toast
  ]);

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
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => <Badge variant="secondary">{formatEntity(row.original.entity)}</Badge>
      },
      {
        accessorKey: "title",
        header: ({ column }) => (
          <DataTableSortButton
            label="Title"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
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
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
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
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
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
                    className="size-8 rounded-full border-primary p-0 text-app-text transition-colors hover:border-primary hover:bg-primary hover:text-white"
                    disabled={restoreMutation.isPending || deleteMutation.isPending}
                    onClick={() => handleDelayedAction([row.original], "restore", "Item restored.")}
                    size="icon"
                    type="button"
                    variant="outline"
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
                    className="size-8 rounded-full border-app-danger p-0 text-app-text transition-colors hover:border-app-danger hover:bg-app-danger hover:text-white"
                    disabled={restoreMutation.isPending || deleteMutation.isPending}
                    onClick={() => handleDelayedAction([row.original], "delete", "Item permanently deleted.")}
                    size="icon"
                    type="button"
                    variant="outline"
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
    [handleDelayedAction, restoreMutation.isPending, deleteMutation.isPending]
  );

  // Re-initialize table with actual columns and data, maintaining state
  // Because useDataTable uses useReactTable under the hood, we can't easily dynamically 
  // update columns in useDataTable if it's memoized wrong, but useReactTable handles dynamic columns.
  // Wait, useDataTable accepts data and columns! We just need to ensure useDataTable is called with the columns.
  table.setOptions((prev) => ({
    ...prev,
    data: items,
    columns,
    pageCount,
    manualPagination: true,
    manualSorting: true
  }));

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    action: "delete-selected" | "empty";
  }>({ isOpen: false, action: "delete-selected" });

  const confirmAction = () => {
    if (confirmModal.action === "delete-selected") {
      handleDelayedAction(selectedItems, "delete", "Selected items permanently deleted.");
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
                onClick={() => handleDelayedAction(selectedItems, "restore", "Selected items restored.")}
                type="button"
                variant="primary"
              >
                <RotateCcw aria-hidden="true" className="size-4" />
                Restore Selected
              </Button>

              <Button
                disabled={!selectedItems.length}
                isLoading={bulkDeleteMutation.isPending}
                onClick={() => setConfirmModal({ isOpen: true, action: "delete-selected" })}
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
                <Input
                  aria-label="Deleted from"
                  onChange={(event) => setDeletedFrom(event.target.value)}
                  type="date"
                  value={deletedFrom}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-app-muted">To</span>
                <Input
                  aria-label="Deleted to"
                  onChange={(event) => setDeletedTo(event.target.value)}
                  type="date"
                  value={deletedTo}
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

"use client";

import {
  ChevronsUpDown,
  FilterX,
  ListFilter,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  XCircle
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TrashEntity, TrashItem } from "@nexa-gen/types";
import { useCallback, useMemo, useState } from "react";
import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
  type PaginationState,
  type RowSelectionState,
  type SortingState
} from "@tanstack/react-table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/AlertDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { DataTable } from "@/components/ui/DataTable";
import { DataTablePagination } from "@/components/ui/DataTablePagination";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/Tooltip";
import { useToast } from "@/providers/ToastProvider";
import {
  bulkDeleteTrashItemsPermanently,
  bulkRestoreTrashItems,
  deleteTrashItemPermanently,
  emptyTrash,
  listTrash,
  restoreTrashItem
} from "../api/trashApi";

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
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [entity, setEntity] = useState<TrashEntity | "ALL">("ALL");
  const [deletedFrom, setDeletedFrom] = useState("");
  const [deletedTo, setDeletedTo] = useState("");

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10
  });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const [pendingActions, setPendingActions] = useState<Record<string, number>>({});
  const [hiddenItems, setHiddenItems] = useState<Record<string, boolean>>({});

  const [sorting, setSorting] = useState<SortingState>([{ id: "deletedAt", desc: true }]);

  const query = useQuery({
    queryFn: () =>
      listTrash({
        deletedFrom,
        deletedTo,
        entity,
        page: pagination.pageIndex + 1,
        pageSize: pagination.pageSize,
        search,
        sortBy: sorting[0]?.id as any || "deletedAt",
        sortOrder: sorting[0]?.desc ? "desc" : "asc"
      }),
    queryKey: [
      "trash",
      { deletedFrom, deletedTo, entity, page: pagination.pageIndex + 1, pageSize: pagination.pageSize, search, sorting }
    ]
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

  const restoreMutation = useMutation({
    mutationFn: (item: TrashItem) => restoreTrashItem(item.entity, item.id),
    onSuccess: () => onActionSuccess("Item restored.")
  });
  const deleteMutation = useMutation({
    mutationFn: (item: TrashItem) =>
      deleteTrashItemPermanently(item.entity, item.id),
    onSuccess: () => onActionSuccess("Item permanently deleted.")
  });
  const bulkRestoreMutation = useMutation({
    mutationFn: () =>
      bulkRestoreTrashItems({
        items: selectedItems.map(toRef)
      }),
    onSuccess: () => onActionSuccess("Selected items restored.")
  });
  const bulkDeleteMutation = useMutation({
    mutationFn: () =>
      bulkDeleteTrashItemsPermanently({
        items: selectedItems.map(toRef)
      }),
    onSuccess: () => onActionSuccess("Selected items permanently deleted.")
  });
  const emptyMutation = useMutation({
    mutationFn: emptyTrash,
    onSuccess: (result) =>
      onActionSuccess(`${result.deletedCount} trash item(s) permanently deleted.`)
  });

  function onActionSuccess(title: string) {
    setRowSelection({});
    queryClient.invalidateQueries({ queryKey: ["trash"] });
  }

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
          bulkRestoreMutation.mutate();
        }
      } else {
        if (itemsToActOn.length === 1) {
          deleteMutation.mutate(itemsToActOn[0] as TrashItem);
        } else {
          bulkDeleteMutation.mutate();
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
          <SortButton
            label="Entity"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => <Badge variant="secondary">{formatEntity(row.original.entity)}</Badge>
      },
      {
        accessorKey: "title",
        header: ({ column }) => (
          <SortButton
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
          <SortButton
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
          <SortButton
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

  const table = useReactTable({
    data: items,
    columns,
    pageCount,
    state: {
      pagination,
      rowSelection,
      sorting
    },
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getRowId: (row) => getItemKey(row),
    manualPagination: true,
    manualSorting: true,
    getCoreRowModel: getCoreRowModel()
  });

  return (
    <main className="min-h-[calc(100vh-64px)] bg-app-background px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase text-primary">
              Super Admin
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight text-app-text">
              Trash
            </h1>
          </div>
          <div className="flex items-center gap-2">
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

            <ConfirmButton
              disabled={!selectedItems.length}
              isLoading={bulkDeleteMutation.isPending}
              label="Delete Selected"
              message="Are you sure you want to permanently delete the selected items? This action cannot be undone."
              onConfirm={() => handleDelayedAction(selectedItems, "delete", "Selected items permanently deleted.")}
            />

            <ConfirmButton
              disabled={items.length === 0}
              isLoading={emptyMutation.isPending}
              label="Empty Trash"
              message="Are you sure you want to permanently delete all items in the trash? This action cannot be undone."
              onConfirm={() => emptyMutation.mutate()}
            />
          </div>
        </header>

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

          <DataTable
            columnsLength={columns.length}
            isLoading={query.isLoading}
            loadingText="Loading trash..."
            noDataText={
              <div className="grid justify-items-center gap-2 py-8 text-app-muted">
                <ShieldAlert aria-hidden="true" className="size-8" />
                <p className="font-semibold">Trash is empty.</p>
              </div>
            }
            table={table}
          />

          <DataTablePagination
            table={table}
            totalRows={total}
          />
        </Card>
      </div>
    </main>
  );
}

function ConfirmButton({
  disabled,
  iconOnly = false,
  isLoading,
  label,
  message,
  onConfirm
}: {
  disabled?: boolean;
  iconOnly?: boolean;
  isLoading?: boolean;
  label: string;
  message: string;
  onConfirm: () => void;
}) {
  const trigger = iconOnly ? (
    <Button
      aria-label={label}
      className="size-8 rounded-full border-app-danger p-0 text-app-text transition-colors hover:border-app-danger hover:bg-app-danger hover:text-white"
      disabled={disabled}
      size="icon"
      type="button"
      variant="outline"
    >
      <Trash2 aria-hidden="true" className="size-4" strokeWidth={2.5} />
    </Button>
  ) : (
    <Button
      aria-label={label}
      disabled={disabled}
      size="default"
      type="button"
      variant="destructive"
    >
      <Trash2 aria-hidden="true" className="size-4" />
      {label}
    </Button>
  );

  return (
    <AlertDialog>
      {iconOnly ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
          </TooltipTrigger>
          <TooltipContent>Delete permanently</TooltipContent>
        </Tooltip>
      ) : (
        <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogDescription>{message}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="primary">Cancel</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              isLoading={isLoading}
              onClick={onConfirm}
              type="button"
              variant="destructive"
            >
              Delete Permanently
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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

function SortButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className="-ml-4 h-8 data-[state=open]:bg-accent"
    >
      <span>{label}</span>
      <ChevronsUpDown className="ml-2 h-4 w-4" />
    </Button>
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

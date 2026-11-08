"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type ColumnDef,
  type PaginationState,
  type RowSelectionState,
  type SortingState
} from "@tanstack/react-table";
import {
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
import { FilterChips, FilterField, FilterPopover, type ActiveFilter } from "@/components/ui/FilterPopover";
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
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime, formatFullDate } from "@/lib/datetime";
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
  { label: "MCQs and Playouts", value: "LibraryActivity" },
  { label: "Courses", value: "Course" },
  { label: "Course modules", value: "CourseModule" },
  { label: "Homework (assignments)", value: "Assignment" },
  { label: "Announcements", value: "Announcement" },
  { label: "Leads", value: "Lead" },
  { label: "Feedback forms", value: "FeedbackForm" },
  { label: "Help articles", value: "KnowledgeArticle" },
  { label: "Help categories", value: "KnowledgeCategory" },
  { label: "Games", value: "ChessGame" },
  { label: "Live-class presets", value: "LiveClassPreset" },
  { label: "Demo schedules", value: "DemoSchedule" }
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
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10
  });

  const timeZone = useUserTimeZone();
  // The input stays instant; the query waits for a pause in typing.
  const debouncedSearch = useDebouncedValue(search, 300);

  const query = useTrashQuery({
    deletedFrom,
    deletedTo,
    entity,
    page: pagination.pageIndex + 1,
    pageSize: pagination.pageSize,
    search: debouncedSearch,
    sortBy: sorting[0]?.id as any || "deletedAt",
    sortOrder: sorting[0]?.desc ? "desc" : "asc"
  });

  const items = useMemo(() => {
    const rawItems = query.data?.items ?? [];
    return rawItems.filter((item) => !hiddenItems[getItemKey(item)]);
  }, [query.data?.items, hiddenItems]);

  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pagination.pageSize));

  // Rows are keyed by item identity (getRowId below), never by position:
  // after a page change, a filter or a hidden row, an index points elsewhere.
  const selectedItems = useMemo(
    () => items.filter((item) => rowSelection[getItemKey(item)]),
    [items, rowSelection]
  );

  // A new page or filter starts with nothing selected.
  useEffect(() => {
    setRowSelection({});
  }, [pagination.pageIndex, pagination.pageSize, debouncedSearch, entity, deletedFrom, deletedTo]);

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
    // Acted-on rows leave the selection too.
    setRowSelection((prev) => {
      const next = { ...prev };
      for (const key of keys) delete next[key];
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

  const trashFilters = [
    entity !== "ALL" && {
      key: "entity",
      label: entityOptions.find((option) => option.value === entity)?.label ?? entity,
      onRemove: () => setEntity("ALL")
    },
    deletedFrom && { key: "from", label: `From ${formatFullDate(deletedFrom, timeZone)}`, onRemove: () => setDeletedFrom("") },
    deletedTo && { key: "to", label: `To ${formatFullDate(deletedTo, timeZone)}`, onRemove: () => setDeletedTo("") },
  ].filter((filter): filter is ActiveFilter => Boolean(filter));

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
        meta: { label: "Entity" },
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
        meta: { label: "Title" },
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
        meta: { label: "Deleted At" },
        header: ({ column }) => (
          <DataTableSortButton
            label="Deleted at"
            column={column}
          />
        ),
        cell: ({ row }) => formatDate(row.original.deletedAt, timeZone)
      },
      {
        id: "deletedBy",
        accessorKey: "deletedBy",
        meta: { label: "Deleted By" },
        header: ({ column }) => (
          <DataTableSortButton
            label="Deleted by"
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
            <div className="flex justify-end gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={`Restore ${row.original.title}`}
                    className="size-8"
                    disabled={restoreMutation.isPending || deleteMutation.isPending}
                    onClick={() => runRestore([row.original])}
                    size="icon"
                    type="button"
                    variant="neutral"
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
                    className="size-8 text-app-danger-ink hover:bg-app-danger-soft"
                    disabled={restoreMutation.isPending || deleteMutation.isPending}
                    onClick={() => runDelete([row.original])}
                    size="icon"
                    type="button"
                    variant="neutral"
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
    [runRestore, runDelete, restoreMutation.isPending, deleteMutation.isPending, timeZone]
  );

  // Trash pages and sorts on the server, so the table must not slice or
  // re-sort the rows it is handed.
  const { table } = useDataTable<TrashItem, unknown>({
    columns,
    data: items,
    getRowId: getItemKey,
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
    <div>
      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-5">
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
                Restore selected
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
                Delete selected
              </Button>

              <Button
                disabled={items.length === 0}
                isLoading={emptyMutation.isPending}
                onClick={() => setConfirmModal({ isOpen: true, action: "empty" })}
                type="button"
                variant="destructive"
              >
                Empty trash
              </Button>
            </>
          } 
        />

        <ConfirmationModal
          isOpen={confirmModal.isOpen}
          onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
          onConfirm={confirmAction}
          title={confirmModal.action === "empty" ? "Empty trash?" : "Delete permanently?"}
          confirmLabel={confirmModal.action === "empty" ? "Empty trash" : "Delete permanently"}
          isConfirming={bulkDeleteMutation.isPending || emptyMutation.isPending}
        >
          {confirmModal.action === "empty" 
            ? "Are you sure you want to permanently delete all items in the trash? This action cannot be undone."
            : "Are you sure you want to permanently delete the selected items? This action cannot be undone."}
        </ConfirmationModal>

        <Card className="grid gap-4 p-4">
          <div className="grid gap-2">
            <div className="flex items-center justify-end gap-2">
              <div className="relative min-w-0 flex-1 sm:max-w-sm">
                <ListFilter
                  aria-hidden="true"
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-muted"
                  strokeWidth={2.5}
                />
                <Input
                  aria-label="Search trash"
                  className="pl-9"
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
                  }}
                  placeholder="Search trash..."
                  value={search}
                />
              </div>
              <FilterPopover
                activeCount={trashFilters.length}
                emptyValue={{ deletedFrom: "", deletedTo: "", entity: "ALL" as TrashEntity | "ALL" }}
                onApply={(next) => {
                  setEntity(next.entity);
                  setDeletedFrom(next.deletedFrom);
                  setDeletedTo(next.deletedTo);
                  setPagination((prev) => ({ ...prev, pageIndex: 0 }));
                }}
                value={{ deletedFrom, deletedTo, entity }}
              >
                {(draft, update) => (
                  <>
                    <FilterField htmlFor="trash-filter-type" label="Item type">
                      <Select
                        id="trash-filter-type"
                        onChange={(event) => update({ entity: event.target.value as TrashEntity | "ALL" })}
                        options={entityOptions}
                        value={draft.entity}
                      />
                    </FilterField>
                    <div className="grid grid-cols-2">
                      <FilterField label="Deleted from">
                        <DatePicker
                          onChange={(date) => update({ deletedFrom: date ? date.toISOString() : "" })}
                          placeholder="Any"
                          value={draft.deletedFrom ? new Date(draft.deletedFrom) : undefined}
                        />
                      </FilterField>
                      <FilterField label="Deleted to">
                        <DatePicker
                          onChange={(date) => update({ deletedTo: date ? date.toISOString() : "" })}
                          placeholder="Any"
                          value={draft.deletedTo ? new Date(draft.deletedTo) : undefined}
                        />
                      </FilterField>
                    </div>
                  </>
                )}
              </FilterPopover>
            </div>
            <FilterChips filters={trashFilters} onClearAll={trashFilters.length > 1 ? resetFilters : undefined} />
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
              stackOnMobile
              table={table}
            />
          )}

          <DataTablePagination
            table={table}
            totalRows={total}
          />
        </Card>
      </div>
    </div>
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

function formatDate(value: string | null, timeZone: string) {
  return value ? formatDateTime(value, timeZone) : "Not set";
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

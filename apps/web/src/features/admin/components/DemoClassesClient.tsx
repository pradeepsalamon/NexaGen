"use client";

import { useCallback, useMemo, useState } from "react";
import { format } from "date-fns";
import { Copy, Ban, CalendarDays, Plus, SlidersHorizontal, Pencil, RotateCcw, Info } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { DemoClass } from "@nexa-gen/types";

import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { DataTable } from "@/components/ui/DataTable";
import { DataTablePagination } from "@/components/ui/DataTablePagination";
import { DataTableToolbar } from "@/components/ui/DataTableToolbar";
import { DataTableSortButton } from "@/components/ui/DataTableSortButton";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { useDataTable } from "@/hooks/useDataTable";
import { useDemoClassesQuery, useCancelDemoClassMutation, useRestoreDemoClassMutation } from "../hooks/useAdminDemoClasses";
import { DemoClassForm } from "./DemoClassForm";
import { DemoClassDetailsDialog } from "./DemoClassDetailsDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/providers/ToastProvider";

type DemoClassManagementTab = "all" | "create";

const statusOptions = [
  { label: "Scheduled", value: "SCHEDULED" },
  { label: "Live", value: "LIVE" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Cancelled", value: "CANCELLED" }
];

export function DemoClassesClient() {
  const { data, isLoading } = useDemoClassesQuery();
  const cancelMutation = useCancelDemoClassMutation();
  const restoreMutation = useRestoreDemoClassMutation();
  const classes = data?.classes || [];
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<DemoClassManagementTab>("all");
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [detailsClassId, setDetailsClassId] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");

  const selectedClass = useMemo(
    () =>
      classes.find((c) => c.id === editingClassId) ??
      null,
    [classes, editingClassId]
  );

  const filteredClasses = useMemo(() => {
    return statusFilter === "ALL"
      ? classes
      : classes.filter((c) => c.status === statusFilter);
  }, [classes, statusFilter]);

  const editClass = useCallback((demoClass: DemoClass) => {
    setEditingClassId(demoClass.id);
    setActiveTab("create");
  }, []);

  function handleNewClass() {
    setEditingClassId(null);
    setActiveTab("create");
  }

  const handleCopyLink = (id: string) => {
    const link = `${window.location.origin}/demo/${id}`;
    navigator.clipboard.writeText(link);
    toast.success({ title: "Link copied to clipboard!" });
  };

  const handleCancel = (id: string) => {
    cancelMutation.mutate(id, {
      onSuccess: () => {
        toast.success({
          title: "Class Cancelled",
          message: "The demo class has been cancelled.",
          durationMs: 5000,
          action: {
            label: "Undo",
            onClick: () => handleRestore(id),
          },
        });
      }
    });
  };

  const handleRestore = (id: string) => {
    restoreMutation.mutate(id, {
      onSuccess: () => {
        toast.success({
          title: "Class Restored",
          message: "The class has been restored to SCHEDULED.",
          durationMs: 5000,
          action: {
            label: "Undo",
            onClick: () => handleCancel(id),
          },
        });
      }
    });
  };

  const columns = useMemo<ColumnDef<DemoClass>[]>(
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
            aria-label={`Select ${row.original.topic}`}
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(!!checked)}
          />
        )
      },
      {
        accessorKey: "topic",
        enableColumnFilter: true,
        header: ({ column }) => (
          <DataTableSortButton
            label="Topic"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-52">
            <p className="font-extrabold text-app-text">{row.original.topic}</p>
            {row.original.description && (
              <p className="mt-1 line-clamp-2 text-xs text-app-muted">
                {row.original.description}
              </p>
            )}
          </div>
        )
      },
      {
        accessorKey: "coachName",
        enableColumnFilter: true,
        header: ({ column }) => (
          <DataTableSortButton
            label="Assigned Coach"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => <div>{row.getValue("coachName")}</div>,
      },
      {
        accessorKey: "startsAt",
        enableColumnFilter: true,
        header: ({ column }) => (
          <DataTableSortButton
            label="Schedule"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => {
          const date = new Date(row.getValue("startsAt"));
          return (
            <div className="text-sm">
              <div>{format(date, "MMM d, yyyy")}</div>
              <div className="text-app-text-muted">{format(date, "h:mm a")}</div>
            </div>
          );
        },
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
        cell: ({ row }) => {
          const status = row.getValue("status") as string;
          return (
            <Badge
              variant={
                status === "LIVE"
                  ? "success"
                  : status === "COMPLETED"
                  ? "secondary"
                  : status === "CANCELLED"
                  ? "destructive"
                  : "default"
              }
            >
              {status}
            </Badge>
          );
        },
      },
      {
        id: "actions",
        enableHiding: false,
        enableSorting: false,
        header: "Actions",
        cell: ({ row }) => {
          const classItem = row.original;
          const canEditOrCancel = classItem.status === "SCHEDULED" || classItem.status === "LIVE";

          return (
            <TooltipProvider>
              <div className="flex items-center gap-2 justify-center">
                {['SCHEDULED', 'LIVE'].includes(row.original.status) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label={`Copy link for ${classItem.topic}`}
                        className="size-8 rounded-full border-primary p-0 text-app-text transition-colors hover:border-primary hover:bg-primary hover:text-white"
                        onClick={() => handleCopyLink(classItem.id)}
                        size="icon"
                        type="button"
                        variant="outline"
                      >
                        <Copy aria-hidden="true" className="size-4" strokeWidth={2.5} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy Invite Link</TooltipContent>
                  </Tooltip>
                )}

                {row.original.status === "CANCELLED" && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label="Restore demo class"
                          className="size-8 rounded-full border-secondary p-0 text-app-text transition-colors hover:border-secondary hover:bg-secondary hover:text-black"
                          disabled={restoreMutation.isPending}
                          onClick={() => handleRestore(row.original.id)}
                          size="icon"
                          type="button"
                          variant="outline"
                        >
                          <RotateCcw aria-hidden="true" className="size-4" strokeWidth={2.5} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Restore Demo Class</TooltipContent>
                    </Tooltip>
                  )}

                  {row.original.status === "COMPLETED" && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label="View demo class details"
                          className="size-8 rounded-full border-primary p-0 text-app-text transition-colors hover:border-primary hover:bg-primary hover:text-white"
                          onClick={() => {
                            setDetailsClassId(row.original.id);
                            setIsDetailsOpen(true);
                          }}
                          size="icon"
                          type="button"
                          variant="outline"
                        >
                          <Info aria-hidden="true" className="size-4" strokeWidth={2.5} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>View Details</TooltipContent>
                    </Tooltip>
                  )}

                {canEditOrCancel && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label={`Edit ${classItem.topic}`}
                          className="size-8 rounded-full border-secondary p-0 text-app-text transition-colors hover:border-secondary hover:bg-secondary hover:text-black"
                          onClick={() => editClass(classItem)}
                          size="icon"
                          type="button"
                          variant="outline"
                        >
                          <Pencil aria-hidden="true" className="size-4" strokeWidth={2.5} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit class</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label={`Cancel ${classItem.topic}`}
                          className="size-8 rounded-full border-app-danger p-0 text-app-text transition-colors hover:border-app-danger hover:bg-app-danger hover:text-white"
                          disabled={cancelMutation.isPending}
                          onClick={() => handleCancel(classItem.id)}
                          size="icon"
                          type="button"
                          variant="outline"
                        >
                          <Ban aria-hidden="true" className="size-4" strokeWidth={2.5} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Cancel class</TooltipContent>
                    </Tooltip>
                  </>
                )}
              </div>
            </TooltipProvider>
          );
        },
      },
    ],
    [cancelMutation.isPending, restoreMutation.isPending, editClass]
  );

  const {
    table,
    globalFilter,
    setGlobalFilter
  } = useDataTable<DemoClass, unknown>({
    columns: [],
    data: filteredClasses,
    initialPagination: { pageIndex: 0, pageSize: 10 }
  });

  table.setOptions((prev) => ({
    ...prev,
    data: filteredClasses,
    columns,
  }));

  return (
    <main className="min-h-[calc(100vh-64px)] bg-app-background px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-5">
        <Tabs
          onValueChange={(value) => {
            if (value === "create") {
              handleNewClass();
            } else {
              setActiveTab(value as DemoClassManagementTab);
            }
          }}
          value={activeTab}
        >
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase text-primary">
                Demo Class management
              </p>
              <h1 className="mt-2 text-3xl font-extrabold leading-tight text-app-text">
                Demo Classes
              </h1>
            </div>
            <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
              <TabsTrigger value="all">
                <CalendarDays aria-hidden="true" className="size-4" />
                All Classes
              </TabsTrigger>
              <TabsTrigger value="create">
                {editingClassId ? (
                  <Pencil aria-hidden="true" className="size-4" />
                ) : (
                  <Plus aria-hidden="true" className="size-4" />
                )}
                {editingClassId ? "Edit" : "Create"}
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
                searchPlaceholder="Filter demo classes..."
                searchValue={globalFilter}
              />

              <DataTable
                columnsLength={columns.length}
                isLoading={isLoading}
                noDataText="No demo classes found."
                table={table}
              />

              <DataTablePagination
                table={table}
                totalRows={table.getFilteredRowModel().rows.length}
              />
            </Card>
          </TabsContent>

          <TabsContent value="create" className="mt-6 outline-none">
            <DemoClassForm
              key={editingClassId ?? "new"}
              selectedClass={selectedClass}
              onSuccess={() => setActiveTab("all")}
            />
          </TabsContent>
        </Tabs>
      </div>

      <DemoClassDetailsDialog
        classId={detailsClassId}
        isOpen={isDetailsOpen}
        onOpenChange={(open) => {
          setIsDetailsOpen(open);
          if (!open) setTimeout(() => setDetailsClassId(null), 300); // clear after animation
        }}
      />
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

function formatColumnLabel(columnId: string) {
  const labels: Record<string, string> = {
    topic: "Topic",
    coachName: "Coach",
    startsAt: "Schedule",
    status: "Status",
  };
  return labels[columnId] ?? columnId;
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Pencil, Plus } from "lucide-react";
import type { DemoClass } from "@nexa-chess/types";

import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { DataTablePagination } from "@/components/ui/DataTablePagination";
import { DataTableToolbar } from "@/components/ui/DataTableToolbar";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { useDataTable } from "@/hooks/useDataTable";
import { useServerTable } from "@/hooks/useServerTable";
import { useDemoClassesQuery } from "../hooks/useAdminDemoClasses";
import { cancelDemoClass, restoreDemoClass } from "../api/adminApi";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { DemoClassForm } from "./DemoClassForm";
import { DemoClassDetailsDialog } from "./DemoClassDetailsDialog";
import { useDemoClassColumns } from "./demo-classes/useDemoClassColumns";
import { ColumnVisibilityMenu } from "./demo-classes/ColumnVisibilityMenu";

type DemoClassManagementTab = "all" | "create";

const statusOptions = [
  { label: "Scheduled", value: "SCHEDULED" },
  { label: "Live", value: "LIVE" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Cancelled", value: "CANCELLED" }
];

export function DemoClassesClient() {
  const toast = useToast();

  // Server-side pagination / search / sort / status filter (AUDIT H26).
  const serverTable = useServerTable({ pageSize: 10, initialSorting: [{ id: "startsAt", desc: false }] });
  const { clampToPageCount } = serverTable;
  const { data, isLoading } = useDemoClassesQuery(serverTable.params);
  const classes = useMemo(() => data?.classes ?? [], [data?.classes]);
  const pageCount = data?.pagination?.totalPages ?? 1;
  useEffect(() => {
    clampToPageCount(pageCount);
  }, [pageCount, clampToPageCount]);

  const [activeTab, setActiveTab] = useState<DemoClassManagementTab>("all");
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [detailsClassId, setDetailsClassId] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === editingClassId) ?? null,
    [classes, editingClassId]
  );

  const editClass = useCallback((demoClass: DemoClass) => {
    setEditingClassId(demoClass.id);
    setActiveTab("create");
  }, []);

  const handleNewClass = useCallback(() => {
    setEditingClassId(null);
    setActiveTab("create");
  }, []);

  const handleCopyLink = useCallback(
    (id: string) => {
      const link = `${window.location.origin}/demo/${id}`;
      navigator.clipboard.writeText(link);
      toast.success({ title: "Link copied to clipboard!" });
    },
    [toast]
  );

  const { run: runCancel, isPending: isCanceling } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: (id: string) => cancelDemoClass(id),
    undo: (id) => restoreDemoClass(id),
    toast: () => ({ title: "Class Cancelled", message: "The demo class has been cancelled." }),
    invalidates: [[...queryKeys.admin.base, "demo-classes"]]
  });

  const { run: runRestore, isPending: isRestoring } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: (id: string) => restoreDemoClass(id),
    undo: (id) => cancelDemoClass(id),
    toast: () => ({ title: "Class Restored", message: "The class has been restored to SCHEDULED." }),
    invalidates: [[...queryKeys.admin.base, "demo-classes"]]
  });

  const openDetails = useCallback((id: string) => {
    setDetailsClassId(id);
    setIsDetailsOpen(true);
  }, []);

  const columns = useDemoClassColumns({
    onEdit: editClass,
    onCopyLink: handleCopyLink,
    onCancel: runCancel,
    onRestore: runRestore,
    onViewDetails: openDetails,
    cancelPending: isCanceling,
    restorePending: isRestoring,
  });

  const { table } = useDataTable<DemoClass, unknown>({
    columns,
    data: classes,
    pagination: serverTable.pagination,
    setPagination: serverTable.setPagination,
    sorting: serverTable.sorting,
    setSorting: serverTable.setSorting,
    pageCount,
    ...serverTable.manual
  });

  return (
    <main className="min-h-[calc(100vh-64px)] bg-app-background px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-5">
        <Tabs
          onValueChange={(value) => {
            if (value === "create") {
              handleNewClass();
            } else {
              setEditingClassId(null);
              setActiveTab(value as DemoClassManagementTab);
            }
          }}
          value={activeTab}
        >
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase text-primary-ink">
                Demo Class management
              </p>
              <h1 className="text-2xl font-extrabold leading-tight tracking-tight mt-2 text-app-text">
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
                    onChange={(event) => serverTable.setStatus(event.target.value)}
                    options={[{ label: "All status", value: "ALL" }, ...statusOptions]}
                    value={serverTable.status}
                  />
                }
                onSearchChange={serverTable.setSearch}
                searchPlaceholder="Search demo classes..."
                searchValue={serverTable.search}
              />

              <DataTable
                columnsLength={columns.length}
                isLoading={isLoading}
                noDataText={
                  <div className="flex flex-col items-center justify-center space-y-4 py-4">
                    <p>No demo classes found.</p>
                    <Button onClick={() => setActiveTab("create")} size="sm">
                      <Plus className="mr-2 size-4" /> Create Demo Class
                    </Button>
                  </div>
                }
                table={table}
              />

              <DataTablePagination
                table={table}
                totalRows={data?.pagination?.total ?? 0}
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

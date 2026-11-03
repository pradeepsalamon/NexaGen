"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Pencil, Plus, Repeat } from "lucide-react";
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
import { DemoSchedulesPanel } from "./demo-classes/DemoSchedulesPanel";
import { demoShareText } from "../lib/demoLinks";
import { PageHeader } from "@/components/layout/PageHeader";

type DemoClassManagementTab = "all" | "schedules" | "create";

const statusOptions = [
  { label: "Scheduled", value: "SCHEDULED" },
  { label: "Live", value: "LIVE" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Cancelled", value: "CANCELLED" }
];

export function DemoClassesClient() {
  const toast = useToast();

  // Server-side pagination / search / sort / status filter (AUDIT H26).
  const serverTable = useServerTable({ pageSize: 10 });
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
    (demoClass: DemoClass) => {
      void navigator.clipboard.writeText(
        demoShareText(`/demo/${demoClass.id}`, demoClass.accessMode, demoClass.passcode)
      );
      toast.success({
        title: demoClass.accessMode === "PASSCODE" ? "Link and passcode copied" : "Link copied to clipboard!"
      });
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
    <div className="animate-fade-in pb-10">
      <div className="grid grid-cols-[minmax(0,1fr)]">
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
          <PageHeader
            actions={
            <TabsList aria-label="Demo classes view" className="w-full justify-start overflow-x-auto sm:w-fit">
              <TabsTrigger value="all">
                <CalendarDays aria-hidden="true" className="size-4" />
                All classes
              </TabsTrigger>
              <TabsTrigger value="schedules">
                <Repeat aria-hidden="true" className="size-4" />
                Schedules
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
            }
            description="Free trial classes for prospective students and their guests."
            title="Demo classes"
          />

          <TabsContent value="all" className="outline-none">
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
                    <Button onClick={() => setActiveTab("create")} size="sm" variant="outline">
                      <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} /> Create demo class
                    </Button>
                  </div>
                }
                stackOnMobile
                table={table}
              />

              <DataTablePagination
                table={table}
                totalRows={data?.pagination?.total ?? 0}
              />
            </Card>
          </TabsContent>

          <TabsContent value="schedules" className="outline-none">
            <DemoSchedulesPanel />
          </TabsContent>

          <TabsContent value="create" className="outline-none">
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
    </div>
  );
}

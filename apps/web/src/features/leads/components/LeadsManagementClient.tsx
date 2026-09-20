"use client";

import { useEffect, useMemo, useState } from "react";
import { Percent, Target, TrendingUp, UserPlus } from "lucide-react";
import type { LeadListItem } from "@nexa-chess/types";

import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { DataTablePagination } from "@/components/ui/DataTablePagination";
import { DataTableToolbar } from "@/components/ui/DataTableToolbar";
import { Select } from "@/components/ui/Select";
import { StatTile } from "@/components/ui/StatTile";
import { useDataTable } from "@/hooks/useDataTable";
import { useServerTable } from "@/hooks/useServerTable";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { useDeleteLeadMutation, useLeadMetricsQuery, useLeadsQuery } from "../hooks/useAdminLeads";
import { LEAD_STATUS_OPTIONS } from "../lib/leadStatus";
import { useLeadColumns } from "./useLeadColumns";
import { LeadDetailsDialog } from "./LeadDetailsDialog";

export function LeadsManagementClient() {
  const serverTable = useServerTable({ pageSize: 20, initialSorting: [{ id: "createdAt", desc: true }] });
  const { clampToPageCount } = serverTable;
  const { data, isLoading } = useLeadsQuery(serverTable.params);
  const leads = useMemo(() => data?.items ?? [], [data?.items]);
  const pageCount = data?.pagination?.totalPages ?? 1;
  useEffect(() => {
    clampToPageCount(pageCount);
  }, [pageCount, clampToPageCount]);

  const { data: metrics } = useLeadMetricsQuery();

  const [detailsLeadId, setDetailsLeadId] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const deleteMutation = useDeleteLeadMutation();

  const openDetails = (id: string) => {
    setDetailsLeadId(id);
    setIsDetailsOpen(true);
  };

  const columns = useLeadColumns({
    onViewDetails: openDetails,
    onDelete: (id: string) => setPendingDeleteId(id),
    deletePending: deleteMutation.isPending
  });

  const { table } = useDataTable<LeadListItem, unknown>({
    columns,
    data: leads,
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
        <header>
          <p className="text-xs font-extrabold uppercase text-primary">Academy leads</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight text-app-text">Leads</h1>
          <p className="mt-1 text-sm text-app-muted">
            Demo booking inquiries from the academy marketing site.
          </p>
        </header>

        {metrics ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              context="All time"
              icon={UserPlus}
              label="Total leads"
              tone="primary"
              value={String(metrics.leads.total)}
            />
            <StatTile
              context="Today"
              icon={Target}
              label="New today"
              tone="accent"
              value={String(metrics.leads.today)}
            />
            <StatTile
              context="All time"
              icon={TrendingUp}
              label="Visitor sessions"
              tone="secondary"
              value={String(metrics.visitors.total)}
            />
            <StatTile
              context={`${metrics.conversion.count} converted`}
              icon={Percent}
              label="Conversion rate"
              tone="warm"
              value={`${metrics.conversion.rate}%`}
            />
          </div>
        ) : null}

        <Card className="grid gap-4 p-4">
          <DataTableToolbar
            filters={
              <Select
                className="w-48"
                onChange={(event) => serverTable.setStatus(event.target.value)}
                options={[{ label: "All statuses", value: "ALL" }, ...LEAD_STATUS_OPTIONS]}
                value={serverTable.status}
              />
            }
            onSearchChange={serverTable.setSearch}
            searchPlaceholder="Search by student, parent, or phone..."
            searchValue={serverTable.search}
          />

          <DataTable
            columnsLength={columns.length}
            isLoading={isLoading}
            noDataText="No leads yet."
            table={table}
          />

          <DataTablePagination table={table} totalRows={data?.pagination?.total ?? 0} />
        </Card>
      </div>

      <LeadDetailsDialog
        isOpen={isDetailsOpen}
        leadId={detailsLeadId}
        onOpenChange={(open) => {
          setIsDetailsOpen(open);
          if (!open) setTimeout(() => setDetailsLeadId(null), 300);
        }}
      />

      <ConfirmationModal
        confirmLabel="Delete permanently"
        isConfirming={deleteMutation.isPending}
        isOpen={!!pendingDeleteId}
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => {
          if (!pendingDeleteId) return;
          deleteMutation.mutate(pendingDeleteId, {
            onSuccess: () => setPendingDeleteId(null)
          });
        }}
        title="Delete this lead?"
      >
        This permanently removes the lead and its activity/notes. This action cannot be undone.
      </ConfirmationModal>
    </main>
  );
}

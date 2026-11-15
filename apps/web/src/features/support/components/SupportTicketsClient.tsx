"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChartColumn, ExternalLink, MessageSquareText, Settings } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { SupportCategory, SupportTicketListItem, SupportTicketListQuery, SupportTicketStatus } from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { DataTablePagination } from "@/components/ui/DataTablePagination";
import { DataTableToolbar } from "@/components/ui/DataTableToolbar";
import { RowActions } from "@/components/ui/RowActions";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { useDataTable } from "@/hooks/useDataTable";
import { useServerTable } from "@/hooks/useServerTable";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { useSupportCountsQuery, useSupportTicketsQuery } from "../hooks/useSupportAdmin";
import {
  CATEGORY_OPTIONS,
  CONVERSATION_STATUS_BADGE,
  formatWaNumber,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_CONVERSATION_STATUS_LABELS,
  SUPPORT_TICKET_STATUS_LABELS,
  TICKET_STATUS_BADGE
} from "../lib/supportLabels";

type StatusTab = SupportTicketStatus | "ALL";
type AssignedFilter = "ALL" | "me" | "unassigned";

export const supportTicketHref = (id: string) => `/admin/support/tickets/${id}`;

/** `/admin/support`: tickets the WhatsApp bot opened (docs/WHATSAPP_SUPPORT.md). */
export function SupportTicketsClient() {
  // Open tickets first: that is the queue someone has to work through.
  const serverTable = useServerTable({ initialStatus: "OPEN", pageSize: 20 });
  const { clampToPageCount, setStatus } = serverTable;
  const [category, setCategory] = useState<SupportCategory | "ALL">("ALL");
  const [assigned, setAssigned] = useState<AssignedFilter>("ALL");
  const status = (serverTable.status === "ALL" ? "ALL" : serverTable.status) as StatusTab;

  const params: SupportTicketListQuery = {
    page: serverTable.params.page,
    pageSize: serverTable.params.pageSize,
    search: serverTable.params.search,
    ...(serverTable.params.status ? { status: serverTable.params.status as SupportTicketStatus } : {}),
    ...(category !== "ALL" ? { category } : {}),
    ...(assigned !== "ALL" ? { assigned } : {})
  };
  const { data, isLoading } = useSupportTicketsQuery(params);
  const { data: counts } = useSupportCountsQuery();
  const tickets = useMemo(() => data?.items ?? [], [data?.items]);
  const pageCount = data?.pagination.totalPages ?? 1;
  useEffect(() => {
    clampToPageCount(pageCount);
  }, [pageCount, clampToPageCount]);

  const timeZone = useUserTimeZone();
  const columns = useMemo<ColumnDef<SupportTicketListItem>[]>(
    () => [
      {
        cell: ({ row }) => (
          <div className="min-w-36">
            <Link className="font-semibold text-primary-ink hover:underline" href={supportTicketHref(row.original.id)}>
              {row.original.reference}
            </Link>
            <p className="mt-1 text-xs text-app-muted">{SUPPORT_CATEGORY_LABELS[row.original.category]}</p>
          </div>
        ),
        header: "Request",
        id: "reference",
        meta: { label: "Request" }
      },
      {
        cell: ({ row }) => (
          <div className="min-w-36">
            <p className="text-app-text">{row.original.contact.profileName ?? "WhatsApp user"}</p>
            <p className="text-xs text-app-muted">{formatWaNumber(row.original.contact.waId)}</p>
            {row.original.studentName ? <p className="text-xs text-app-muted">Student: {row.original.studentName}</p> : null}
          </div>
        ),
        header: "From",
        id: "contact",
        meta: { label: "From" }
      },
      {
        cell: ({ row }) => (
          <p className="line-clamp-2 min-w-48 max-w-md text-sm text-app-text">
            {row.original.summary ?? (row.original.handoff ? "Asked to talk to the team." : "-")}
          </p>
        ),
        header: "Summary",
        id: "summary",
        meta: { label: "Summary" }
      },
      {
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={TICKET_STATUS_BADGE[row.original.status]}>{SUPPORT_TICKET_STATUS_LABELS[row.original.status]}</Badge>
            <Badge variant={CONVERSATION_STATUS_BADGE[row.original.conversationStatus]}>
              {SUPPORT_CONVERSATION_STATUS_LABELS[row.original.conversationStatus]}
            </Badge>
          </div>
        ),
        header: "Status",
        id: "status",
        meta: { label: "Status" }
      },
      {
        cell: ({ row }) => <span className="text-sm text-app-text">{row.original.assignedTo?.name ?? "Unassigned"}</span>,
        header: "Assigned to",
        id: "assignedTo",
        meta: { label: "Assigned to" }
      },
      {
        cell: ({ row }) => <span className="whitespace-nowrap text-sm text-app-muted">{formatDateTime(row.original.updatedAt, timeZone)}</span>,
        header: "Last activity",
        id: "updatedAt",
        meta: { label: "Last activity" }
      },
      {
        cell: ({ row }) => (
          <RowActions
            actions={[
              { ariaLabel: `Open ${row.original.reference}`, href: supportTicketHref(row.original.id), icon: ExternalLink, label: "Open" }
            ]}
          />
        ),
        header: "",
        id: "actions"
      }
    ],
    [timeZone]
  );

  const { table } = useDataTable<SupportTicketListItem, unknown>({
    columns,
    data: tickets,
    pageCount,
    pagination: serverTable.pagination,
    setPagination: serverTable.setPagination,
    setSorting: serverTable.setSorting,
    sorting: serverTable.sorting,
    ...serverTable.manual
  });

  const tabLabel = (value: SupportTicketStatus, label: string) => (counts ? `${label} (${counts[value]})` : label);

  return (
    <div className="animate-fade-in pb-10">
      <Tabs onValueChange={(value) => setStatus(value)} value={status}>
        <PageHeader
          actions={
            <>
              <Button asChild variant="neutral">
                <Link href="/admin/support/insights">
                  <ChartColumn className="mr-1.5 size-4" strokeWidth={2.25} />
                  Insights
                </Link>
              </Button>
              <Button asChild variant="neutral">
                <Link href="/admin/support/settings">
                  <Settings className="mr-1.5 size-4" strokeWidth={2.25} />
                  Settings
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/admin/support/saved-replies">
                  <MessageSquareText className="mr-1.5 size-4" strokeWidth={2.25} />
                  Saved answers
                </Link>
              </Button>
            </>
          }
          description="Requests from the WhatsApp support bot: demo bookings, finished forms and customers who asked for a person."
          tabs={
            <TabsList>
              <TabsTrigger value="OPEN">{tabLabel("OPEN", "Open")}</TabsTrigger>
              <TabsTrigger value="IN_PROGRESS">{tabLabel("IN_PROGRESS", "In progress")}</TabsTrigger>
              <TabsTrigger value="RESOLVED">{tabLabel("RESOLVED", "Resolved")}</TabsTrigger>
              <TabsTrigger value="ALL">All</TabsTrigger>
            </TabsList>
          }
          title="WhatsApp support"
        />
      </Tabs>

      <Card className="grid gap-4 p-4">
        <DataTableToolbar
          filters={
            <>
              <Select
                aria-label="Filter by request type"
                className="w-full sm:w-48"
                onChange={(event) => {
                  setCategory(event.target.value as SupportCategory | "ALL");
                  serverTable.setPagination((p) => ({ ...p, pageIndex: 0 }));
                }}
                options={[{ label: "All request types", value: "ALL" }, ...CATEGORY_OPTIONS]}
                value={category}
              />
              <Select
                aria-label="Filter by assignee"
                className="w-full sm:w-44"
                onChange={(event) => {
                  setAssigned(event.target.value as AssignedFilter);
                  serverTable.setPagination((p) => ({ ...p, pageIndex: 0 }));
                }}
                options={[
                  { label: "Anyone", value: "ALL" },
                  { label: "Assigned to me", value: "me" },
                  { label: "Unassigned", value: "unassigned" }
                ]}
                value={assigned}
              />
            </>
          }
          onSearchChange={serverTable.setSearch}
          searchPlaceholder="Search by reference, name or number..."
          searchValue={serverTable.search}
        />

        <DataTable
          columnsLength={columns.length}
          isLoading={isLoading}
          noDataText={status === "OPEN" ? "No open requests. New ones appear here as the bot creates them." : "No requests match."}
          stackOnMobile
          table={table}
        />

        <DataTablePagination table={table} totalRows={data?.pagination.total ?? 0} />
      </Card>
    </div>
  );
}

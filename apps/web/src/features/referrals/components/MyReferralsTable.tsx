"use client";

import { useEffect, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReferralItem, ReferralStageItem } from "@nexa-chess/types";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { DataTablePagination } from "@/components/ui/DataTablePagination";
import { DataTableSortButton } from "@/components/ui/DataTableSortButton";
import { DataTableToolbar } from "@/components/ui/DataTableToolbar";
import { Select } from "@/components/ui/Select";
import { useDataTable } from "@/hooks/useDataTable";
import { useServerTable } from "@/hooks/useServerTable";
import { Badge } from "@/components/ui/Badge";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { useMyReferrals } from "../hooks/useReferrals";
import { StageBadge } from "./StageBadge";

type Props = {
  stages: ReferralStageItem[];
  /** SALES sees full names and contact details of their own referrals. */
  showContact: boolean;
};

export function MyReferralsTable({ showContact, stages }: Props) {
  const timeZone = useUserTimeZone();
  const serverTable = useServerTable({ pageSize: 20 });
  const { clampToPageCount } = serverTable;
  const params = useMemo(
    () => ({ ...serverTable.params, status: undefined, stageId: serverTable.status }),
    [serverTable.params, serverTable.status]
  );
  const { data, isLoading } = useMyReferrals(params);
  const pageCount = data?.pagination.totalPages ?? 1;
  useEffect(() => clampToPageCount(pageCount), [pageCount, clampToPageCount]);

  const columns = useMemo<ColumnDef<ReferralItem>[]>(
    () => [
      {
        accessorKey: "prospectName",
        cell: ({ row }) => (
          <div className="min-w-36">
            <p className="flex flex-wrap items-center gap-2 font-bold text-app-text">
              {row.original.prospectName ?? "Visitor"}
              {row.original.joined ? <Badge variant="success">Signed up</Badge> : null}
            </p>
            {row.original.prospectName ? null : <p className="text-xs text-app-muted">Opened your link</p>}
          </div>
        ),
        header: "Person",
        meta: { label: "Person" }
      },
      ...(showContact
        ? ([
            {
              cell: ({ row }) =>
                row.original.contact ? (
                  <div className="text-sm">
                    {row.original.contact.parentName ? <p className="text-app-text">{row.original.contact.parentName}</p> : null}
                    {row.original.contact.phone ? <p className="text-app-muted">{row.original.contact.phone}</p> : null}
                    {row.original.contact.email ? <p className="break-all text-xs text-app-muted">{row.original.contact.email}</p> : null}
                  </div>
                ) : (
                  <span className="text-app-muted">—</span>
                ),
              header: "Contact",
              id: "contact",
              meta: { label: "Contact" }
            }
          ] satisfies ColumnDef<ReferralItem>[])
        : []),
      {
        accessorKey: "stageName",
        cell: ({ row }) => <StageBadge name={row.original.stageName} tone={row.original.stageTone} />,
        header: "Stage",
        meta: { label: "Stage" }
      },
      {
        accessorKey: "visits",
        cell: ({ row }) => <span className="block text-right tabular-nums">{row.original.visits}</span>,
        header: () => <span className="block text-right">Visits</span>,
        meta: { label: "Visits" }
      },
      {
        accessorKey: "createdAt",
        cell: ({ row }) => formatFullDate(row.original.createdAt, timeZone),
        header: ({ column }) => <DataTableSortButton column={column} label="Started" />,
        meta: { label: "Started" }
      },
      {
        accessorKey: "stageChangedAt",
        cell: ({ row }) => formatFullDate(row.original.stageChangedAt, timeZone),
        header: ({ column }) => <DataTableSortButton column={column} label="Last update" />,
        meta: { label: "Last update" }
      }
    ],
    [showContact, timeZone]
  );

  const { table } = useDataTable<ReferralItem, unknown>({
    columns,
    data: data?.items ?? [],
    pageCount,
    pagination: serverTable.pagination,
    setPagination: serverTable.setPagination,
    setSorting: serverTable.setSorting,
    sorting: serverTable.sorting,
    ...serverTable.manual
  });

  return (
    <Card className="grid gap-4 p-4">
      <DataTableToolbar
        filters={
          <Select
            aria-label="Filter by stage"
            className="w-48"
            onChange={(event) => serverTable.setStatus(event.target.value)}
            options={[{ label: "All stages", value: "ALL" }, ...stages.map((stage) => ({ label: stage.name, value: stage.id }))]}
            value={serverTable.status}
          />
        }
        onSearchChange={serverTable.setSearch}
        searchPlaceholder="Search by name..."
        searchValue={serverTable.search}
      />
      <DataTable
        columnsLength={columns.length}
        isLoading={isLoading}
        noDataText="Nobody has opened your link yet. Share it to get started."
        stackOnMobile
        table={table}
      />
      <DataTablePagination table={table} totalRows={data?.pagination.total ?? 0} />
    </Card>
  );
}

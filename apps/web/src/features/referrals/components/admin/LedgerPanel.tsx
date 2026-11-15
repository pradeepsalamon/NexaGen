"use client";

import { useEffect, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  formatReferralWalletAmount,
  REFERRAL_CREDIT_ENTRY_LABELS,
  REFERRAL_WALLET_LABELS,
  type AdminReferralLedgerItem
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { DataTablePagination } from "@/components/ui/DataTablePagination";
import { DataTableToolbar } from "@/components/ui/DataTableToolbar";
import { Select } from "@/components/ui/Select";
import { useDataTable } from "@/hooks/useDataTable";
import { useServerTable } from "@/hooks/useServerTable";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { useAdminReferralLedger } from "../../hooks/useReferralAdmin";

/**
 * Every wallet movement of every user — rewards, withdrawals, payment codes,
 * points sent and received, conversions and admin adjustments.
 */
export function LedgerPanel() {
  const timeZone = useUserTimeZone();
  const serverTable = useServerTable({ pageSize: 25 });
  const { clampToPageCount } = serverTable;
  // The table's status filter is the wallet here.
  const { status: _status, ...params } = serverTable.params as typeof serverTable.params & { status?: string };
  const { data, isLoading } = useAdminReferralLedger({ ...params, wallet: serverTable.status });
  const pageCount = data?.pagination.totalPages ?? 1;
  useEffect(() => clampToPageCount(pageCount), [pageCount, clampToPageCount]);

  const columns = useMemo<ColumnDef<AdminReferralLedgerItem>[]>(
    () => [
      {
        accessorKey: "createdAt",
        cell: ({ row }) => formatFullDate(row.original.createdAt, timeZone),
        header: "Date",
        meta: { label: "Date" }
      },
      {
        accessorKey: "userName",
        cell: ({ row }) => (
          <div className="min-w-36">
            <p className="font-bold text-app-text">{row.original.userName}</p>
            <p className="text-xs text-app-muted">{row.original.userEmail}</p>
          </div>
        ),
        header: "Member",
        meta: { label: "Member" }
      },
      {
        accessorKey: "type",
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={row.original.wallet === "POINTS" ? "accent" : "secondary"}>
              {REFERRAL_WALLET_LABELS[row.original.wallet]}
            </Badge>
            {REFERRAL_CREDIT_ENTRY_LABELS[row.original.type]}
          </span>
        ),
        header: "Movement",
        meta: { label: "Movement" }
      },
      {
        accessorKey: "note",
        cell: ({ row }) => (
          <div className="max-w-72 text-sm text-app-muted">
            {row.original.note ?? "—"}
            {row.original.createdByName && row.original.createdByName !== row.original.userName ? (
              <p className="text-xs">by {row.original.createdByName}</p>
            ) : null}
          </div>
        ),
        header: "Details",
        meta: { label: "Details" }
      },
      {
        accessorKey: "amountMinor",
        cell: ({ row }) => (
          <span
            className={cn(
              "block text-right font-bold tabular-nums",
              row.original.amountMinor >= 0 ? "text-success-ink" : "text-app-text"
            )}
          >
            {row.original.amountMinor > 0 ? "+" : ""}
            {formatReferralWalletAmount(row.original.amountMinor, row.original.wallet, row.original.currency)}
          </span>
        ),
        header: () => <span className="block text-right">Amount</span>,
        meta: { label: "Amount" }
      }
    ],
    [timeZone]
  );

  const { table } = useDataTable<AdminReferralLedgerItem, unknown>({
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
      <p className="text-sm text-app-muted">
        Money never moves between members; points can be sent, and convert one way into money at the rate in Settings.
      </p>
      <DataTableToolbar
        filters={
          <Select
            aria-label="Filter by wallet"
            className="w-40"
            onChange={(event) => serverTable.setStatus(event.target.value)}
            options={[
              { label: "Both wallets", value: "ALL" },
              { label: "Money", value: "CASH" },
              { label: "Points", value: "POINTS" }
            ]}
            value={serverTable.status}
          />
        }
        onSearchChange={serverTable.setSearch}
        searchPlaceholder="Search member or note..."
        searchValue={serverTable.search}
      />
      <DataTable columnsLength={columns.length} isLoading={isLoading} noDataText="No wallet activity yet." stackOnMobile table={table} />
      <DataTablePagination table={table} totalRows={data?.pagination.total ?? 0} />
    </Card>
  );
}

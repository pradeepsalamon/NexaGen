"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Banknote, Eye, Gift, UserCheck, Users, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { REFERRER_ROLE_LABELS, REFERRER_ROLES, type AdminReferralItem } from "@nexa-chess/types";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { DataTablePagination } from "@/components/ui/DataTablePagination";
import { DataTableSortButton } from "@/components/ui/DataTableSortButton";
import { DataTableToolbar } from "@/components/ui/DataTableToolbar";
import { RowActions } from "@/components/ui/RowActions";
import { SectionCard } from "@/components/ui/SectionCard";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { StatTile } from "@/components/ui/StatTile";
import { useDataTable } from "@/hooks/useDataTable";
import { useServerTable } from "@/hooks/useServerTable";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { useAdminReferrals, useReferralOverview } from "../../hooks/useReferralAdmin";
import { money } from "../../lib/referralFormat";
import { ReferralFunnel } from "../ReferralFunnel";
import { StageBadge } from "../StageBadge";
import { ReferralDetailDialog } from "./ReferralDetailDialog";

type Props = {
  /** Set from the Referrers tab: show one referrer's referrals. */
  referrer: { id: string; name: string } | null;
  onClearReferrer: () => void;
};

export function PipelinePanel({ onClearReferrer, referrer }: Props) {
  const timeZone = useUserTimeZone();
  const { data: overview } = useReferralOverview();
  const serverTable = useServerTable({ pageSize: 20 });
  const { clampToPageCount } = serverTable;
  const [stageId, setStageId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const params = useMemo(
    () => ({
      ...serverTable.params,
      referrerId: referrer?.id,
      role: serverTable.status,
      stageId: stageId ?? undefined,
      status: undefined
    }),
    [serverTable.params, serverTable.status, stageId, referrer?.id]
  );
  const { data, isLoading } = useAdminReferrals(params);
  const pageCount = data?.pagination.totalPages ?? 1;
  useEffect(() => clampToPageCount(pageCount), [pageCount, clampToPageCount]);

  const columns = useMemo<ColumnDef<AdminReferralItem>[]>(
    () => [
      {
        accessorKey: "prospectName",
        cell: ({ row }) => (
          <div className="min-w-36">
            <p className="flex flex-wrap items-center gap-2 font-bold text-app-text">
              {row.original.prospectName ?? row.original.referredUser?.name ?? "Visitor"}
              {row.original.joined ? <Badge variant="success">Signed up</Badge> : null}
            </p>
            {row.original.contact?.phone ? <p className="text-xs text-app-muted">{row.original.contact.phone}</p> : null}
          </div>
        ),
        header: "Person",
        meta: { label: "Person" }
      },
      {
        accessorKey: "referrerName",
        cell: ({ row }) => (
          <div>
            <p className="text-app-text">{row.original.referrerName}</p>
            <p className="text-xs text-app-muted">
              {REFERRER_ROLE_LABELS[row.original.referrerRole]} · <span className="font-mono">{row.original.code}</span>
            </p>
          </div>
        ),
        header: "Referred by",
        meta: { label: "Referred by" }
      },
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
        header: ({ column }) => <DataTableSortButton column={column} label="Last move" />,
        meta: { label: "Last move" }
      },
      {
        cell: ({ row }) => (
          <RowActions actions={[{ icon: Eye, label: "Open referral", onSelect: () => setOpenId(row.original.id) }]} />
        ),
        header: () => <span className="sr-only">Actions</span>,
        id: "actions"
      }
    ],
    [timeZone]
  );

  const { table } = useDataTable<AdminReferralItem, unknown>({
    columns,
    data: data?.items ?? [],
    pageCount,
    pagination: serverTable.pagination,
    setPagination: serverTable.setPagination,
    setSorting: serverTable.setSorting,
    sorting: serverTable.sorting,
    ...serverTable.manual
  });

  const totals = overview?.totals;
  const currency = overview?.currency ?? "INR";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      {totals ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile context={`${totals.visits} link visits · ${totals.joined} signed up`} icon={Users} label="Referrals" tone="primary" value={String(totals.referrals)} />
          <StatTile
            context={totals.referrals ? `${Math.round((totals.converted / totals.referrals) * 100)}% of referrals` : "No referrals yet"}
            icon={UserCheck}
            label="Onboarded"
            tone="accent"
            value={String(totals.converted)}
          />
          <StatTile
            context={money(totals.pendingRewardsMinor, currency)}
            icon={Gift}
            label="Rewards to approve"
            tone="reward"
            value={String(totals.pendingRewards)}
          />
          <StatTile
            context={money(totals.openWithdrawalsMinor, currency)}
            icon={Banknote}
            label="Withdrawals to pay"
            tone="secondary"
            value={String(totals.openWithdrawals)}
          />
        </div>
      ) : null}

      {overview ? (
        <SectionCard description="Referrals in each stage right now. Pick a stage to filter the list." title="Pipeline">
          <ReferralFunnel
            countLabel="in this stage"
            onSelect={(id) => {
              setStageId(id);
              serverTable.setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
            selectedStageId={stageId}
            stages={overview.stages.map((stage) => ({ ...stage, count: stage.referralCount }))}
          />
        </SectionCard>
      ) : null}

      <Card className="grid gap-4 p-4">
        {referrer ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-app-text">
            <span>
              Showing referrals by <span className="font-bold">{referrer.name}</span>
            </span>
            <Button onClick={onClearReferrer} size="sm" variant="neutral">
              <X aria-hidden="true" className="size-4" strokeWidth={2.5} />
              Show everyone
            </Button>
          </div>
        ) : null}
        <DataTableToolbar
          filters={
            <Select
              aria-label="Filter by referrer role"
              className="w-44"
              onChange={(event) => serverTable.setStatus(event.target.value)}
              options={[
                { label: "All referrers", value: "ALL" },
                ...REFERRER_ROLES.map((role) => ({ label: REFERRER_ROLE_LABELS[role], value: role }))
              ]}
              value={serverTable.status}
            />
          }
          onSearchChange={serverTable.setSearch}
          searchPlaceholder="Search person, referrer, code or phone..."
          searchValue={serverTable.search}
        />
        <DataTable
          columnsLength={columns.length}
          isLoading={isLoading}
          noDataText="No referrals match."
          stackOnMobile
          table={table}
        />
        <DataTablePagination table={table} totalRows={data?.pagination.total ?? 0} />
      </Card>

      <ReferralDetailDialog onClose={() => setOpenId(null)} referralId={openId} stages={overview?.stages ?? []} />
    </div>
  );
}

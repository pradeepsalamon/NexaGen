"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Ban, Check } from "lucide-react";
import { formatReferralReward, REFERRER_ROLE_LABELS, type ReferralRewardItem } from "@nexa-chess/types";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { DataTablePagination } from "@/components/ui/DataTablePagination";
import { DataTableToolbar } from "@/components/ui/DataTableToolbar";
import { FormField } from "@/components/ui/FormField";
import { RowActions, type RowAction } from "@/components/ui/RowActions";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useDataTable } from "@/hooks/useDataTable";
import { useServerTable } from "@/hooks/useServerTable";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { referralAdminApi } from "../../api/referralAdminApi";
import { useAdminReferralRewards, useReferralAdminMutation } from "../../hooks/useReferralAdmin";
import { DISCOUNT_STATUS_LABEL, REWARD_STATUS_LABEL, REWARD_STATUS_VARIANT } from "../../lib/referralFormat";

export function RewardsPanel() {
  const timeZone = useUserTimeZone();
  const serverTable = useServerTable({ pageSize: 20 });
  const { clampToPageCount } = serverTable;
  const [beneficiary, setBeneficiary] = useState("ALL");
  const { data, isLoading } = useAdminReferralRewards({ ...serverTable.params, beneficiary });
  const pageCount = data?.pagination.totalPages ?? 1;
  useEffect(() => clampToPageCount(pageCount), [pageCount, clampToPageCount]);
  const [cancelling, setCancelling] = useState<ReferralRewardItem | null>(null);
  const [reason, setReason] = useState("");

  const approve = useReferralAdminMutation(referralAdminApi.approveReward, {
    failure: "Could not approve the reward",
    success: "Reward credited"
  });
  const cancel = useReferralAdminMutation(
    (args: { id: string; reason: string }) => referralAdminApi.cancelReward(args.id, { reason: args.reason || undefined }),
    { failure: "Could not cancel the reward", success: "Reward cancelled" }
  );

  const columns = useMemo<ColumnDef<ReferralRewardItem>[]>(
    () => [
      {
        accessorKey: "referrerName",
        cell: ({ row }) => (
          <div className="min-w-36">
            <p className="font-bold text-app-text">{row.original.referrerName}</p>
            {row.original.beneficiary === "REFERRED" ? (
              <Badge variant="accent">New member</Badge>
            ) : (
              <p className="text-xs text-app-muted">{REFERRER_ROLE_LABELS[row.original.referrerRole]}</p>
            )}
          </div>
        ),
        header: "Given to",
        meta: { label: "Given to" }
      },
      {
        accessorKey: "ruleName",
        cell: ({ row }) => (
          <div className="min-w-44">
            <p className="text-app-text">{row.original.ruleName}</p>
            <p className="text-xs text-app-muted">
              {row.original.beneficiary === "REFERRED" ? row.original.description : (row.original.prospectName ?? row.original.description)}
            </p>
            {row.original.discountCode ? (
              <p className="font-mono text-xs font-bold text-app-text">
                {row.original.discountCode}
                {row.original.discountStatus ? ` · ${DISCOUNT_STATUS_LABEL[row.original.discountStatus]}` : ""}
              </p>
            ) : null}
          </div>
        ),
        header: "Reward",
        meta: { label: "Reward" }
      },
      {
        accessorKey: "status",
        cell: ({ row }) => <Badge variant={REWARD_STATUS_VARIANT[row.original.status]}>{REWARD_STATUS_LABEL[row.original.status]}</Badge>,
        header: "Status",
        meta: { label: "Status" }
      },
      {
        accessorKey: "createdAt",
        cell: ({ row }) => formatFullDate(row.original.createdAt, timeZone),
        header: "Earned",
        meta: { label: "Earned" }
      },
      {
        accessorKey: "amountMinor",
        cell: ({ row }) => (
          <span className="block text-right font-bold tabular-nums">
            {formatReferralReward(row.original.amountMinor, row.original.unit, row.original.currency)}
          </span>
        ),
        header: () => <span className="block text-right">Amount</span>,
        meta: { label: "Amount" }
      },
      {
        cell: ({ row }) => {
          const actions: RowAction[] = [];
          if (row.original.status === "PENDING") {
            actions.push({ icon: Check, label: "Approve and credit", onSelect: () => approve.mutate(row.original.id) });
          }
          if (row.original.status !== "CANCELLED") {
            actions.push({
              icon: Ban,
              label: row.original.status === "CREDITED" ? "Reverse reward" : "Cancel reward",
              onSelect: () => {
                setReason("");
                setCancelling(row.original);
              },
              tone: "danger"
            });
          }
          return actions.length ? <RowActions actions={actions} /> : null;
        },
        header: () => <span className="sr-only">Actions</span>,
        id: "actions"
      }
    ],
    [approve, timeZone]
  );

  const { table } = useDataTable<ReferralRewardItem, unknown>({
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
          <>
          <Select
            aria-label="Filter by recipient"
            className="w-44"
            onChange={(event) => setBeneficiary(event.target.value)}
            options={[
              { label: "Everyone", value: "ALL" },
              { label: "Referrers", value: "REFERRER" },
              { label: "New members", value: "REFERRED" }
            ]}
            value={beneficiary}
          />
          <Select
            aria-label="Filter by status"
            className="w-48"
            onChange={(event) => serverTable.setStatus(event.target.value)}
            options={[
              { label: "All rewards", value: "ALL" },
              { label: REWARD_STATUS_LABEL.PENDING, value: "PENDING" },
              { label: REWARD_STATUS_LABEL.CREDITED, value: "CREDITED" },
              { label: REWARD_STATUS_LABEL.CANCELLED, value: "CANCELLED" }
            ]}
            value={serverTable.status}
          />
          </>
        }
        onSearchChange={serverTable.setSearch}
        searchPlaceholder="Search referrer or rule..."
        searchValue={serverTable.search}
      />
      <DataTable columnsLength={columns.length} isLoading={isLoading} noDataText="No rewards yet." stackOnMobile table={table} />
      <DataTablePagination table={table} totalRows={data?.pagination.total ?? 0} />

      <ConfirmationModal
        confirmLabel={cancelling?.status === "CREDITED" ? "Reverse reward" : "Cancel reward"}
        isConfirming={cancel.isPending}
        isOpen={!!cancelling}
        onCancel={() => setCancelling(null)}
        onConfirm={() => {
          if (!cancelling) return;
          cancel.mutate({ id: cancelling.id, reason }, { onSuccess: () => setCancelling(null) });
        }}
        title={cancelling?.status === "CREDITED" ? "Reverse this reward?" : "Cancel this reward?"}
      >
        <div className="grid gap-3">
          <p>
            {cancelling?.status === "CREDITED"
              ? cancelling.unit === "DISCOUNT_PERCENT"
                ? "The discount code is switched off. A code already used at checkout cannot be taken back."
                : "The amount is taken back from their wallet (their balance can go below zero)."
              : "They will not receive it."}
          </p>
          <FormField id="reward-cancel-reason" label="Reason (optional)">
            <Textarea id="reward-cancel-reason" maxLength={500} onChange={(event) => setReason(event.target.value)} rows={2} value={reason} />
          </FormField>
        </div>
      </ConfirmationModal>
    </Card>
  );
}

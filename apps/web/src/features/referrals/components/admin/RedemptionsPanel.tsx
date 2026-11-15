"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Ban, Check, Undo2 } from "lucide-react";
import { formatReferralPoints, formatReferralVoucherValue, REFERRAL_REDEMPTION_STATUSES, type ReferralRedemptionItem } from "@nexa-chess/types";
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
import { useAdminReferralRedemptions, useReferralAdminMutation } from "../../hooks/useReferralAdmin";
import { DISCOUNT_STATUS_LABEL, REDEMPTION_STATUS_LABEL, REDEMPTION_STATUS_VARIANT } from "../../lib/referralFormat";

type Closing = { item: ReferralRedemptionItem; kind: "reject" | "revoke" };

/** Every voucher a student redeemed; approve or reject waiting ones, take back an unused code. */
export function RedemptionsPanel() {
  const timeZone = useUserTimeZone();
  const serverTable = useServerTable({ pageSize: 20 });
  const { clampToPageCount } = serverTable;
  const { data, isLoading } = useAdminReferralRedemptions({ ...serverTable.params });
  const pageCount = data?.pagination.totalPages ?? 1;
  useEffect(() => clampToPageCount(pageCount), [pageCount, clampToPageCount]);
  const [closing, setClosing] = useState<Closing | null>(null);
  const [note, setNote] = useState("");

  const approve = useReferralAdminMutation(referralAdminApi.approveRedemption, {
    failure: "Could not approve",
    success: "Approved — the student has their reward"
  });
  const close = useReferralAdminMutation(
    (args: { id: string; kind: Closing["kind"]; note: string }) =>
      args.kind === "reject"
        ? referralAdminApi.rejectRedemption(args.id, { adminNote: args.note })
        : referralAdminApi.revokeRedemption(args.id, { adminNote: args.note }),
    { failure: "Could not update the redemption", success: "Done — the points were returned" }
  );

  const columns = useMemo<ColumnDef<ReferralRedemptionItem>[]>(
    () => [
      {
        accessorKey: "userName",
        cell: ({ row }) => (
          <div className="min-w-36">
            <p className="font-bold text-app-text">{row.original.userName}</p>
            <p className="text-xs text-app-muted">{row.original.userEmail}</p>
          </div>
        ),
        header: "Student",
        meta: { label: "Student" }
      },
      {
        accessorKey: "voucherName",
        cell: ({ row }) => (
          <div className="min-w-44">
            <p className="text-app-text">{row.original.voucherName}</p>
            <p className="text-xs text-app-muted">{formatReferralVoucherValue(row.original, row.original.currency)}</p>
          </div>
        ),
        header: "Voucher",
        meta: { label: "Voucher" }
      },
      {
        accessorKey: "status",
        cell: ({ row }) => (
          <Badge variant={REDEMPTION_STATUS_VARIANT[row.original.status]}>{REDEMPTION_STATUS_LABEL[row.original.status]}</Badge>
        ),
        header: "Status",
        meta: { label: "Status" }
      },
      {
        cell: ({ row }) => {
          const item = row.original;
          if (item.discountCode) {
            return (
              <span className="font-mono text-xs font-bold text-app-text">
                {item.discountCode}
                {item.discountStatus ? ` · ${DISCOUNT_STATUS_LABEL[item.discountStatus]}` : ""}
              </span>
            );
          }
          if (item.accessEndsAt) {
            return (
              <span className="text-xs text-app-muted">
                {item.planName ?? "Access"} until {formatFullDate(item.accessEndsAt, timeZone)}
              </span>
            );
          }
          return <span className="text-xs text-app-muted">{item.adminNote ?? "—"}</span>;
        },
        header: "Details",
        id: "details",
        meta: { label: "Details" }
      },
      {
        accessorKey: "createdAt",
        cell: ({ row }) => formatFullDate(row.original.createdAt, timeZone),
        header: "Date",
        meta: { label: "Date" }
      },
      {
        accessorKey: "pointsCost",
        cell: ({ row }) => <span className="block text-right font-bold tabular-nums">{formatReferralPoints(row.original.pointsCost)}</span>,
        header: () => <span className="block text-right">Points</span>,
        meta: { label: "Points" }
      },
      {
        cell: ({ row }) => {
          const item = row.original;
          const actions: RowAction[] = [];
          if (item.status === "PENDING") {
            actions.push({ icon: Check, label: "Approve", onSelect: () => approve.mutate(item.id) });
            actions.push({ icon: Ban, label: "Reject", onSelect: () => open({ item, kind: "reject" }), tone: "danger" });
          }
          if (item.status === "FULFILLED" && item.discountStatus === "ACTIVE") {
            actions.push({ icon: Undo2, label: "Take back code", onSelect: () => open({ item, kind: "revoke" }), tone: "danger" });
          }
          return actions.length ? <RowActions actions={actions} /> : null;
        },
        header: () => <span className="sr-only">Actions</span>,
        id: "actions"
      }
    ],
    [approve, timeZone]
  );

  function open(next: Closing) {
    setNote("");
    setClosing(next);
  }

  const { table } = useDataTable<ReferralRedemptionItem, unknown>({
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
            aria-label="Filter by status"
            className="w-48"
            onChange={(event) => serverTable.setStatus(event.target.value)}
            options={[
              { label: "All redemptions", value: "ALL" },
              ...REFERRAL_REDEMPTION_STATUSES.map((status) => ({ label: REDEMPTION_STATUS_LABEL[status], value: status }))
            ]}
            value={serverTable.status}
          />
        }
        onSearchChange={serverTable.setSearch}
        searchPlaceholder="Search student or voucher..."
        searchValue={serverTable.search}
      />
      <DataTable columnsLength={columns.length} isLoading={isLoading} noDataText="No redemptions yet." stackOnMobile table={table} />
      <DataTablePagination table={table} totalRows={data?.pagination.total ?? 0} />

      <ConfirmationModal
        confirmLabel={closing?.kind === "revoke" ? "Take back code" : "Reject"}
        isConfirming={close.isPending}
        isOpen={!!closing}
        onCancel={() => setClosing(null)}
        onConfirm={() => {
          if (!closing || !note.trim()) return;
          close.mutate({ id: closing.item.id, kind: closing.kind, note: note.trim() }, { onSuccess: () => setClosing(null) });
        }}
        title={closing?.kind === "revoke" ? "Take back this code?" : "Reject this request?"}
      >
        <div className="grid gap-3">
          <p>
            {closing?.kind === "revoke"
              ? "The code stops working and the student gets their points back. A code already used at checkout cannot be taken back."
              : "The student gets their points back."}
          </p>
          <FormField hint="The student sees this." id="redemption-note" label="Reason" required>
            <Textarea id="redemption-note" maxLength={500} onChange={(event) => setNote(event.target.value)} rows={2} value={note} />
          </FormField>
        </div>
      </ConfirmationModal>
    </Card>
  );
}

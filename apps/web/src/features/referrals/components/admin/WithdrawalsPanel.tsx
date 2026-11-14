"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { BadgeCheck, Download, X } from "lucide-react";
import { API_ROUTES, REFERRER_ROLE_LABELS, type ReferralWithdrawalItem } from "@nexa-chess/types";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { DataTablePagination } from "@/components/ui/DataTablePagination";
import { DataTableToolbar } from "@/components/ui/DataTableToolbar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { LinkedText } from "@/components/ui/FormattedText";
import { RowActions } from "@/components/ui/RowActions";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useDataTable } from "@/hooks/useDataTable";
import { useServerTable } from "@/hooks/useServerTable";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { apiBaseUrl } from "@/lib/apiBase";
import { formatFullDate } from "@/lib/datetime";
import { referralAdminApi } from "../../api/referralAdminApi";
import { useAdminReferralWithdrawals, useReferralAdminMutation } from "../../hooks/useReferralAdmin";
import { money, WITHDRAWAL_STATUS_LABEL, WITHDRAWAL_STATUS_VARIANT } from "../../lib/referralFormat";

type Action = { kind: "pay" | "reject"; withdrawal: ReferralWithdrawalItem } | null;

export function WithdrawalsPanel() {
  const timeZone = useUserTimeZone();
  const serverTable = useServerTable({ pageSize: 20 });
  const { clampToPageCount } = serverTable;
  const { data, isLoading } = useAdminReferralWithdrawals({ ...serverTable.params });
  const pageCount = data?.pagination.totalPages ?? 1;
  useEffect(() => clampToPageCount(pageCount), [pageCount, clampToPageCount]);
  const [action, setAction] = useState<Action>(null);
  // The same search and status as the table, every page of it.
  const exportHref = `${apiBaseUrl()}${API_ROUTES.adminReferrals.withdrawalsExport}?${new URLSearchParams({
    ...(serverTable.params.search ? { search: serverTable.params.search } : {}),
    ...(serverTable.params.status ? { status: serverTable.params.status } : {})
  }).toString()}`;

  const columns = useMemo<ColumnDef<ReferralWithdrawalItem>[]>(
    () => [
      {
        accessorKey: "userName",
        cell: ({ row }) => (
          <div className="min-w-36">
            <p className="font-bold text-app-text">{row.original.userName}</p>
            <p className="text-xs text-app-muted">{REFERRER_ROLE_LABELS[row.original.userRole]}</p>
          </div>
        ),
        header: "Referrer",
        meta: { label: "Referrer" }
      },
      {
        accessorKey: "payoutDetails",
        cell: ({ row }) => (
          <div className="max-w-64 text-sm">
            <LinkedText text={row.original.payoutDetails} />
            {row.original.payoutReference ? <p className="text-xs text-app-muted">Ref {row.original.payoutReference}</p> : null}
            {row.original.adminNote ? <p className="text-xs text-app-muted">{row.original.adminNote}</p> : null}
          </div>
        ),
        header: "Pay to",
        meta: { label: "Pay to" }
      },
      {
        accessorKey: "status",
        cell: ({ row }) => (
          <Badge variant={WITHDRAWAL_STATUS_VARIANT[row.original.status]}>{WITHDRAWAL_STATUS_LABEL[row.original.status]}</Badge>
        ),
        header: "Status",
        meta: { label: "Status" }
      },
      {
        accessorKey: "createdAt",
        cell: ({ row }) => formatFullDate(row.original.createdAt, timeZone),
        header: "Requested",
        meta: { label: "Requested" }
      },
      {
        accessorKey: "amountMinor",
        cell: ({ row }) => (
          <span className="block text-right font-bold tabular-nums">{money(row.original.amountMinor, row.original.currency)}</span>
        ),
        header: () => <span className="block text-right">Amount</span>,
        meta: { label: "Amount" }
      },
      {
        cell: ({ row }) =>
          row.original.status === "REQUESTED" ? (
            <RowActions
              actions={[
                { icon: BadgeCheck, label: "Mark as paid", onSelect: () => setAction({ kind: "pay", withdrawal: row.original }) },
                { icon: X, label: "Reject", onSelect: () => setAction({ kind: "reject", withdrawal: row.original }), tone: "danger" }
              ]}
            />
          ) : null,
        header: () => <span className="sr-only">Actions</span>,
        id: "actions"
      }
    ],
    [timeZone]
  );

  const { table } = useDataTable<ReferralWithdrawalItem, unknown>({
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
        Pay the amount outside the app (UPI or bank transfer), then mark it paid with the transfer reference. Rejecting returns
        the credits to the referrer. To pay several at once, filter to Requested and export the list.
      </p>
      <DataTableToolbar
        actions={
          <Button asChild variant="outline">
            <a download href={exportHref}>
              <Download aria-hidden="true" className="size-4" strokeWidth={2.5} />
              Export CSV
            </a>
          </Button>
        }
        filters={
          <Select
            aria-label="Filter by status"
            className="w-44"
            onChange={(event) => serverTable.setStatus(event.target.value)}
            options={[
              { label: "All withdrawals", value: "ALL" },
              ...(["REQUESTED", "PAID", "REJECTED", "CANCELLED"] as const).map((status) => ({
                label: WITHDRAWAL_STATUS_LABEL[status],
                value: status
              }))
            ]}
            value={serverTable.status}
          />
        }
        onSearchChange={serverTable.setSearch}
        searchPlaceholder="Search referrer..."
        searchValue={serverTable.search}
      />
      <DataTable columnsLength={columns.length} isLoading={isLoading} noDataText="No withdrawal requests." stackOnMobile table={table} />
      <DataTablePagination table={table} totalRows={data?.pagination.total ?? 0} />
      {action ? <WithdrawalActionDialog action={action} onClose={() => setAction(null)} /> : null}
    </Card>
  );
}

function WithdrawalActionDialog({ action, onClose }: { action: NonNullable<Action>; onClose: () => void }) {
  const { kind, withdrawal } = action;
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pay = useReferralAdminMutation(
    () => referralAdminApi.payWithdrawal(withdrawal.id, { adminNote: note.trim() || undefined, payoutReference: reference.trim() }),
    { failure: "Could not mark it paid", success: "Withdrawal marked paid" }
  );
  const reject = useReferralAdminMutation(() => referralAdminApi.rejectWithdrawal(withdrawal.id, { adminNote: note.trim() }), {
    failure: "Could not reject",
    success: "Withdrawal rejected, credits returned"
  });

  const submit = async () => {
    if (kind === "pay" && !reference.trim()) return setError("Add the transfer reference.");
    if (kind === "reject" && !note.trim()) return setError("Say why.");
    setError(null);
    await (kind === "pay" ? pay : reject).mutateAsync(undefined);
    onClose();
  };

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : onClose())} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{kind === "pay" ? "Mark withdrawal as paid" : "Reject withdrawal"}</DialogTitle>
          <DialogDescription>
            {money(withdrawal.amountMinor, withdrawal.currency)} to {withdrawal.userName}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="rounded-control border border-app-border bg-app-soft p-3 text-sm">
            <p className="text-xs text-app-muted">Pay to</p>
            <LinkedText text={withdrawal.payoutDetails} />
          </div>
          {kind === "pay" ? (
            <FormField id="withdrawal-reference" label="Transfer reference" required>
              <Input id="withdrawal-reference" onChange={(event) => setReference(event.target.value)} value={reference} />
            </FormField>
          ) : null}
          <FormField id="withdrawal-note" label={kind === "pay" ? "Note (optional)" : "Reason"} required={kind === "reject"}>
            <Textarea id="withdrawal-note" maxLength={500} onChange={(event) => setNote(event.target.value)} rows={2} value={note} />
          </FormField>
          {error ? <Alert variant="error">{error}</Alert> : null}
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="neutral">
            Cancel
          </Button>
          <Button
            isLoading={pay.isPending || reject.isPending}
            onClick={() => void submit().catch(() => undefined)}
            variant={kind === "pay" ? "primary" : "destructive"}
          >
            {kind === "pay" ? "Mark paid" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

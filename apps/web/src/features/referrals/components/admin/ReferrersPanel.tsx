"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Coins, ListFilter, Pause, PencilLine, Play, Send, UserPlus } from "lucide-react";
import {
  adjustReferralCreditsRequestSchema,
  formatReferralPoints,
  referralCodeSchema,
  REFERRER_ROLE_LABELS,
  REFERRER_ROLES,
  type ReferralWallet,
  type ReferrerStatsItem
} from "@nexa-chess/types";
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
import { RowActions, type RowAction } from "@/components/ui/RowActions";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { useDataTable } from "@/hooks/useDataTable";
import { useServerTable } from "@/hooks/useServerTable";
import { referralAdminApi } from "../../api/referralAdminApi";
import { useReferralAdminMutation, useReferralOverview, useReferrers } from "../../hooks/useReferralAdmin";
import { money, parseMajorAmount } from "../../lib/referralFormat";
import { NewSalesAccountDialog, SendAccessLinkDialog } from "./SalesAccessDialogs";

type DialogState = { kind: "access" | "code" | "credits"; referrer: ReferrerStatsItem } | { kind: "new-sales" } | null;

export function ReferrersPanel({ onViewReferrals }: { onViewReferrals: (referrer: ReferrerStatsItem) => void }) {
  const serverTable = useServerTable({ pageSize: 20 });
  const { clampToPageCount } = serverTable;
  const params = useMemo(
    () => ({ ...serverTable.params, role: serverTable.status, status: undefined }),
    [serverTable.params, serverTable.status]
  );
  const { data, isLoading } = useReferrers(params);
  const currency = useReferralOverview().data?.currency ?? "INR";
  const pageCount = data?.pagination.totalPages ?? 1;
  useEffect(() => clampToPageCount(pageCount), [pageCount, clampToPageCount]);
  const [dialog, setDialog] = useState<DialogState>(null);

  const toggle = useReferralAdminMutation(
    (args: { userId: string; isActive: boolean }) => referralAdminApi.updateReferrerCode(args.userId, { isActive: args.isActive }),
    { failure: "Could not update the link", success: "Link updated" }
  );

  const columns = useMemo<ColumnDef<ReferrerStatsItem>[]>(
    () => [
      {
        accessorKey: "name",
        cell: ({ row }) => (
          <div className="min-w-40">
            <p className="font-bold text-app-text">{row.original.name}</p>
            <p className="break-all text-xs text-app-muted">{row.original.email}</p>
            {row.original.role === "SALES" && !row.original.lastLoginAt ? (
              <Badge className="mt-1" variant="info">
                Never signed in
              </Badge>
            ) : null}
          </div>
        ),
        header: "Referrer",
        meta: { label: "Referrer" }
      },
      {
        accessorKey: "role",
        cell: ({ row }) => <Badge variant="secondary">{REFERRER_ROLE_LABELS[row.original.role]}</Badge>,
        header: "Role",
        meta: { label: "Role" }
      },
      {
        accessorKey: "code",
        cell: ({ row }) =>
          row.original.code ? (
            <span className="flex items-center gap-2">
              <span className="font-mono font-bold">{row.original.code}</span>
              {row.original.code && !row.original.codeActive ? <Badge variant="warning">Paused</Badge> : null}
            </span>
          ) : (
            <span className="text-app-muted">Not opened yet</span>
          ),
        header: "Code",
        meta: { label: "Code" }
      },
      ...(["visits", "referrals", "converted"] as const).map(
        (key): ColumnDef<ReferrerStatsItem> => ({
          accessorKey: key,
          cell: ({ row }) => <span className="block text-right tabular-nums">{row.original[key]}</span>,
          header: () => <span className="block text-right">{key === "converted" ? "Onboarded" : key === "visits" ? "Visits" : "Referred"}</span>,
          meta: { label: key === "converted" ? "Onboarded" : key === "visits" ? "Visits" : "Referred" }
        })
      ),
      {
        accessorKey: "balanceMinor",
        cell: ({ row }) => (
          <div className="text-right">
            <p className="font-bold tabular-nums">{money(row.original.balanceMinor, currency)}</p>
            <p className="text-xs tabular-nums text-app-muted">{formatReferralPoints(row.original.pointsBalance)}</p>
            <p className="text-xs text-app-muted">{money(row.original.earnedMinor, currency)} earned</p>
          </div>
        ),
        header: () => <span className="block text-right">Wallet</span>,
        meta: { label: "Wallet" }
      },
      {
        cell: ({ row }) => (
          <RowActions
            actions={[
              { icon: ListFilter, label: "View referrals", onSelect: () => onViewReferrals(row.original) },
              ...(row.original.role === "SALES"
                ? [{ icon: Send, label: "Send sign-in link", onSelect: () => setDialog({ kind: "access", referrer: row.original }) } satisfies RowAction]
                : []),
              {
                icon: row.original.code && !row.original.codeActive ? Play : Pause,
                label: row.original.code && !row.original.codeActive ? "Resume link" : "Pause link",
                onSelect: () =>
                  toggle.mutate({ isActive: Boolean(row.original.code) && !row.original.codeActive, userId: row.original.userId }),
                tone: row.original.code && !row.original.codeActive ? "default" : "warning"
              },
              { icon: PencilLine, label: "Change code", onSelect: () => setDialog({ kind: "code", referrer: row.original }) },
              { icon: Coins, label: "Adjust wallet", onSelect: () => setDialog({ kind: "credits", referrer: row.original }) }
            ]}
          />
        ),
        header: () => <span className="sr-only">Actions</span>,
        id: "actions"
      }
    ],
    [currency, onViewReferrals, toggle]
  );

  const { table } = useDataTable<ReferrerStatsItem, unknown>({
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-app-muted">
          Everyone who has opened their referral board, plus every sales account. Students and coaches get a code the first
          time they open &ldquo;Refer &amp; earn&rdquo;.
        </p>
        <Button className="shrink-0 self-end sm:self-auto" onClick={() => setDialog({ kind: "new-sales" })}>
          <UserPlus aria-hidden="true" className="size-4" strokeWidth={2.5} />
          New sales account
        </Button>
      </div>
      <DataTableToolbar
        filters={
          <Select
            aria-label="Filter by role"
            className="w-40"
            onChange={(event) => serverTable.setStatus(event.target.value)}
            options={[{ label: "All roles", value: "ALL" }, ...REFERRER_ROLES.map((role) => ({ label: REFERRER_ROLE_LABELS[role], value: role }))]}
            value={serverTable.status}
          />
        }
        onSearchChange={serverTable.setSearch}
        searchPlaceholder="Search name, email or code..."
        searchValue={serverTable.search}
      />
      <DataTable columnsLength={columns.length} isLoading={isLoading} noDataText="No referrers yet." stackOnMobile table={table} />
      <DataTablePagination table={table} totalRows={data?.pagination.total ?? 0} />

      {dialog?.kind === "new-sales" ? <NewSalesAccountDialog onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "access" ? <SendAccessLinkDialog onClose={() => setDialog(null)} referrer={dialog.referrer} /> : null}
      {dialog?.kind === "code" ? <ChangeCodeDialog onClose={() => setDialog(null)} referrer={dialog.referrer} /> : null}
      {dialog?.kind === "credits" ? (
        <AdjustCreditsDialog currency={currency} onClose={() => setDialog(null)} referrer={dialog.referrer} />
      ) : null}
    </Card>
  );
}

function ChangeCodeDialog({ onClose, referrer }: { referrer: ReferrerStatsItem; onClose: () => void }) {
  const [code, setCode] = useState(referrer.code ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = useReferralAdminMutation(
    (value: string) => referralAdminApi.updateReferrerCode(referrer.userId, { code: value }),
    { failure: "Could not change the code", success: "Code changed" }
  );

  const submit = async () => {
    const parsed = referralCodeSchema.safeParse(code);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Invalid code.");
    setError(null);
    await save.mutateAsync(parsed.data);
    onClose();
  };

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : onClose())} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change referral code</DialogTitle>
          <DialogDescription>
            {referrer.name}&apos;s old link stops working. Referrals already tracked stay with them.
          </DialogDescription>
        </DialogHeader>
        <FormField hint="4 to 16 letters or digits" id="referrer-code" label="Code" required>
          <Input className="font-mono uppercase" id="referrer-code" onChange={(event) => setCode(event.target.value)} value={code} />
        </FormField>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <DialogFooter>
          <Button onClick={onClose} variant="neutral">
            Cancel
          </Button>
          <Button isLoading={save.isPending} onClick={() => void submit().catch(() => undefined)}>
            Save code
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustCreditsDialog({ currency, onClose, referrer }: { referrer: ReferrerStatsItem; currency: string; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [wallet, setWallet] = useState<ReferralWallet>("CASH");
  const [deduct, setDeduct] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const adjust = useReferralAdminMutation(referralAdminApi.adjustCredits, {
    failure: "Could not adjust credits",
    success: "Credits adjusted"
  });

  const submit = async () => {
    const whole = Number(amount.trim());
    const minor = wallet === "POINTS" ? (Number.isInteger(whole) && whole > 0 ? whole : null) : parseMajorAmount(amount, currency);
    if (minor === null) return setError(wallet === "POINTS" ? "Enter a whole number of points." : "Enter an amount.");
    const parsed = adjustReferralCreditsRequestSchema.safeParse({
      amountMinor: deduct ? -minor : minor,
      note,
      userId: referrer.userId,
      wallet
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the form.");
    setError(null);
    await adjust.mutateAsync(parsed.data);
    onClose();
  };

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : onClose())} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust wallet</DialogTitle>
          <DialogDescription>
            {referrer.name} has {money(referrer.balanceMinor, currency)} and {formatReferralPoints(referrer.pointsBalance)}. The
            change is recorded in their wallet history.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FormField id="adjust-wallet" label="Wallet">
            <Select
              id="adjust-wallet"
              onChange={(event) => setWallet(event.target.value as ReferralWallet)}
              options={[
                { label: "Money", value: "CASH" },
                { label: "Points", value: "POINTS" }
              ]}
              value={wallet}
            />
          </FormField>
          <FormField id="adjust-amount" label={wallet === "POINTS" ? "Points" : `Amount (${currency})`} required>
            <Input id="adjust-amount" inputMode="decimal" onChange={(event) => setAmount(event.target.value)} value={amount} />
          </FormField>
          <label className="flex items-center gap-3 text-sm text-app-text" htmlFor="adjust-deduct">
            <Switch checked={deduct} id="adjust-deduct" onCheckedChange={setDeduct} />
            Deduct instead of add
          </label>
          <FormField id="adjust-note" label="Reason" required>
            <Textarea id="adjust-note" maxLength={500} onChange={(event) => setNote(event.target.value)} rows={2} value={note} />
          </FormField>
          {error ? <Alert variant="error">{error}</Alert> : null}
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="neutral">
            Cancel
          </Button>
          <Button isLoading={adjust.isPending} onClick={() => void submit().catch(() => undefined)}>
            {deduct ? "Deduct" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

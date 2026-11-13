"use client";

import { useState } from "react";
import { Ban, Banknote, History } from "lucide-react";
import {
  formatReferralPoints,
  formatReferralWalletAmount,
  REFERRAL_CREDIT_ENTRY_LABELS,
  REFERRAL_POINTS_EXPIRY_WARNING_DAYS,
  REFERRAL_WALLET_LABELS,
  type MyReferralSummary
} from "@nexa-chess/types";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { RowActions } from "@/components/ui/RowActions";
import { SectionCard } from "@/components/ui/SectionCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { useCancelWithdrawal, useMyReferralCredits, useMyReferralWithdrawals } from "../hooks/useReferrals";
import { money, WITHDRAWAL_STATUS_LABEL, WITHDRAWAL_STATUS_VARIANT } from "../lib/referralFormat";
import { WithdrawDialog } from "./WalletDialogs";

/**
 * The wallet: points for students (spent in the rewards store), money for
 * coaches and sales staff (withdrawn), plus the full history of both.
 */
export function WalletPanel({ summary }: { summary: MyReferralSummary }) {
  const timeZone = useUserTimeZone();
  const { money: cash, points } = summary;
  const [withdrawing, setWithdrawing] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const ledger = useMyReferralCredits();
  const withdrawals = useMyReferralWithdrawals(cash !== null);
  const cancelWithdrawal = useCancelWithdrawal();
  const showPoints = summary.wallet === "POINTS" || points.balance !== 0 || points.earned > 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-2">
        {showPoints ? (
          <section className="rounded-panel border border-app-border bg-app-surface p-5 shadow-card sm:p-6">
            <p className="text-sm text-app-muted">Points</p>
            <p className="mt-1 text-4xl font-extrabold tabular-nums text-app-text">{points.balance.toLocaleString("en-IN")}</p>
            <p className="mt-2 text-sm text-app-muted">
              {formatReferralPoints(points.earned)} earned · {formatReferralPoints(points.redeemed)} spent
              {points.pending > 0 ? ` · ${formatReferralPoints(points.pending)} awaiting approval` : ""}
            </p>
            {points.expiringSoon > 0 ? (
              <p className="mt-2 text-sm font-semibold text-warning-ink">
                {formatReferralPoints(points.expiringSoon)} will expire in the next {REFERRAL_POINTS_EXPIRY_WARNING_DAYS} days if
                you don&apos;t spend them.
              </p>
            ) : null}
            <p className="mt-3 text-xs text-app-muted">
              {summary.canRedeem
                ? "Spend points on discounts and free days in the rewards store. Points are yours alone and can't be sent or cashed out."
                : "Points are yours alone and can't be sent or cashed out."}
              {points.expiryDays ? ` Points expire ${points.expiryDays} days after you earn them.` : ""}
            </p>
          </section>
        ) : null}

        {cash ? (
          <section className="rounded-panel border border-app-border bg-app-surface p-5 shadow-card sm:p-6">
            <p className="text-sm text-app-muted">Money</p>
            <p className="mt-1 text-4xl font-extrabold tabular-nums text-app-text">{money(cash.balanceMinor, summary.currency)}</p>
            <p className="mt-2 text-sm text-app-muted">
              {money(cash.earnedMinor, summary.currency)} earned in total
              {cash.pendingMinor > 0 ? ` · ${money(cash.pendingMinor, summary.currency)} awaiting approval` : ""}
            </p>
            {summary.canWithdraw ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  disabled={cash.balanceMinor < Math.max(1, summary.minWithdrawalMinor)}
                  onClick={() => setWithdrawing(true)}
                  variant="primary"
                >
                  <Banknote aria-hidden="true" className="size-4" strokeWidth={2.5} />
                  Withdraw
                </Button>
              </div>
            ) : null}
            {summary.canWithdraw && cash.balanceMinor < summary.minWithdrawalMinor ? (
              <p className="mt-3 text-xs text-app-muted">
                You can withdraw once your balance reaches {money(summary.minWithdrawalMinor, summary.currency)}.
              </p>
            ) : null}
          </section>
        ) : null}
      </div>

      {cash && (summary.canWithdraw || (withdrawals.data?.length ?? 0) > 0) ? (
        <SectionCard description="Requests to pay your money out." title="Withdrawals">
          {withdrawals.data?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requested</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead pin="end">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withdrawals.data.map((withdrawal) => (
                  <TableRow key={withdrawal.id}>
                    <TableCell>{formatFullDate(withdrawal.createdAt, timeZone)}</TableCell>
                    <TableCell>
                      <Badge variant={WITHDRAWAL_STATUS_VARIANT[withdrawal.status]}>{WITHDRAWAL_STATUS_LABEL[withdrawal.status]}</Badge>
                    </TableCell>
                    <TableCell className="max-w-64 text-sm text-app-muted">
                      {withdrawal.payoutReference ? `Ref ${withdrawal.payoutReference}` : (withdrawal.adminNote ?? "—")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(withdrawal.amountMinor, withdrawal.currency)}</TableCell>
                    <TableCell pin="end">
                      {withdrawal.status === "REQUESTED" ? (
                        <RowActions
                          actions={[
                            { icon: Ban, label: "Cancel withdrawal", onSelect: () => setCancelling(withdrawal.id), tone: "danger" }
                          ]}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState description="Your payout requests will show here." icon={Banknote} title="No withdrawals yet" variant="inline" />
          )}
        </SectionCard>
      ) : null}

      <SectionCard
        description={summary.wallet === "POINTS" ? "Every point you earned, spent or got back." : "Every movement in your wallet."}
        title={summary.wallet === "POINTS" ? "Points history" : "Wallet history"}
      >
        {ledger.data?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Details</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.data.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{formatFullDate(entry.createdAt, timeZone)}</TableCell>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge variant={entry.wallet === "POINTS" ? "accent" : "secondary"}>{REFERRAL_WALLET_LABELS[entry.wallet]}</Badge>
                      {REFERRAL_CREDIT_ENTRY_LABELS[entry.type]}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-72 text-sm text-app-muted">{entry.note ?? "—"}</TableCell>
                  <TableCell
                    className={cn("text-right font-bold tabular-nums", entry.amountMinor >= 0 ? "text-success-ink" : "text-app-text")}
                  >
                    {entry.amountMinor > 0 ? "+" : ""}
                    {formatReferralWalletAmount(entry.amountMinor, entry.wallet, entry.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState description="Credited rewards will appear here." icon={History} title="Nothing here yet" variant="inline" />
        )}
      </SectionCard>

      {cash ? (
        <WithdrawDialog
          balanceMinor={cash.balanceMinor}
          currency={summary.currency}
          minWithdrawalMinor={summary.minWithdrawalMinor}
          onOpenChange={setWithdrawing}
          open={withdrawing}
        />
      ) : null}
      <ConfirmationModal
        confirmLabel="Cancel withdrawal"
        isConfirming={cancelWithdrawal.isPending}
        isOpen={!!cancelling}
        onCancel={() => setCancelling(null)}
        onConfirm={() =>
          void (cancelling ? cancelWithdrawal.mutateAsync(cancelling) : Promise.resolve())
            .then(() => setCancelling(null))
            .catch(() => undefined)
        }
        title="Cancel this withdrawal?"
      >
        The money goes back to your balance.
      </ConfirmationModal>
    </div>
  );
}

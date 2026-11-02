"use client";

import { useState } from "react";
import { Ban, Banknote, CreditCard, Wallet } from "lucide-react";
import { REFERRAL_CREDIT_ENTRY_LABELS, type MyReferralSummary } from "@nexa-chess/types";
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
import {
  useCancelPaymentCode,
  useCancelWithdrawal,
  useMyReferralCredits,
  useMyReferralPaymentCodes,
  useMyReferralWithdrawals
} from "../hooks/useReferrals";
import {
  money,
  PAYMENT_CODE_LABEL,
  PAYMENT_CODE_VARIANT,
  WITHDRAWAL_STATUS_LABEL,
  WITHDRAWAL_STATUS_VARIANT
} from "../lib/referralFormat";
import { PaymentCodeDialog, WithdrawDialog } from "./WalletDialogs";

/** Credits wallet: balance, withdraw, pay fees with a personal code, history. */
export function WalletPanel({ summary }: { summary: MyReferralSummary }) {
  const timeZone = useUserTimeZone();
  const { credits } = summary;
  const [dialog, setDialog] = useState<"code" | "withdraw" | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "code" | "withdrawal"; id: string } | null>(null);

  const ledger = useMyReferralCredits();
  const withdrawals = useMyReferralWithdrawals();
  const codes = useMyReferralPaymentCodes(summary.canPayFees);
  const cancelWithdrawal = useCancelWithdrawal();
  const cancelCode = useCancelPaymentCode();

  const confirmCancel = async () => {
    if (!confirm) return;
    if (confirm.kind === "withdrawal") await cancelWithdrawal.mutateAsync(confirm.id);
    else await cancelCode.mutateAsync(confirm.id);
    setConfirm(null);
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <section className="rounded-panel border border-app-border bg-app-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-app-muted">Credit balance</p>
            <p className="mt-1 text-4xl font-extrabold tabular-nums text-app-text">{money(credits.balanceMinor, credits.currency)}</p>
            <p className="mt-2 text-sm text-app-muted">
              {money(credits.earnedMinor, credits.currency)} earned in total
              {credits.pendingRewardsMinor > 0
                ? ` · ${money(credits.pendingRewardsMinor, credits.currency)} awaiting approval`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {summary.canPayFees ? (
              <Button disabled={credits.balanceMinor <= 0} onClick={() => setDialog("code")} variant="secondary">
                <CreditCard aria-hidden="true" className="size-4" strokeWidth={2.5} />
                Pay fees with credits
              </Button>
            ) : null}
            {summary.canWithdraw ? (
              <Button
                disabled={credits.balanceMinor < Math.max(1, summary.minWithdrawalMinor)}
                onClick={() => setDialog("withdraw")}
                variant="primary"
              >
                <Banknote aria-hidden="true" className="size-4" strokeWidth={2.5} />
                Withdraw
              </Button>
            ) : null}
          </div>
        </div>
        {summary.canWithdraw && credits.balanceMinor < summary.minWithdrawalMinor ? (
          <p className="mt-3 text-xs text-app-muted">
            You can withdraw once your balance reaches {money(summary.minWithdrawalMinor, credits.currency)}.
          </p>
        ) : null}
      </section>

      {summary.canPayFees ? (
        <SectionCard description="One-time codes made from your credits." title="Payment codes">
          {codes.data?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead pin="end">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.data.map((code) => (
                  <TableRow key={code.id}>
                    <TableCell className="font-mono font-bold">{code.code}</TableCell>
                    <TableCell>
                      <Badge variant={PAYMENT_CODE_VARIANT[code.status]}>{PAYMENT_CODE_LABEL[code.status]}</Badge>
                    </TableCell>
                    <TableCell>{formatFullDate(code.createdAt, timeZone)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(code.amountMinor, code.currency)}</TableCell>
                    <TableCell pin="end">
                      {code.status === "ACTIVE" ? (
                        <RowActions
                          actions={[
                            {
                              icon: Ban,
                              label: "Cancel code",
                              onSelect: () => setConfirm({ id: code.id, kind: "code" }),
                              tone: "danger"
                            }
                          ]}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState description="Create one to pay a fee with your credits." icon={CreditCard} title="No codes yet" variant="inline" />
          )}
        </SectionCard>
      ) : null}

      {summary.canWithdraw || (withdrawals.data?.length ?? 0) > 0 ? (
        <SectionCard description="Requests to pay your credits out." title="Withdrawals">
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
                            {
                              icon: Ban,
                              label: "Cancel withdrawal",
                              onSelect: () => setConfirm({ id: withdrawal.id, kind: "withdrawal" }),
                              tone: "danger"
                            }
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

      <SectionCard description="Every credit in and out of your wallet." title="Credit history">
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
                  <TableCell>{REFERRAL_CREDIT_ENTRY_LABELS[entry.type]}</TableCell>
                  <TableCell className="max-w-72 text-sm text-app-muted">{entry.note ?? "—"}</TableCell>
                  <TableCell
                    className={cn("text-right font-bold tabular-nums", entry.amountMinor >= 0 ? "text-success-ink" : "text-app-text")}
                  >
                    {entry.amountMinor > 0 ? "+" : ""}
                    {money(entry.amountMinor, entry.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState description="Credited rewards will appear here." icon={Wallet} title="No credits yet" variant="inline" />
        )}
      </SectionCard>


      <WithdrawDialog
        balanceMinor={credits.balanceMinor}
        currency={credits.currency}
        minWithdrawalMinor={summary.minWithdrawalMinor}
        onOpenChange={(open) => setDialog(open ? "withdraw" : null)}
        open={dialog === "withdraw"}
      />
      <PaymentCodeDialog
        balanceMinor={credits.balanceMinor}
        currency={credits.currency}
        onOpenChange={(open) => setDialog(open ? "code" : null)}
        open={dialog === "code"}
      />
      <ConfirmationModal
        confirmLabel={confirm?.kind === "code" ? "Cancel code" : "Cancel withdrawal"}
        isConfirming={cancelWithdrawal.isPending || cancelCode.isPending}
        isOpen={!!confirm}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void confirmCancel().catch(() => undefined)}
        title={confirm?.kind === "code" ? "Cancel this payment code?" : "Cancel this withdrawal?"}
      >
        The credits go back to your balance.
      </ConfirmationModal>
    </div>
  );
}

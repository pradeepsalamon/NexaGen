"use client";

import { useState } from "react";
import { Ban, CalendarPlus, Copy, Gift, Percent, Ticket } from "lucide-react";
import {
  formatReferralPoints,
  formatReferralVoucherValue,
  type MyReferralVoucherCatalogue,
  type MyReferralVoucherItem,
  type ReferralRedemptionItem
} from "@nexa-chess/types";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { RowActions } from "@/components/ui/RowActions";
import { SectionCard } from "@/components/ui/SectionCard";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { useToast } from "@/providers/ToastProvider";
import { useCancelRedemption, useMyReferralRedemptions, useMyReferralVouchers, useRedeemVoucher } from "../hooks/useReferrals";
import { DISCOUNT_STATUS_LABEL, REDEMPTION_STATUS_LABEL, REDEMPTION_STATUS_VARIANT } from "../lib/referralFormat";

const TYPE_ICON = { FIXED_DISCOUNT: Ticket, FREE_DAYS: CalendarPlus, PERCENT_DISCOUNT: Percent } as const;

/** Students spend points on the academy's vouchers, and see what they redeemed. */
export function RewardsStore() {
  const { data, error, isLoading, refetch } = useMyReferralVouchers();
  const [redeeming, setRedeeming] = useState<MyReferralVoucherItem | null>(null);

  if (isLoading) return <Skeleton className="h-64 rounded-app" />;
  if (error || !data) return <WidgetError message="Couldn't load the rewards store." onRetry={() => void refetch()} />;
  if (!data.canRedeem) {
    return <EmptyState description="The academy hasn't opened the rewards store yet." icon={Gift} title="Rewards store is closed" />;
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <SectionCard
        description={`You have ${formatReferralPoints(data.pointsBalance)} to spend.`}
        title="Rewards store"
      >
        {data.vouchers.length ? (
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.vouchers.map((voucher) => (
              <VoucherCard balance={data.pointsBalance} currency={data.currency} key={voucher.id} onRedeem={() => setRedeeming(voucher)} voucher={voucher} />
            ))}
          </ul>
        ) : (
          <EmptyState description="Check back soon — the academy adds rewards here." icon={Gift} title="No rewards yet" variant="inline" />
        )}
      </SectionCard>

      <MyRedemptions />

      {redeeming ? <RedeemDialog catalogue={data} onClose={() => setRedeeming(null)} voucher={redeeming} /> : null}
    </div>
  );
}

function VoucherCard({
  balance,
  currency,
  onRedeem,
  voucher
}: {
  voucher: MyReferralVoucherItem;
  balance: number;
  currency: string;
  onRedeem: () => void;
}) {
  const timeZone = useUserTimeZone();
  const Icon = TYPE_ICON[voucher.type];
  const short = balance < voucher.pointsCost;
  return (
    <li className="flex flex-col gap-3 rounded-panel border border-app-border bg-app-surface p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
          <Icon aria-hidden="true" className="size-5" strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <p className="font-bold text-app-text">{voucher.name}</p>
          <p className="text-sm text-app-muted">{formatReferralVoucherValue(voucher, currency)}</p>
        </div>
      </div>
      {voucher.description ? <p className="text-sm text-app-text">{voucher.description}</p> : null}
      <div className="flex flex-wrap gap-2">
        {voucher.requiresApproval ? <Badge variant="warning">Academy approves</Badge> : null}
        {voucher.remaining !== null ? <Badge variant="info">{voucher.remaining} left</Badge> : null}
        {voucher.planNames.length ? <Badge variant="secondary">{voucher.planNames.join(", ")}</Badge> : null}
        {voucher.codeValidDays ? <Badge variant="secondary">Code valid {voucher.codeValidDays} days</Badge> : null}
        {voucher.endsAt ? <Badge variant="secondary">Until {formatFullDate(voucher.endsAt, timeZone)}</Badge> : null}
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-app-border pt-3">
        <span className="font-extrabold tabular-nums text-app-text">{formatReferralPoints(voucher.pointsCost)}</span>
        <Button disabled={short || voucher.unavailableReason !== null} onClick={onRedeem} size="sm">
          {voucher.unavailableReason ?? (short ? `Need ${formatReferralPoints(voucher.pointsCost - balance)} more` : "Redeem")}
        </Button>
      </div>
    </li>
  );
}

function RedeemDialog({
  catalogue,
  onClose,
  voucher
}: {
  catalogue: MyReferralVoucherCatalogue;
  voucher: MyReferralVoucherItem;
  onClose: () => void;
}) {
  const timeZone = useUserTimeZone();
  const toast = useToast();
  const redeem = useRedeemVoucher();
  const [result, setResult] = useState<ReferralRedemptionItem | null>(null);
  // Free days: the plans this voucher can extend that the student holds.
  const plans =
    voucher.type === "FREE_DAYS"
      ? catalogue.plans.filter((plan) => voucher.planIds.length === 0 || voucher.planIds.includes(plan.planId))
      : [];
  const [planId, setPlanId] = useState(plans[0]?.planId ?? "");

  const submit = async () => {
    const redemption = await redeem.mutateAsync({ body: plans.length > 1 ? { planId } : {}, id: voucher.id });
    setResult(redemption);
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success({ title: "Code copied" });
    } catch {
      toast.error({ title: "Could not copy the code" });
    }
  };

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : onClose())} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{result ? "Redeemed" : `Redeem ${voucher.name}?`}</DialogTitle>
          <DialogDescription>
            {result
              ? result.status === "PENDING"
                ? "The academy will review your request. Your points are held until then, and come back if it's declined."
                : "Your reward is ready."
              : `${formatVoucherLine(voucher, catalogue.currency)} for ${formatReferralPoints(voucher.pointsCost)}.`}
          </DialogDescription>
        </DialogHeader>
        {result ? (
          result.discountCode ? (
            <div className="grid gap-2 rounded-control border border-app-border bg-app-soft p-4 text-center">
              <p className="text-sm text-app-muted">Your one-time code — enter it at checkout</p>
              <p className="font-mono text-2xl font-extrabold tracking-wider text-app-text">{result.discountCode}</p>
              <Button className="justify-self-center" onClick={() => void copy(result.discountCode!)} size="sm" variant="secondary">
                <Copy aria-hidden="true" className="size-4" strokeWidth={2.5} />
                Copy code
              </Button>
            </div>
          ) : result.accessEndsAt ? (
            <Alert variant="success">
              {result.planName ?? "Your plan"} now runs until {formatFullDate(result.accessEndsAt, timeZone)}.
            </Alert>
          ) : null
        ) : (
          <div className="grid gap-4">
            {plans.length > 1 ? (
              <FormField id="redeem-plan" label="Add the free days to">
                <Select
                  id="redeem-plan"
                  onChange={(event) => setPlanId(event.target.value)}
                  options={plans.map((plan) => ({
                    label: `${plan.planName} (until ${formatFullDate(plan.endsAt, timeZone)})`,
                    value: plan.planId
                  }))}
                  value={planId}
                />
              </FormField>
            ) : plans.length === 1 ? (
              <p className="text-sm text-app-text">
                Adds to {plans[0]!.planName}, which runs until {formatFullDate(plans[0]!.endsAt, timeZone)}.
              </p>
            ) : null}
            <p className="text-sm text-app-muted">
              You&rsquo;ll have {formatReferralPoints(catalogue.pointsBalance - voucher.pointsCost)} left.
              {voucher.requiresApproval ? " The academy approves this reward before you get it." : ""}
            </p>
          </div>
        )}
        <DialogFooter>
          {result ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button onClick={onClose} variant="neutral">
                Cancel
              </Button>
              <Button isLoading={redeem.isPending} onClick={() => void submit().catch(() => undefined)}>
                Redeem for {formatReferralPoints(voucher.pointsCost)}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatVoucherLine(voucher: MyReferralVoucherItem, currency: string): string {
  const value = formatReferralVoucherValue(voucher, currency);
  return voucher.planNames.length ? `${value} (${voucher.planNames.join(", ")})` : value;
}

function MyRedemptions() {
  const timeZone = useUserTimeZone();
  const { data, isLoading } = useMyReferralRedemptions();
  const cancel = useCancelRedemption();
  const [cancelling, setCancelling] = useState<string | null>(null);

  return (
    <SectionCard description="Codes to use at checkout, free days added, and requests waiting for the academy." title="My rewards">
      {isLoading ? (
        <Skeleton className="h-32 rounded-app" />
      ) : data?.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reward</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Points</TableHead>
              <TableHead pin="end">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <p className="font-bold text-app-text">{item.voucherName}</p>
                  <p className="text-xs text-app-muted">{formatReferralVoucherValue(item, item.currency)}</p>
                </TableCell>
                <TableCell>
                  <Badge variant={REDEMPTION_STATUS_VARIANT[item.status]}>{REDEMPTION_STATUS_LABEL[item.status]}</Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {item.discountCode ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-app-text">{item.discountCode}</span>
                      {item.discountStatus ? (
                        <Badge variant={item.discountStatus === "ACTIVE" ? "info" : "secondary"}>{DISCOUNT_STATUS_LABEL[item.discountStatus]}</Badge>
                      ) : null}
                      {item.codeEndsAt && item.discountStatus === "ACTIVE" ? (
                        <span className="text-xs text-app-muted">until {formatFullDate(item.codeEndsAt, timeZone)}</span>
                      ) : null}
                    </span>
                  ) : item.accessEndsAt ? (
                    <span className="text-app-muted">
                      {item.planName ?? "Access"} until {formatFullDate(item.accessEndsAt, timeZone)}
                    </span>
                  ) : (
                    <span className="text-app-muted">{item.adminNote ?? "—"}</span>
                  )}
                </TableCell>
                <TableCell>{formatFullDate(item.createdAt, timeZone)}</TableCell>
                <TableCell className="text-right tabular-nums">{item.pointsCost.toLocaleString("en-IN")}</TableCell>
                <TableCell pin="end">
                  {item.status === "PENDING" ? (
                    <RowActions actions={[{ icon: Ban, label: "Cancel request", onSelect: () => setCancelling(item.id), tone: "danger" }]} />
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState description="Rewards you redeem will appear here." icon={Ticket} title="Nothing redeemed yet" variant="inline" />
      )}
      <ConfirmationModal
        confirmLabel="Cancel request"
        isConfirming={cancel.isPending}
        isOpen={!!cancelling}
        onCancel={() => setCancelling(null)}
        onConfirm={() =>
          void (cancelling ? cancel.mutateAsync(cancelling) : Promise.resolve()).then(() => setCancelling(null)).catch(() => undefined)
        }
        title="Cancel this request?"
      >
        Your points come straight back.
      </ConfirmationModal>
    </SectionCard>
  );
}

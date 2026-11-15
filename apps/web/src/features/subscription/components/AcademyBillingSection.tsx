"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  DEFAULT_TENANT_ID,
  formatMoney,
  platformPriceFor,
  type AdminSubscriptionResponse,
  type PlatformBillingPeriod,
  type PlatformCheckoutView,
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { openGateway } from "@/features/payments/lib/gatewayHandoff";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/ToastProvider";
import { useAuthStore } from "@/stores/authStore";
import { useAcademyBilling, useConfirmPlatformCheckout, useStartPlatformCheckout } from "../hooks/useSubscription";

const PERIOD_OPTIONS = [
  { label: "Monthly", value: "MONTHLY" },
  { label: "Yearly", value: "YEARLY" },
];

/** A pay link from the email (`?checkout=<id>`): read once on mount, no Suspense boundary needed. */
function useLinkedCheckoutId() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("checkout"));
  }, []);
  return id;
}

/**
 * Paying the academy's plan (docs/SAAS_MULTI_TENANCY.md §G "Two money flows"
 * 1). The gateway's "success" only asks the API to read the order; the plan
 * renews when the API has seen the payment, never on the browser's word.
 */
export function AcademyBillingSection({ data }: { data: AdminSubscriptionResponse }) {
  const role = useAuthStore((state) => state.user?.role);
  // Nexa's own academy doesn't pay itself.
  const isSuperAdmin = role === "SUPER_ADMIN" && data.tenant.id !== DEFAULT_TENANT_ID;
  const billing = useAcademyBilling();
  const start = useStartPlatformCheckout();
  const confirm = useConfirmPlatformCheckout();
  const toast = useToast();
  const timeZone = useUserTimeZone();
  const linkedId = useLinkedCheckoutId();
  const [period, setPeriod] = useState<PlatformBillingPeriod>("MONTHLY");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Prices of the public plans; a hidden or custom plan has none here (the owner sends a pay link).
  const plan = data.plans.find((candidate) => candidate.code === data.plan?.code) ?? null;
  const subtotal = plan ? platformPriceFor(plan, period) : null;

  async function pay(checkout: PlatformCheckoutView) {
    if (!checkout.gateway) {
      toast.error({ message: "Online payment isn't available for this one. Contact the NexaChess team.", title: "Can't pay online" });
      return;
    }
    setBusyId(checkout.id);
    try {
      let outcome: Awaited<ReturnType<typeof openGateway>>;
      try {
        outcome = await openGateway(
          { kind: "SDK", provider: "RAZORPAY", providerOrderId: checkout.gateway.orderId, publicKey: checkout.gateway.keyId },
          {
            amount: checkout.amountMinor,
            currency: checkout.currency,
            description: `${checkout.planName} plan`,
            merchantName: checkout.gateway.merchantName,
          }
        );
      } catch (gatewayError) {
        // e.g. the Razorpay script was blocked and never loaded.
        toast.error({ message: (gatewayError as Error).message, title: "Payment didn't start" });
        return;
      }
      if (outcome.kind === "failed") {
        toast.error({ message: outcome.message, title: "Payment didn't start" });
        return;
      }
      if (outcome.kind === "redirected") return;
      const result = await confirm.mutateAsync({
        body:
          outcome.kind === "completed"
            ? {
                razorpayOrderId: outcome.providerOrderId,
                razorpayPaymentId: outcome.providerPaymentId,
                razorpaySignature: outcome.signature,
              }
            : {},
        id: checkout.id,
      });
      if (result.status === "PAID") {
        toast.success({ message: "An invoice is in the list below.", title: "Payment received" });
      } else if (outcome.kind === "completed") {
        toast.info({
          message: "Razorpay hasn't confirmed it yet. This page updates once it does; you won't be charged twice.",
          title: "Payment is being confirmed",
        });
      }
    } catch {
      // A failed confirm is reported by apiFetch's error toast.
    } finally {
      setBusyId(null);
    }
  }

  async function startAndPay() {
    try {
      const checkout = await start.mutateAsync({ period });
      await pay(checkout);
    } catch {
      // apiFetch reports a failed start.
    }
  }

  const open = billing.data?.openCheckouts ?? [];
  const invoices = billing.data?.invoices ?? [];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-app-text">Billing</h2>
        <p className="text-sm text-app-muted">Pay for your plan online and download GST invoices. Prices exclude GST.</p>
      </div>

      {isSuperAdmin && billing.data ? (
        <div className="rounded-app border border-app-border bg-app-surface p-5 shadow-card">
          {!billing.data.gatewayReady ? (
            <p className="text-sm text-app-muted">Online payment isn&apos;t set up yet. Contact the NexaChess team to pay.</p>
          ) : subtotal == null || subtotal <= 0 ? (
            <p className="text-sm text-app-muted">Your plan has a custom price. Contact the NexaChess team for a pay link.</p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-40">
                <label className="mb-1 block text-xs font-semibold text-app-muted" htmlFor="billing-period">
                  Billing period
                </label>
                <Select
                  id="billing-period"
                  onChange={(event) => setPeriod(event.target.value as PlatformBillingPeriod)}
                  options={PERIOD_OPTIONS}
                  value={period}
                />
              </div>
              <p className="pb-2 text-sm text-app-text">
                <span className="font-semibold">{formatMoney(subtotal, plan?.currency ?? "INR")}</span> + GST for {plan?.name}
              </p>
              <Button className="ml-auto" isLoading={start.isPending || Boolean(busyId)} onClick={() => void startAndPay()}>
                Pay now
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {open.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-app-text">Waiting for payment</h3>
          <ul className="divide-y divide-app-border rounded-app border border-app-border bg-app-surface">
            {open.map((checkout) => (
              <li
                className={cn("flex flex-wrap items-center gap-3 px-4 py-3", checkout.id === linkedId && "bg-primary/[0.06]")}
                key={checkout.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-app-text">
                    {checkout.planName} · {checkout.period === "MONTHLY" ? "1 month" : "1 year"} ·{" "}
                    {formatMoney(checkout.amountMinor, checkout.currency)}
                  </p>
                  <p className="text-xs text-app-muted">
                    {checkout.note ? `${checkout.note} · ` : ""}
                    Includes {formatMoney(checkout.taxMinor, checkout.currency)} GST · open until{" "}
                    {formatFullDate(checkout.expiresAt, timeZone)}
                  </p>
                </div>
                {checkout.createdByPlatform ? <Badge variant="outline">From NexaChess</Badge> : null}
                {isSuperAdmin ? (
                  <Button
                    disabled={!checkout.gateway}
                    isLoading={busyId === checkout.id}
                    onClick={() => void pay(checkout)}
                    size="sm"
                    variant="outline"
                  >
                    Pay
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-app border border-app-border bg-app-surface shadow-card">
        {/* The table scrolls inside its own ScrollShadow (keyboard-reachable while it overflows). */}
        <Table className="min-w-[520px]">
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Open</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length === 0 ? (
              <TableRow>
                <TableCell className="text-center text-app-muted" colSpan={4}>
                  No invoices yet.
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{invoice.number}</TableCell>
                  <TableCell>{formatFullDate(invoice.issuedAt, timeZone)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(invoice.totalMinor, invoice.currency)}</TableCell>
                  <TableCell className="text-right">
                    <Link className="text-sm font-semibold text-primary-ink hover:underline" href={`/admin/subscription/invoices/${invoice.id}`}>
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

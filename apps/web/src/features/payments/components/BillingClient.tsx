"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Eye, FileText } from "lucide-react";
import {
  BILLING_INTERVAL_LABELS,
  formatMoney,
  PAYMENT_METHOD_LABELS,
  PAYMENT_SOURCE_LABELS,
  PAYMENT_STATUS_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  type PaymentStatus,
  type SubscriptionItem
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime, formatFullDate } from "@/lib/datetime";
import {
  creditNotePdfUrl,
  invoicePdfUrl
} from "@/features/invoices/api/invoicesApi";
import { BillingProfileForm } from "@/features/invoices/components/BillingProfileForm";
import { InvoiceStatusBadge } from "@/features/invoices/components/InvoiceBadges";
import { useCancelSubscription, useMyBilling } from "../hooks/usePaymentsApi";

const STATUS_VARIANT: Record<
  PaymentStatus,
  "success" | "destructive" | "warning" | "secondary" | "outline"
> = {
  CREATED: "outline",
  PENDING: "warning",
  PROCESSING: "warning",
  AUTHORIZED: "warning",
  PAID: "success",
  FAILED: "destructive",
  CANCELLED: "secondary",
  EXPIRED: "secondary",
  REFUND_PENDING: "warning",
  PARTIALLY_REFUNDED: "secondary",
  REFUNDED: "secondary"
};

/** A student's own payments, receipts, subscriptions and access. */
export function BillingClient() {
  const timeZone = useUserTimeZone();
  const { data, isLoading } = useMyBilling();

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  if (!data) {
    return (
      <EmptyState
        description="We could not load your billing history."
        title="Nothing to show"
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        description="Your payments, invoices and active access."
        title="Billing"
      />

      <Tabs defaultValue="payments">
        <TabsList className="justify-self-end">
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          {data.creditNotes.length > 0 ? (
            <TabsTrigger value="credit-notes">Credit notes</TabsTrigger>
          ) : null}
          <TabsTrigger value="access">Access</TabsTrigger>
          {data.subscriptions.length > 0 ? (
            <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          ) : null}
          <TabsTrigger value="billing-details">Billing details</TabsTrigger>
        </TabsList>

        <TabsContent value="payments">
          {data.payments.length === 0 ? (
            <EmptyState
              description="Payments you make will appear here with their receipts."
              title="No payments yet"
            />
          ) : (
            <Card className="divide-y divide-app-border p-0">
              {data.payments.map((payment) => (
                <div
                  className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
                  key={payment.id}
                >
                  <Badge variant={STATUS_VARIANT[payment.status]}>
                    {PAYMENT_STATUS_LABELS[payment.status]}
                  </Badge>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-app-text">
                      {payment.planName ?? "NexaChess purchase"}
                    </p>
                    <p className="text-xs text-app-muted">
                      {payment.orderNumber}
                      {payment.method
                        ? ` · ${PAYMENT_METHOD_LABELS[payment.method]}`
                        : ""}
                      {" · "}
                      {formatDateTime(payment.createdAt, timeZone)}
                    </p>
                  </div>

                  <p className="text-sm font-bold text-app-text">
                    {formatMoney(payment.amount, payment.currency)}
                  </p>

                  {payment.invoiceId ? (
                    <SimpleTooltip label="Open the receipt">
                      <Button
                        aria-label={`Open invoice ${payment.invoiceNumber ?? ""}`}
                        asChild
                        className="size-8 rounded-full border border-primary bg-primary p-0 text-on-primary shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-on-primary"
                        size="icon"
                        variant="ghost"
                      >
                        <a
                          href={invoicePdfUrl(payment.invoiceId)}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          <FileText className="size-4" strokeWidth={2.5} />
                        </a>
                      </Button>
                    </SimpleTooltip>
                  ) : null}
                </div>
              ))}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="invoices">
          {data.invoices.length === 0 ? (
            <EmptyState
              description="An invoice is issued the moment a payment is confirmed."
              title="No invoices yet"
            />
          ) : (
            <Card className="divide-y divide-app-border p-0">
              {data.invoices.map((invoice) => (
                <div
                  className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
                  key={invoice.id}
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      className="font-mono text-sm font-semibold text-primary-ink hover:underline"
                      href={`/student/billing/invoices/${invoice.id}`}
                    >
                      {invoice.number}
                    </Link>
                    <p className="text-xs text-app-muted">
                      {/* The invoice's legal date, rendered in the viewer's
                          zone from the stored UTC instant like every other
                          date in the app. */}
                      {formatFullDate(invoice.invoiceDate, timeZone)}
                      {invoice.lines[0]
                        ? ` · ${invoice.lines[0].description}`
                        : ""}
                    </p>
                  </div>

                  <InvoiceStatusBadge status={invoice.status} />

                  <p className="text-sm font-bold text-app-text">
                    {formatMoney(invoice.total, invoice.currency)}
                  </p>

                  <SimpleTooltip label="View this invoice">
                    <Button
                      aria-label={`View invoice ${invoice.number}`}
                      asChild
                      className="size-8 rounded-full border border-primary bg-primary p-0 text-on-primary shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-on-primary"
                      size="icon"
                      variant="ghost"
                    >
                      <Link href={`/student/billing/invoices/${invoice.id}`}>
                        <Eye className="size-4" strokeWidth={2.5} />
                      </Link>
                    </Button>
                  </SimpleTooltip>

                  <SimpleTooltip label="Download this invoice as a PDF">
                    <Button
                      aria-label={`Download invoice ${invoice.number}`}
                      asChild
                      className="size-8 rounded-full border border-primary bg-primary p-0 text-on-primary shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-on-primary"
                      size="icon"
                      variant="ghost"
                    >
                      <a
                        href={invoicePdfUrl(invoice.id)}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <Download className="size-4" strokeWidth={2.5} />
                      </a>
                    </Button>
                  </SimpleTooltip>
                </div>
              ))}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="credit-notes">
          {data.creditNotes.length === 0 ? (
            <EmptyState
              description="A credit note is issued if any of your payments is refunded."
              title="No credit notes"
            />
          ) : (
            <Card className="divide-y divide-app-border p-0">
              {data.creditNotes.map((creditNote) => (
                <div
                  className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
                  key={creditNote.id}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-semibold text-app-text">
                      {creditNote.number}
                    </p>
                    <p className="text-xs text-app-muted">
                      {formatFullDate(creditNote.issuedAt, timeZone)} · against{" "}
                      {creditNote.invoiceNumber}
                    </p>
                  </div>

                  <p className="text-sm font-bold text-app-text">
                    {formatMoney(creditNote.total, creditNote.currency)}
                  </p>

                  <SimpleTooltip label="Download this credit note">
                    <Button
                      aria-label={`Download credit note ${creditNote.number}`}
                      asChild
                      className="size-8 rounded-full border border-primary bg-primary p-0 text-on-primary shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-on-primary"
                      size="icon"
                      variant="ghost"
                    >
                      <a
                        href={creditNotePdfUrl(creditNote.id)}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <Download className="size-4" strokeWidth={2.5} />
                      </a>
                    </Button>
                  </SimpleTooltip>
                </div>
              ))}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="billing-details">
          <BillingProfileForm />
        </TabsContent>

        <TabsContent value="access">
          {data.entitlements.length === 0 ? (
            <EmptyState
              description="Plans you buy will show the access they grant here."
              title="No active access"
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {data.entitlements.map((entitlement) => (
                <SectionCard key={entitlement.id} title={entitlement.planName}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        entitlement.status === "ACTIVE" ? "success" : "secondary"
                      }
                    >
                      {entitlement.status}
                    </Badge>
                    {entitlement.batchName ? (
                      <span className="text-sm text-app-muted">
                        {entitlement.batchName}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-app-muted">
                    {entitlement.endsAt
                      ? `Until ${formatFullDate(entitlement.endsAt, timeZone)}`
                      : "Lifetime access"}
                  </p>
                </SectionCard>
              ))}
            </div>
          )}
        </TabsContent>

        {data.subscriptions.length > 0 ? (
          <TabsContent value="subscriptions">
            <div className="space-y-3">
              {data.subscriptions.map((subscription) => (
                <SubscriptionRow
                  key={subscription.id}
                  subscription={subscription}
                  timeZone={timeZone}
                />
              ))}
            </div>
          </TabsContent>
        ) : null}
      </Tabs>

      <p className="text-sm text-app-muted">
        Looking for something to buy?{" "}
        <Link className="font-semibold text-primary-ink underline" href="/plans">
          See the available plans
        </Link>
        .
      </p>
    </div>
  );
}

function SubscriptionRow({
  subscription,
  timeZone
}: {
  subscription: SubscriptionItem;
  timeZone: string;
}) {
  const cancel = useCancelSubscription();
  const [confirming, setConfirming] = useState(false);

  const active =
    subscription.status === "ACTIVE" || subscription.status === "PAST_DUE";

  return (
    <SectionCard title={subscription.planName}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={active ? "success" : "secondary"}>
          {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
        </Badge>
        <span className="text-sm text-app-muted">
          {formatMoney(subscription.amount, subscription.currency)} ·{" "}
          {BILLING_INTERVAL_LABELS[subscription.interval]} ·{" "}
          {PAYMENT_SOURCE_LABELS[subscription.provider]}
        </span>
      </div>

      {subscription.nextBillingDate && active ? (
        <p className="mt-2 text-sm text-app-muted">
          {subscription.cancelAtPeriodEnd
            ? `Ends ${formatDateTime(subscription.nextBillingDate, timeZone)}`
            : `Renews ${formatDateTime(subscription.nextBillingDate, timeZone)}`}
        </p>
      ) : null}

      {subscription.failedRenewals > 0 ? (
        <p className="mt-2 text-sm text-app-danger-ink">
          {subscription.failedRenewals} renewal attempt(s) have failed. Update
          your payment method to keep your access.
        </p>
      ) : null}

      {active && !subscription.cancelAtPeriodEnd ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {confirming ? (
            <>
              <Button
                isLoading={cancel.isPending}
                onClick={() =>
                  cancel.mutate({
                    id: subscription.id,
                    data: { atPeriodEnd: true }
                  })
                }
                size="sm"
                type="button"
                variant="destructive"
              >
                Yes, cancel at period end
              </Button>
              <Button
                onClick={() => setConfirming(false)}
                size="sm"
                type="button"
                variant="ghost"
              >
                Keep it
              </Button>
            </>
          ) : (
            <Button
              onClick={() => setConfirming(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              Cancel subscription
            </Button>
          )}
        </div>
      ) : null}
    </SectionCard>
  );
}

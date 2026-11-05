"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney, PLAN_LIMIT_KEYS, PLAN_LIMITS, toMinorUnits, type PlatformBillingPeriod } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { SectionCard } from "@/components/ui/SectionCard";
import { Select } from "@/components/ui/Select";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime, formatFullDate } from "@/lib/datetime";
import { useCreatePlatformPayLink, usePlatformInvoices, usePlatformUsage } from "../hooks/usePlatformApi";

const PERIOD_OPTIONS = [
  { label: "Monthly", value: "MONTHLY" },
  { label: "Yearly", value: "YEARLY" },
];

/** The academy's address for a pay link: its primary domain, shown absolute for copying. */
function usePayUrl(primaryHost: string | null, payPath: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!payPath) return setUrl(null);
    setUrl(primaryHost ? `https://${primaryHost}${payPath}` : new URL(payPath, window.location.origin).toString());
  }, [payPath, primaryHost]);
  return url;
}

/**
 * Console: what the academy paid NexaChess, a pay link to send it, and its
 * last usage snapshot (docs/SAAS_MULTI_TENANCY.md §G; Phase 6).
 */
export function AcademyBillingCard({ primaryHost, tenantId }: { tenantId: string; primaryHost: string | null }) {
  const timeZone = useUserTimeZone();
  const invoices = usePlatformInvoices(tenantId);
  const usage = usePlatformUsage();
  const payLink = useCreatePlatformPayLink(tenantId);
  const [period, setPeriod] = useState<PlatformBillingPeriod>("MONTHLY");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [payPath, setPayPath] = useState<string | null>(null);
  const payUrl = usePayUrl(primaryHost, payPath);
  const snapshot = usage.data?.usage.find((row) => row.tenantId === tenantId);
  const priceOk = price.trim() === "" || Number(price) > 0;

  return (
    <SectionCard description="Plan payments, GST invoices and a pay link to send the academy. Prices exclude GST." title="Billing">
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          payLink
            .mutateAsync({
              note: note.trim() || undefined,
              period,
              subtotalMinor: price.trim() ? toMinorUnits(Number(price), "INR") : undefined,
            })
            .then((result) => setPayPath(result.payPath), () => undefined);
        }}
      >
        <div className="grid items-start gap-3 sm:grid-cols-3">
          <FormField id="pay-link-period" label="Period">
            <Select
              id="pay-link-period"
              onChange={(event) => setPeriod(event.target.value as PlatformBillingPeriod)}
              options={PERIOD_OPTIONS}
              value={period}
            />
          </FormField>
          <FormField hint="Blank = the plan's or the deal's price." id="pay-link-price" label="Price before GST (₹)">
            <Input id="pay-link-price" inputMode="decimal" onChange={(event) => setPrice(event.target.value)} value={price} />
          </FormField>
          <FormField id="pay-link-note" label="Note for the academy">
            <Input id="pay-link-note" maxLength={500} onChange={(event) => setNote(event.target.value)} value={note} />
          </FormField>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!priceOk} isLoading={payLink.isPending} type="submit" variant="outline">
            Create pay link
          </Button>
          {payUrl ? (
            <p className="min-w-0 break-all text-xs text-app-muted">
              Send this to the academy&apos;s super admin: <span className="font-mono text-app-text">{payUrl}</span>
            </p>
          ) : null}
        </div>
      </form>

      <div className="mt-4 grid gap-2">
        <h3 className="text-sm font-semibold text-app-text">Invoices</h3>
        {invoices.data?.invoices.length ? (
          <ul className="divide-y divide-app-border rounded-app border border-app-border">
            {invoices.data.invoices.map((invoice) => (
              <li className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm" key={invoice.id}>
                <Link className="font-semibold text-primary-ink hover:underline" href={`/admin/platform/invoices/${invoice.id}`}>
                  {invoice.number}
                </Link>
                <span className="text-app-muted">{formatFullDate(invoice.issuedAt, timeZone)}</span>
                <span className="ml-auto tabular-nums">{formatMoney(invoice.totalMinor, invoice.currency)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-app-muted">No invoices yet.</p>
        )}
      </div>

      {snapshot ? (
        <div className="mt-4 grid gap-1">
          <h3 className="text-sm font-semibold text-app-text">Usage</h3>
          <p className="text-sm text-app-muted">
            {PLAN_LIMIT_KEYS.map((key) => `${PLAN_LIMITS[key].label}: ${snapshot.counts[key] ?? 0}`).join(" · ")}
          </p>
          <p className="text-xs text-app-muted">Counted {formatDateTime(snapshot.measuredAt, timeZone)}</p>
        </div>
      ) : null}
    </SectionCard>
  );
}

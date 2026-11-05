"use client";

import Link from "next/link";
import { useState } from "react";
import { formatMoney, isValidGstin, type PlatformSellerDetails } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Textarea } from "@/components/ui/Textarea";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { usePlatformInvoices, usePlatformSellerDetails, useUpdatePlatformSellerDetails } from "../hooks/usePlatformApi";

function SellerForm({ saved, seller }: { seller: PlatformSellerDetails; saved: boolean }) {
  const save = useUpdatePlatformSellerDetails();
  const [form, setForm] = useState(seller);
  const set = (key: keyof PlatformSellerDetails) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));
  const gstinOk = !form.gstin || isValidGstin(form.gstin.toUpperCase());
  const rate = Number(form.gstRateBps) / 100;

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ ...form, gstin: form.gstin.toUpperCase(), gstRateBps: Math.round(rate * 100) });
      }}
    >
      {!saved ? <Badge variant="warning">Using NexaChess academy&apos;s invoice details until you save</Badge> : null}
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <FormField id="seller-name" label="Legal name">
          <Input id="seller-name" onChange={set("legalName")} value={form.legalName} />
        </FormField>
        <FormField error={gstinOk ? undefined : "That GSTIN isn't valid."} hint="Blank = no GST is charged." id="seller-gstin" label="GSTIN">
          <Input id="seller-gstin" onChange={set("gstin")} value={form.gstin} />
        </FormField>
        <FormField id="seller-email" label="Billing email">
          <Input id="seller-email" onChange={set("email")} type="email" value={form.email} />
        </FormField>
        <div className="grid grid-cols-2 items-start gap-4">
          <FormField hint="e.g. NXP" id="seller-prefix" label="Invoice prefix">
            <Input id="seller-prefix" maxLength={12} onChange={set("invoicePrefix")} value={form.invoicePrefix} />
          </FormField>
          <FormField id="seller-rate" label="GST rate (%)">
            <Input
              id="seller-rate"
              inputMode="decimal"
              onChange={(event) => setForm((current) => ({ ...current, gstRateBps: Math.round(Number(event.target.value || 0) * 100) }))}
              value={String(rate)}
            />
          </FormField>
        </div>
      </div>
      <FormField id="seller-address" label="Address">
        <Textarea id="seller-address" onChange={set("address")} rows={2} value={form.address} />
      </FormField>
      <div>
        <Button disabled={!gstinOk || !form.invoicePrefix.trim()} isLoading={save.isPending} type="submit">
          Save seller details
        </Button>
      </div>
    </form>
  );
}

/** Console → Billing: the owner's invoice details and every platform invoice (SaaS Phase 6). */
export function BillingTab() {
  const timeZone = useUserTimeZone();
  const seller = usePlatformSellerDetails();
  const invoices = usePlatformInvoices();

  return (
    <div className="grid gap-6">
      <SectionCard description="Printed on every invoice NexaChess issues to an academy." title="Seller details">
        {seller.data ? (
          <SellerForm key={JSON.stringify(seller.data.seller)} saved={seller.data.saved} seller={seller.data.seller} />
        ) : (
          <Skeleton className="h-40 rounded-app" />
        )}
      </SectionCard>
      <SectionCard title="Invoices">
        <div className="overflow-x-auto">
          <Table className="min-w-[560px]">
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Academy</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invoices.data?.invoices ?? []).map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <Link className="font-semibold text-primary-ink hover:underline" href={`/admin/platform/invoices/${invoice.id}`}>
                      {invoice.number}
                    </Link>
                  </TableCell>
                  <TableCell>{invoice.tenantName}</TableCell>
                  <TableCell>{formatFullDate(invoice.issuedAt, timeZone)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(invoice.totalMinor, invoice.currency)}</TableCell>
                </TableRow>
              ))}
              {invoices.data && invoices.data.invoices.length === 0 ? (
                <TableRow>
                  <TableCell className="text-center text-app-muted" colSpan={4}>
                    No invoices yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </div>
  );
}

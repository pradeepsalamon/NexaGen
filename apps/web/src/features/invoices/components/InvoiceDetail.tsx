"use client";

import {
  formatMoney,
  PAYMENT_METHOD_LABELS,
  PAYMENT_SOURCE_LABELS,
  stateNameFromCode,
  type InvoiceItem
} from "@nexa-chess/types";
import { Download, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { formatFullDate } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { invoiceHtmlUrl, invoicePdfUrl } from "../api/invoicesApi";
import { InvoicePdfBadge, InvoiceStatusBadge, TaxTreatmentBadge } from "./InvoiceBadges";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";

/**
 * The invoice detail view (§16), used by both the student and admin surfaces.
 *
 * Every figure here is read from the invoice row, which was frozen at issue
 * time — nothing is recomputed in the browser, so what a customer reads on
 * screen is exactly what the PDF says.
 */
export function InvoiceDetail({
  invoice,
  pdfUrl
}: {
  invoice: InvoiceItem;
  /** Admins download through their own route; defaults to the owner route. */
  pdfUrl?: string;
}) {
  const timeZone = useUserTimeZone();
  const money = (minor: number) => formatMoney(minor, invoice.currency);
  const downloadUrl = pdfUrl ?? invoicePdfUrl(invoice.id);

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-lg font-bold text-app-text">
              {invoice.number}
            </p>
            <p className="text-sm text-app-muted">
              Order {invoice.orderNumber}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <InvoiceStatusBadge status={invoice.status} />
            <InvoicePdfBadge status={invoice.pdfStatus} />

            <SimpleTooltip label="Download this invoice as a PDF">
              <Button asChild size="sm" variant="primary">
                <a href={downloadUrl} rel="noopener noreferrer" target="_blank">
                  <Download className="mr-1.5 size-4" strokeWidth={2.5} />
                  Download PDF
                </a>
              </Button>
            </SimpleTooltip>

            <SimpleTooltip label="Open a printable version">
              <Button
                aria-label="Open a printable version of this invoice"
                asChild
                className="size-8 rounded-full border border-primary bg-primary p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-white"
                size="icon"
                variant="ghost"
              >
                <a
                  href={invoiceHtmlUrl(invoice.id)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <Printer className="size-4" strokeWidth={2.5} />
                </a>
              </Button>
            </SimpleTooltip>
          </div>
        </div>

        {invoice.pdfStatus === "FAILED" ? (
          <p className="rounded-app bg-secondary/20 px-3 py-2 text-sm text-app-text">
            We could not build the PDF for this invoice yet — it will be retried
            automatically. Your payment is unaffected and the figures below are
            final.
          </p>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-app-muted">
            Bill to
          </p>
          <p className="font-semibold text-app-text">{invoice.billing.name}</p>
          {invoice.billing.businessName ? (
            <p className="text-sm text-app-text">{invoice.billing.businessName}</p>
          ) : null}
          {[
            invoice.billing.line1,
            invoice.billing.line2,
            [invoice.billing.city, invoice.billing.state]
              .filter(Boolean)
              .join(", "),
            [invoice.billing.postalCode, invoice.billing.country]
              .filter(Boolean)
              .join(" ")
          ]
            .filter((line): line is string => Boolean(line && line.trim()))
            .map((line) => (
              <p className="text-sm text-app-text" key={line}>
                {line}
              </p>
            ))}
          {invoice.billing.email ? (
            <p className="text-sm text-app-muted">{invoice.billing.email}</p>
          ) : null}
          {invoice.billing.phone ? (
            <p className="text-sm text-app-muted">{invoice.billing.phone}</p>
          ) : null}
          {invoice.billing.gstin ? (
            <div className="pt-1">
              <p className="text-sm font-semibold text-app-text">
                GSTIN: {invoice.billing.gstin}
              </p>
              {stateNameFromCode(invoice.billing.stateCode) ? (
                <p className="text-xs text-app-muted">
                  Place of supply:{" "}
                  {stateNameFromCode(invoice.billing.stateCode)}
                </p>
              ) : null}
            </div>
          ) : null}
        </Card>

        <Card className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-app-muted">
            Payment
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field
              label="Invoice date"
              value={formatFullDate(invoice.invoiceDate, timeZone)}
            />
            {invoice.payment.paidAt ? (
              <Field
                label="Payment date"
                value={formatFullDate(invoice.payment.paidAt, timeZone)}
              />
            ) : null}
            {invoice.payment.provider ? (
              <Field
                label="Provider"
                value={PAYMENT_SOURCE_LABELS[invoice.payment.provider]}
              />
            ) : null}
            {invoice.payment.method ? (
              <Field
                label="Method"
                value={PAYMENT_METHOD_LABELS[invoice.payment.method]}
              />
            ) : null}
            {invoice.payment.transactionId ? (
              <Field
                full
                label="Transaction ID"
                mono
                value={invoice.payment.transactionId}
              />
            ) : null}
          </dl>
          <TaxTreatmentBadge treatment={invoice.taxTreatment} />
        </Card>
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <Table className="w-full min-w-[520px] border-collapse">
            <TableHeader>
              <TableRow className="border-b border-app-border">
                <TableHead className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                  Description
                </TableHead>
                <TableHead className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">
                  Qty
                </TableHead>
                <TableHead className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">
                  Rate
                </TableHead>
                <TableHead className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">
                  Amount
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lines.map((line, index) => (
                <TableRow
                  className="border-b border-app-border last:border-0"
                  key={`${line.description}-${index}`}
                >
                  <TableCell className="text-left px-4 py-3 text-sm text-app-text">
                    {line.description}
                    {line.discountAmount > 0 ? (
                      <span className="block text-xs text-app-muted">
                        Discount −{money(line.discountAmount)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-sm tabular-nums text-app-text">
                    {line.quantity}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-sm tabular-nums text-app-text">
                    {money(line.unitAmount)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-app-text">
                    {money(line.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end border-t border-app-border px-4 py-4">
          <dl className="w-full max-w-xs space-y-1.5">
            <Total label="Subtotal" value={money(invoice.subtotal)} />
            {invoice.discountAmount > 0 ? (
              <>
                <Total
                  label={
                    invoice.discountCode
                      ? `Discount (${invoice.discountCode})`
                      : "Discount"
                  }
                  value={`−${money(invoice.discountAmount)}`}
                />
                <Total
                  label="Taxable amount"
                  value={money(invoice.taxableAmount)}
                />
              </>
            ) : null}
            {invoice.cgstAmount > 0 ? (
              <Total
                label={`C${invoice.taxLabel ?? "GST"} ${invoice.taxRatePercent / 2}%`}
                value={money(invoice.cgstAmount)}
              />
            ) : null}
            {invoice.sgstAmount > 0 ? (
              <Total
                label={`S${invoice.taxLabel ?? "GST"} ${invoice.taxRatePercent / 2}%`}
                value={money(invoice.sgstAmount)}
              />
            ) : null}
            {invoice.igstAmount > 0 ? (
              <Total
                label={`I${invoice.taxLabel ?? "GST"} ${invoice.taxRatePercent}%`}
                value={money(invoice.igstAmount)}
              />
            ) : null}

            <div className="flex items-baseline justify-between border-t-2 border-app-text pt-2">
              <dt className="text-sm font-bold text-app-text">Total</dt>
              <dd className="text-lg font-bold tabular-nums text-primary-ink">
                {money(invoice.total)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-xs text-app-muted">Currency</dt>
              <dd className="text-xs text-app-muted">
                {invoice.currency.toUpperCase()}
              </dd>
            </div>

            {invoice.amountRefunded > 0 ? (
              <p className="mt-3 rounded-app bg-secondary/20 px-3 py-2 text-xs text-app-text">
                {money(invoice.amountRefunded)} of this invoice has been
                refunded. A credit note has been issued; this invoice itself is
                unchanged.
              </p>
            ) : null}
          </dl>
        </div>
      </Card>

      {invoice.terms || invoice.footer ? (
        <Card className="space-y-2">
          {invoice.terms ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-app-muted">
                Terms &amp; conditions
              </p>
              <p className="whitespace-pre-wrap text-sm text-app-muted">
                {invoice.terms}
              </p>
            </>
          ) : null}
          {invoice.footer ? (
            <p className="flex items-start gap-2 text-xs text-app-muted">
              <FileText className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} />
              {invoice.footer}
            </p>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

function Field({
  full,
  label,
  mono,
  value
}: {
  full?: boolean;
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className={full ? "col-span-2" : undefined}>
      <dt className="text-xs text-app-muted">{label}</dt>
      <dd
        className={`truncate text-sm font-semibold text-app-text${mono ? " font-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-sm text-app-muted">{label}</dt>
      <dd className="text-sm tabular-nums text-app-text">{value}</dd>
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Mail,
  Receipt,
  RotateCw,
  Undo2,
  Wallet
} from "lucide-react";
import Link from "next/link";
import {
  formatMoney,
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_KINDS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_PROVIDER_LABELS,
  PAYMENT_PROVIDERS,
  type AdminInvoiceQuery,
  type InvoiceDocumentStatus,
  type InvoiceStats
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatTile } from "@/components/ui/StatTile";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import {
  adminInvoiceExportUrl,
  adminInvoicePdfUrl
} from "../api/invoicesApi";
import {
  useAdminInvoices,
  useResendInvoiceEmail,
  useRetryInvoicePdf
} from "../hooks/useInvoicesApi";
import { CreditNoteDialog } from "./CreditNoteDialog";
import { InvoicePdfBadge, InvoiceStatusBadge } from "./InvoiceBadges";

const INVOICE_STATUSES = Object.keys(
  INVOICE_STATUS_LABELS
) as InvoiceDocumentStatus[];

/** Admin → Finance → Invoices (§17). */
export function AdminInvoicesPanel() {
  const timeZone = useUserTimeZone();
  const [filters, setFilters] = useState<Partial<AdminInvoiceQuery>>({
    page: 1,
    pageSize: 25
  });
  const [crediting, setCrediting] = useState<{
    id: string;
    number: string;
    total: number;
    currency: string;
  } | null>(null);

  const { data, isLoading } = useAdminInvoices(filters);
  const retryPdf = useRetryInvoicePdf();
  const resendEmail = useResendInvoiceEmail();

  // Any filter change resets to page 1; staying on page 7 of a narrower result
  // set shows an empty table for no reason.
  const set = (patch: Partial<AdminInvoiceQuery>) =>
    setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));

  return (
    <div className="space-y-4">
      {data ? <InvoiceStatsRow stats={data.stats} /> : null}

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-48 flex-1">
          <Input
            aria-label="Search invoices"
            onChange={(event) => set({ search: event.target.value })}
            placeholder="Invoice, order, customer, transaction ID…"
            value={filters.search ?? ""}
          />
        </div>

        <div className="min-w-36">
          <Select
            aria-label="Filter by status"
            onChange={(event) =>
              set({
                status: (event.target.value ||
                  undefined) as AdminInvoiceQuery["status"]
              })
            }
            options={INVOICE_STATUSES.map((status) => ({
              label: INVOICE_STATUS_LABELS[status],
              value: status
            }))}
            placeholder="Any status"
            value={filters.status ?? ""}
          />
        </div>

        <div className="min-w-36">
          <Select
            aria-label="Filter by gateway"
            onChange={(event) =>
              set({
                provider: (event.target.value ||
                  undefined) as AdminInvoiceQuery["provider"]
              })
            }
            options={PAYMENT_PROVIDERS.map((provider) => ({
              label: PAYMENT_PROVIDER_LABELS[provider],
              value: provider
            }))}
            placeholder="Any gateway"
            value={filters.provider ?? ""}
          />
        </div>

        <div className="min-w-36">
          <Select
            aria-label="Filter by method"
            onChange={(event) =>
              set({
                method: (event.target.value ||
                  undefined) as AdminInvoiceQuery["method"]
              })
            }
            options={PAYMENT_METHOD_KINDS.map((method) => ({
              label: PAYMENT_METHOD_LABELS[method],
              value: method
            }))}
            placeholder="Any method"
            value={filters.method ?? ""}
          />
        </div>

        <div className="min-w-28">
          <Input
            aria-label="Filter by currency"
            maxLength={3}
            onChange={(event) =>
              set({ currency: event.target.value.toUpperCase() || undefined })
            }
            placeholder="Currency"
            value={filters.currency ?? ""}
          />
        </div>

        <div className="min-w-36">
          <Input
            aria-label="From date"
            onChange={(event) => set({ from: event.target.value || undefined })}
            type="date"
            value={filters.from ?? ""}
          />
        </div>

        <div className="min-w-36">
          <Input
            aria-label="To date"
            onChange={(event) => set({ to: event.target.value || undefined })}
            type="date"
            value={filters.to ?? ""}
          />
        </div>

        <Button asChild size="sm" variant="outline">
          <a href={adminInvoiceExportUrl(filters)}>
            <Download className="mr-1.5 size-4" strokeWidth={2.5} />
            Export CSV
          </a>
        </Button>
      </Card>

      {isLoading ? <Skeleton className="h-96 w-full" /> : null}

      {data && data.invoices.length === 0 ? (
        <EmptyState
          description="No invoice matches these filters."
          title="Nothing to show"
        />
      ) : null}

      {data && data.invoices.length > 0 ? (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse">
              <thead>
                <tr className="border-b border-app-border">
                  {[
                    "Invoice",
                    "Customer",
                    "Order",
                    "Date",
                    "Amount",
                    "Tax",
                    "Payment",
                    "Status",
                    ""
                  ].map((heading) => (
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-app-muted"
                      key={heading}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((invoice) => (
                  <tr
                    className="border-b border-app-border last:border-0"
                    key={invoice.id}
                  >
                    <td className="px-4 py-3">
                      <Link
                        className="font-mono text-sm font-semibold text-primary hover:underline"
                        href={`/admin/finance/invoices/${invoice.id}`}
                      >
                        {invoice.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-app-text">
                        {invoice.billing.name}
                      </p>
                      {invoice.billing.email ? (
                        <p className="text-xs text-app-muted">
                          {invoice.billing.email}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-app-muted">
                      {invoice.orderNumber}
                    </td>
                    <td className="px-4 py-3 text-sm text-app-muted">
                      {formatFullDate(invoice.invoiceDate, timeZone)}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold tabular-nums text-app-text">
                      {formatMoney(invoice.total, invoice.currency)}
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-app-muted">
                      {formatMoney(invoice.taxTotal, invoice.currency)}
                    </td>
                    <td className="px-4 py-3 text-xs text-app-muted">
                      {invoice.payment.provider
                        ? PAYMENT_PROVIDER_LABELS[invoice.payment.provider]
                        : "—"}
                      {invoice.payment.method
                        ? ` · ${PAYMENT_METHOD_LABELS[invoice.payment.method]}`
                        : ""}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <InvoiceStatusBadge status={invoice.status} />
                        <InvoicePdfBadge status={invoice.pdfStatus} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <SimpleTooltip label="View this invoice">
                          <Button
                            aria-label={`View invoice ${invoice.number}`}
                            asChild
                            className="size-8 rounded-full border-app-border p-0 hover:bg-primary hover:text-white"
                            size="icon"
                            variant="outline"
                          >
                            <Link href={`/admin/finance/invoices/${invoice.id}`}>
                              <Eye className="size-4" strokeWidth={2.5} />
                            </Link>
                          </Button>
                        </SimpleTooltip>

                        <SimpleTooltip label="Download the PDF">
                          <Button
                            aria-label={`Download invoice ${invoice.number}`}
                            asChild
                            className="size-8 rounded-full border-app-border p-0 hover:bg-primary hover:text-white"
                            size="icon"
                            variant="outline"
                          >
                            <a
                              href={adminInvoicePdfUrl(invoice.id)}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              <Download className="size-4" strokeWidth={2.5} />
                            </a>
                          </Button>
                        </SimpleTooltip>

                        {invoice.pdfStatus === "FAILED" ? (
                          <SimpleTooltip label="Retry PDF generation">
                            <Button
                              aria-label={`Retry PDF for invoice ${invoice.number}`}
                              className="size-8 rounded-full border-app-border p-0 hover:bg-primary hover:text-white"
                              disabled={retryPdf.isPending}
                              onClick={() =>
                                retryPdf.mutate({ id: invoice.id })
                              }
                              size="icon"
                              variant="outline"
                            >
                              <RotateCw className="size-4" strokeWidth={2.5} />
                            </Button>
                          </SimpleTooltip>
                        ) : null}

                        <SimpleTooltip label="Resend the invoice email">
                          <Button
                            aria-label={`Resend invoice ${invoice.number} by email`}
                            className="size-8 rounded-full border-app-border p-0 hover:bg-primary hover:text-white"
                            disabled={resendEmail.isPending}
                            onClick={() => resendEmail.mutate(invoice.id)}
                            size="icon"
                            variant="outline"
                          >
                            <Mail className="size-4" strokeWidth={2.5} />
                          </Button>
                        </SimpleTooltip>

                        {invoice.amountRefunded < invoice.total ? (
                          <SimpleTooltip label="Issue a credit note">
                            <Button
                              aria-label={`Issue a credit note against ${invoice.number}`}
                              className="size-8 rounded-full border-app-border p-0 hover:bg-secondary hover:text-white"
                              onClick={() =>
                                setCrediting({
                                  id: invoice.id,
                                  number: invoice.number,
                                  total: invoice.total - invoice.amountRefunded,
                                  currency: invoice.currency
                                })
                              }
                              size="icon"
                              variant="outline"
                            >
                              <Undo2 className="size-4" strokeWidth={2.5} />
                            </Button>
                          </SimpleTooltip>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-app-border px-4 py-3">
            <p className="text-xs text-app-muted">
              {data.total} invoice{data.total === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                disabled={data.page <= 1}
                onClick={() => set({ page: data.page - 1 })}
                size="sm"
                variant="outline"
              >
                Previous
              </Button>
              <span className="text-xs text-app-muted">Page {data.page}</span>
              <Button
                disabled={data.page * data.pageSize >= data.total}
                onClick={() => set({ page: data.page + 1 })}
                size="sm"
                variant="outline"
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {crediting ? (
        <CreditNoteDialog
          currency={crediting.currency}
          invoiceId={crediting.id}
          invoiceNumber={crediting.number}
          maxAmount={crediting.total}
          onClose={() => setCrediting(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Money is rolled up per currency and never summed across them (§9): one
 * combined "revenue" number mixing rupees and dollars would be confidently
 * wrong, so each currency gets its own tile.
 */
function InvoiceStatsRow({ stats }: { stats: InvoiceStats }) {
  const currencies = Object.keys(stats.revenueByCurrency).sort();

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile
        icon={FileText}
        label="Total invoices"
        tone="primary"
        value={String(stats.totalInvoices)}
      />
      <StatTile
        icon={CheckCircle2}
        label="Paid"
        tone="accent"
        value={String(stats.paidInvoices)}
      />
      <StatTile
        icon={Undo2}
        label="Refunded"
        tone="secondary"
        value={String(stats.refundedInvoices)}
      />
      <StatTile
        context={stats.failedPdfCount > 0 ? "Retrying" : undefined}
        icon={AlertTriangle}
        label="PDF failures"
        tone="warm"
        value={String(stats.failedPdfCount)}
      />

      {currencies.map((currency) => (
        <StatTile
          context={currency}
          icon={Wallet}
          key={`revenue-${currency}`}
          label="Revenue"
          tone="primary"
          value={formatMoney(stats.revenueByCurrency[currency] ?? 0, currency)}
        />
      ))}
      {currencies.map((currency) => (
        <StatTile
          context={currency}
          icon={Receipt}
          key={`tax-${currency}`}
          label="Tax collected"
          tone="accent"
          value={formatMoney(stats.taxByCurrency[currency] ?? 0, currency)}
        />
      ))}
    </div>
  );
}

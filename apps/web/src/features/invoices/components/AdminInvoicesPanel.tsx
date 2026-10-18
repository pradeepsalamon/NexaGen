"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Mail,
  Receipt,
  RotateCw,
  Search,
  Undo2,
  Wallet
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  formatMoney,
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_KINDS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_SOURCE_LABELS,
  PAYMENT_SOURCES,
  type AdminInvoiceQuery,
  type AdminInvoiceSortField,
  type InvoiceDocumentStatus,
  type InvoiceStats
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  FilterChips,
  FilterField,
  FilterPopover,
  type ActiveFilter
} from "@/components/ui/FilterPopover";
import { Input } from "@/components/ui/Input";
import { RowActions } from "@/components/ui/RowActions";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatTile } from "@/components/ui/StatTile";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { SortButton } from "@/components/ui/DataTableSortButton";
import { DateStringPicker } from "@/components/ui/DatePicker";
import { cn } from "@/lib/utils";

const INVOICE_STATUSES = Object.keys(
  INVOICE_STATUS_LABELS
) as InvoiceDocumentStatus[];

type InvoiceFilters = Pick<
  Partial<AdminInvoiceQuery>,
  "currency" | "from" | "method" | "provider" | "status" | "to"
>;

const EMPTY_INVOICE_FILTERS: InvoiceFilters = {
  currency: undefined,
  from: undefined,
  method: undefined,
  provider: undefined,
  status: undefined,
  to: undefined
};

const pickInvoiceFilters = (query: Partial<AdminInvoiceQuery>): InvoiceFilters => ({
  currency: query.currency,
  from: query.from,
  method: query.method,
  provider: query.provider,
  status: query.status,
  to: query.to
});

/** Admin → Finance → Invoices (§17). */
export function AdminInvoicesPanel() {
  const router = useRouter();
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

  const { data, isLoading, isPlaceholderData } = useAdminInvoices(filters);
  const invoices = data?.invoices ?? [];

  // Typed into here; sent once the admin pauses, not on every keystroke.
  const [searchInput, setSearchInput] = useState(filters.search ?? "");
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 350);
  useEffect(() => {
    setFilters((current) =>
      (current.search ?? "") === debouncedSearch
        ? current
        : { ...current, search: debouncedSearch || undefined, page: 1 }
    );
  }, [debouncedSearch]);

  // Server-side sort: asc → desc → off, like useTableSort.
  const sortProps = (field: AdminInvoiceSortField) => ({
    direction: filters.sort === field ? (filters.order ?? "asc") : (false as const),
    onClick: () =>
      setFilters((current) => {
        if (current.sort !== field) return { ...current, sort: field, order: "asc", page: 1 };
        if ((current.order ?? "asc") === "asc") return { ...current, order: "desc", page: 1 };
        return { ...current, sort: undefined, order: undefined, page: 1 };
      })
  });
  const retryPdf = useRetryInvoicePdf();
  const resendEmail = useResendInvoiceEmail();

  // Any filter change resets to page 1; staying on page 7 of a narrower result
  // set shows an empty table for no reason.
  const set = (patch: Partial<AdminInvoiceQuery>) =>
    setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));

  const clearFilters = () => set(EMPTY_INVOICE_FILTERS);

  const activeFilters: ActiveFilter[] = [
    filters.status && {
      key: "status",
      label: INVOICE_STATUS_LABELS[filters.status],
      onRemove: () => set({ status: undefined })
    },
    filters.provider && {
      key: "provider",
      label: PAYMENT_SOURCE_LABELS[filters.provider],
      onRemove: () => set({ provider: undefined })
    },
    filters.method && {
      key: "method",
      label: PAYMENT_METHOD_LABELS[filters.method],
      onRemove: () => set({ method: undefined })
    },
    filters.currency && {
      key: "currency",
      label: filters.currency,
      onRemove: () => set({ currency: undefined })
    },
    filters.from && {
      key: "from",
      label: `From ${formatFullDate(filters.from, "UTC")}`,
      onRemove: () => set({ from: undefined })
    },
    filters.to && {
      key: "to",
      label: `To ${formatFullDate(filters.to, "UTC")}`,
      onRemove: () => set({ to: undefined })
    }
  ].filter((filter): filter is ActiveFilter => Boolean(filter));

  return (
    <div className="space-y-4">
      {data ? (
        <div className={cn(isPlaceholderData && "opacity-60 pointer-events-none transition-opacity")}>
          <InvoiceStatsRow stats={data.stats} />
        </div>
      ) : null}

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-48 flex-1">
            <Search
              aria-hidden="true"
              className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-app-muted"
              strokeWidth={2.5}
            />
            <Input
              aria-label="Search invoices"
              className="pl-10"
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Invoice, order, customer, transaction ID…"
              value={searchInput}
            />
          </div>

          <FilterPopover
            activeCount={activeFilters.length}
            emptyValue={EMPTY_INVOICE_FILTERS}
            onApply={set}
            value={pickInvoiceFilters(filters)}
          >
            {(draft, update) => (
              <>
                <FilterField htmlFor="invoice-filter-status" label="Status">
                  <Select
                    id="invoice-filter-status"
                    onChange={(event) =>
                      update({
                        status: (event.target.value ||
                          undefined) as AdminInvoiceQuery["status"]
                      })
                    }
                    options={INVOICE_STATUSES.map((status) => ({
                      label: INVOICE_STATUS_LABELS[status],
                      value: status
                    }))}
                    placeholder="Any status"
                    value={draft.status ?? ""}
                  />
                </FilterField>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FilterField htmlFor="invoice-filter-gateway" label="Gateway">
                    <Select
                      id="invoice-filter-gateway"
                      onChange={(event) =>
                        update({
                          provider: (event.target.value ||
                            undefined) as AdminInvoiceQuery["provider"]
                        })
                      }
                      options={PAYMENT_SOURCES.map((provider) => ({
                        label: PAYMENT_SOURCE_LABELS[provider],
                        value: provider
                      }))}
                      placeholder="Any gateway"
                      value={draft.provider ?? ""}
                    />
                  </FilterField>

                  <FilterField htmlFor="invoice-filter-method" label="Method">
                    <Select
                      id="invoice-filter-method"
                      onChange={(event) =>
                        update({
                          method: (event.target.value ||
                            undefined) as AdminInvoiceQuery["method"]
                        })
                      }
                      options={PAYMENT_METHOD_KINDS.map((method) => ({
                        label: PAYMENT_METHOD_LABELS[method],
                        value: method
                      }))}
                      placeholder="Any method"
                      value={draft.method ?? ""}
                    />
                  </FilterField>
                </div>

                <FilterField htmlFor="invoice-filter-currency" label="Currency">
                  <Input
                    id="invoice-filter-currency"
                    maxLength={3}
                    onChange={(event) =>
                      update({ currency: event.target.value.toUpperCase() || undefined })
                    }
                    placeholder="e.g. INR"
                    value={draft.currency ?? ""}
                  />
                </FilterField>

                <div className="space-y-3">
                  <FilterField label="From">
                    <DateStringPicker
                      aria-label="From date"
                      className="w-full"
                      onChange={(value) => update({ from: value || undefined })}
                      placeholder="Any date"
                      value={draft.from ?? ""}
                    />
                  </FilterField>

                  <FilterField label="To">
                    <DateStringPicker
                      aria-label="To date"
                      className="w-full"
                      onChange={(value) => update({ to: value || undefined })}
                      placeholder="Any date"
                      value={draft.to ?? ""}
                    />
                  </FilterField>
                </div>
              </>
            )}
          </FilterPopover>

          <Button asChild variant="outline">
            <a href={adminInvoiceExportUrl(filters)}>
              <Download className="size-4" strokeWidth={2.5} />
              Export CSV
            </a>
          </Button>
        </div>

        <FilterChips filters={activeFilters} onClearAll={clearFilters} />
      </Card>

      {isLoading ? <Skeleton className="h-96 w-full" /> : null}

      {data && data.invoices.length === 0 ? (
        <EmptyState
          description="No invoice matches these filters."
          title="Nothing to show"
        />
      ) : null}

      {data && data.invoices.length > 0 ? (
        <Card className={cn("p-0 transition-opacity", isPlaceholderData && "opacity-60 pointer-events-none")}>
          <div className="overflow-x-auto">
            <Table className="w-full min-w-[880px] border-collapse">
              <TableHeader>
                <TableRow className="border-b border-app-border">
                  {(
                    [
                      ["Invoice", "number"],
                      ["Customer", "billingName"],
                      ["Order", null],
                      ["Date", "invoiceDate"],
                      ["Amount", "total"],
                      ["Tax", "taxTotal"],
                      ["Payment", null],
                      ["Status", "status"],
                      ["", null]
                    ] as const
                  ).map(([heading, key]) => (
                    <TableHead
                      className="px-4 py-3 text-left text-xs font-semibold"
                      key={heading}
                    >
                      {key ? <SortButton label={heading} {...sortProps(key)} /> : heading}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow
                    className="border-b border-app-border last:border-0"
                    key={invoice.id}
                  >
                    <TableCell className="text-left px-4 py-3">
                      <Link
                        className="font-mono text-sm font-semibold text-primary-ink hover:underline"
                        href={`/admin/finance/invoices/${invoice.id}`}
                      >
                        {invoice.number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-left px-4 py-3">
                      <p className="text-sm text-app-text">
                        {invoice.billing.name}
                      </p>
                      {invoice.billing.email ? (
                        <p className="text-xs text-app-muted">
                          {invoice.billing.email}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-left px-4 py-3 font-mono text-xs text-app-muted">
                      {invoice.orderNumber}
                    </TableCell>
                    <TableCell className="text-left px-4 py-3 text-sm text-app-muted">
                      {formatFullDate(invoice.invoiceDate, timeZone)}
                    </TableCell>
                    <TableCell className="text-left px-4 py-3 text-sm font-semibold tabular-nums text-app-text">
                      {formatMoney(invoice.total, invoice.currency)}
                    </TableCell>
                    <TableCell className="text-left px-4 py-3 text-sm tabular-nums text-app-muted">
                      {formatMoney(invoice.taxTotal, invoice.currency)}
                    </TableCell>
                    <TableCell className="text-left px-4 py-3 text-xs text-app-muted">
                      {invoice.payment.provider
                        ? PAYMENT_SOURCE_LABELS[invoice.payment.provider]
                        : "—"}
                      {invoice.payment.method
                        ? ` · ${PAYMENT_METHOD_LABELS[invoice.payment.method]}`
                        : ""}
                    </TableCell>
                    <TableCell className="text-left px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <InvoiceStatusBadge status={invoice.status} />
                        <InvoicePdfBadge status={invoice.pdfStatus} />
                      </div>
                    </TableCell>
                    <TableCell className="text-left px-4 py-3">
                      <RowActions
                        actions={[
                          {
                            ariaLabel: `View invoice ${invoice.number}`,
                            icon: Eye,
                            label: "View invoice",
                            onSelect: () =>
                              router.push(`/admin/finance/invoices/${invoice.id}`)
                          },
                          {
                            ariaLabel: `Download invoice ${invoice.number}`,
                            icon: Download,
                            label: "Download PDF",
                            onSelect: () =>
                              window.open(
                                adminInvoicePdfUrl(invoice.id),
                                "_blank",
                                "noopener,noreferrer"
                              )
                          },
                          ...(invoice.pdfStatus === "FAILED"
                            ? [
                                {
                                  ariaLabel: `Retry PDF for invoice ${invoice.number}`,
                                  disabled: retryPdf.isPending,
                                  icon: RotateCw,
                                  label: "Retry PDF generation",
                                  onSelect: () =>
                                    retryPdf.mutate({ id: invoice.id })
                                }
                              ]
                            : []),
                          {
                            ariaLabel: `Resend invoice ${invoice.number} by email`,
                            disabled: resendEmail.isPending,
                            icon: Mail,
                            label: "Resend invoice email",
                            onSelect: () => resendEmail.mutate(invoice.id)
                          },
                          ...(invoice.amountRefunded < invoice.total
                            ? [
                                {
                                  ariaLabel: `Issue a credit note against ${invoice.number}`,
                                  icon: Undo2,
                                  label: "Issue credit note",
                                  onSelect: () =>
                                    setCrediting({
                                      currency: invoice.currency,
                                      id: invoice.id,
                                      number: invoice.number,
                                      total:
                                        invoice.total - invoice.amountRefunded
                                    }),
                                  tone: "warning" as const
                                }
                              ]
                            : [])
                        ]}
                        inline={2}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

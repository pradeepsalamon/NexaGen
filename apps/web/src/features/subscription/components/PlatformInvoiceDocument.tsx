"use client";

import { Printer } from "lucide-react";
import { formatMoney, stateNameFromCode, TAX_TREATMENT_LABELS, type PlatformInvoiceView, type TaxTreatment } from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";

function Party({ label, lines }: { label: string; lines: (string | null | undefined)[] }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-app-muted">{label}</p>
      {lines.filter(Boolean).map((line) => (
        <p className="break-words text-sm text-app-text" key={line}>
          {line}
        </p>
      ))}
    </div>
  );
}

/** A frozen GST invoice from NexaChess to an academy (SaaS Phase 6); printed with the browser. */
export function PlatformInvoiceDocument({
  backHref,
  backLabel,
  invoice,
  isLoading,
  onRetry,
}: {
  invoice: PlatformInvoiceView | undefined;
  isLoading: boolean;
  onRetry: () => void;
  backHref: string;
  backLabel: string;
}) {
  const timeZone = useUserTimeZone();
  const breadcrumbs = [{ href: backHref, label: backLabel }, { label: invoice?.number ?? "Invoice" }];
  if (isLoading) return <Skeleton className="h-96 rounded-app" />;
  if (!invoice) {
    return (
      <div className="space-y-4">
        <PageHeader breadcrumbs={breadcrumbs} title="Invoice" />
        <WidgetError message="Couldn't load this invoice." onRetry={onRetry} />
      </div>
    );
  }
  const money = (minor: number) => formatMoney(minor, invoice.currency);
  const taxRows = [
    { amount: invoice.cgstMinor, label: "CGST" },
    { amount: invoice.sgstMinor, label: "SGST" },
    { amount: invoice.igstMinor, label: "IGST" },
  ].filter((row) => row.amount > 0);

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <PageHeader
          actions={
            <Button onClick={() => window.print()} variant="outline">
              <Printer className="size-4" strokeWidth={2.5} />
              Print or save as PDF
            </Button>
          }
          breadcrumbs={breadcrumbs}
          title={`Invoice ${invoice.number}`}
        />
      </div>
      <article className="space-y-6 rounded-app border border-app-border bg-app-surface p-6 shadow-card print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-app-text">Tax invoice</h2>
            <p className="text-sm text-app-muted">
              {invoice.number} · {formatFullDate(invoice.issuedAt, timeZone)}
            </p>
          </div>
          <p className="text-sm text-app-muted">{TAX_TREATMENT_LABELS[invoice.taxTreatment as TaxTreatment] ?? invoice.taxTreatment}</p>
        </header>
        <div className="grid gap-6 sm:grid-cols-2">
          <Party
            label="From"
            lines={[
              invoice.seller.legalName,
              invoice.seller.address,
              invoice.seller.gstin ? `GSTIN ${invoice.seller.gstin}` : null,
              invoice.seller.email,
            ]}
          />
          <Party
            label="Billed to"
            lines={[
              invoice.buyer.name,
              invoice.buyer.address,
              invoice.buyer.gstin ? `GSTIN ${invoice.buyer.gstin}` : null,
              invoice.buyer.stateCode ? `Place of supply: ${stateNameFromCode(invoice.buyer.stateCode) ?? invoice.buyer.stateCode}` : null,
            ]}
          />
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[420px]">
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lines.map((line) => (
                <TableRow key={line.description}>
                  <TableCell>
                    <p className="text-sm text-app-text">{line.description}</p>
                    <p className="text-xs text-app-muted">
                      {formatFullDate(invoice.periodStart, timeZone)} to {formatFullDate(invoice.periodEnd, timeZone)}
                    </p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(line.amountMinor)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="text-right text-app-muted">Subtotal</TableCell>
                <TableCell className="text-right tabular-nums">{money(invoice.subtotalMinor)}</TableCell>
              </TableRow>
              {taxRows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="text-right text-app-muted">{row.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(row.amount)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="text-right font-semibold">Total</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{money(invoice.totalMinor)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        {invoice.paymentReference ? (
          <p className="text-xs text-app-muted">Paid online · reference {invoice.paymentReference}</p>
        ) : null}
      </article>
    </div>
  );
}

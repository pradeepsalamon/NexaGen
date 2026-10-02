"use client";

import { CREDIT_NOTE_REASON_LABELS, formatMoney } from "@nexa-chess/types";
import { Download } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { adminCreditNotePdfUrl } from "../api/invoicesApi";
import { useAdminCreditNotes } from "../hooks/useInvoicesApi";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useTableSort } from "@/hooks/useTableSort";
import { SortButton } from "@/components/ui/DataTableSortButton";

/** Every credit note raised, newest first (§19). */
export function AdminCreditNotesPanel() {
  const timeZone = useUserTimeZone();
  const { data, isLoading } = useAdminCreditNotes();
  const { rows: creditNotes, sortProps } = useTableSort({
    rows: data?.creditNotes,
    accessors: {
      amount: (c) => c.total,
      customer: (c) => c.billing.name,
      date: (c) => c.issuedAt,
      invoice: (c) => c.invoiceNumber,
      number: (c) => c.number,
      reason: (c) => CREDIT_NOTE_REASON_LABELS[c.reason]
    },
    initialKey: "date"
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  if (!data || data.creditNotes.length === 0) {
    return (
      <EmptyState
        description="A credit note is raised automatically whenever a refund settles, and can also be issued by hand against any invoice."
        title="No credit notes yet"
      />
    );
  }

  return (
    <Card className="p-0">
      <div className="overflow-x-auto">
        <Table className="w-full min-w-[760px] border-collapse">
          <TableHeader>
            <TableRow className="border-b border-app-border">
              {(
                [
                  ["Credit note", "number"],
                  ["Against", "invoice"],
                  ["Customer", "customer"],
                  ["Date", "date"],
                  ["Amount", "amount"],
                  ["Reason", "reason"],
                  ["", null]
                ] as const
              ).map(([heading, key]) => (
                <TableHead
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                  key={heading}
                >
                  {key ? <SortButton label={heading} {...sortProps(key)} /> : heading}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {creditNotes.map((creditNote) => (
              <TableRow
                className="border-b border-app-border last:border-0"
                key={creditNote.id}
              >
                <TableCell className="text-left px-4 py-3 font-mono text-sm font-semibold text-app-text">
                  {creditNote.number}
                </TableCell>
                <TableCell className="text-left px-4 py-3">
                  <Link
                    className="font-mono text-xs text-primary-ink hover:underline"
                    href={`/admin/finance/invoices/${creditNote.invoiceId}`}
                  >
                    {creditNote.invoiceNumber}
                  </Link>
                </TableCell>
                <TableCell className="text-left px-4 py-3 text-sm text-app-text">
                  {creditNote.billing.name}
                </TableCell>
                <TableCell className="text-left px-4 py-3 text-sm text-app-muted">
                  {formatFullDate(creditNote.issuedAt, timeZone)}
                </TableCell>
                <TableCell className="text-left px-4 py-3 text-sm font-semibold tabular-nums text-app-text">
                  {formatMoney(creditNote.total, creditNote.currency)}
                  {!creditNote.isFullCredit ? (
                    <Badge className="ml-2" variant="outline">
                      Partial
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-left px-4 py-3 text-xs text-app-muted">
                  {CREDIT_NOTE_REASON_LABELS[creditNote.reason]}
                  {creditNote.providerRefundId ? (
                    <span className="block font-mono">
                      {creditNote.providerRefundId}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="px-4 py-3 text-right">
                  <SimpleTooltip label="Download this credit note">
                    <Button
                      aria-label={`Download credit note ${creditNote.number}`}
                      asChild
                      className="size-8 rounded-full border border-primary bg-primary p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-white"
                      size="icon"
                      variant="ghost"
                    >
                      <a
                        href={adminCreditNotePdfUrl(creditNote.id)}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <Download className="size-4" strokeWidth={2.5} />
                      </a>
                    </Button>
                  </SimpleTooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

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

/** Every credit note raised, newest first (§19). */
export function AdminCreditNotesPanel() {
  const timeZone = useUserTimeZone();
  const { data, isLoading } = useAdminCreditNotes();

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
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="border-b border-app-border">
              {[
                "Credit note",
                "Against",
                "Customer",
                "Date",
                "Amount",
                "Reason",
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
            {data.creditNotes.map((creditNote) => (
              <tr
                className="border-b border-app-border last:border-0"
                key={creditNote.id}
              >
                <td className="px-4 py-3 font-mono text-sm font-semibold text-app-text">
                  {creditNote.number}
                </td>
                <td className="px-4 py-3">
                  <Link
                    className="font-mono text-xs text-primary hover:underline"
                    href={`/admin/finance/invoices/${creditNote.invoiceId}`}
                  >
                    {creditNote.invoiceNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-app-text">
                  {creditNote.billing.name}
                </td>
                <td className="px-4 py-3 text-sm text-app-muted">
                  {formatFullDate(creditNote.issuedAt, timeZone)}
                </td>
                <td className="px-4 py-3 text-sm font-semibold tabular-nums text-app-text">
                  {formatMoney(creditNote.total, creditNote.currency)}
                  {!creditNote.isFullCredit ? (
                    <Badge className="ml-2" variant="outline">
                      Partial
                    </Badge>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-xs text-app-muted">
                  {CREDIT_NOTE_REASON_LABELS[creditNote.reason]}
                  {creditNote.providerRefundId ? (
                    <span className="block font-mono">
                      {creditNote.providerRefundId}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-right">
                  <SimpleTooltip label="Download this credit note">
                    <Button
                      aria-label={`Download credit note ${creditNote.number}`}
                      asChild
                      className="size-8 rounded-full border-app-border p-0 hover:bg-primary hover:text-white"
                      size="icon"
                      variant="outline"
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

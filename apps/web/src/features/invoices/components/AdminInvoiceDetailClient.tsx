"use client";

import { useState } from "react";
import { INVOICE_EVENT_LABELS } from "@nexa-chess/types";
import { ArrowLeft, Mail, RotateCw, Undo2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { adminInvoicePdfUrl } from "../api/invoicesApi";
import {
  useAdminInvoice,
  useAdminInvoiceAudit,
  useResendInvoiceEmail,
  useRetryInvoicePdf
} from "../hooks/useInvoicesApi";
import { CreditNoteDialog } from "./CreditNoteDialog";
import { InvoiceDetail } from "./InvoiceDetail";

/** One invoice, as an admin sees it: the document plus its audit trail (§21). */
export function AdminInvoiceDetailClient({ invoiceId }: { invoiceId: string }) {
  const timeZone = useUserTimeZone();
  const { data: invoice, isLoading, isError } = useAdminInvoice(invoiceId);
  const { data: audit } = useAdminInvoiceAudit(invoiceId);

  const retryPdf = useRetryInvoicePdf();
  const resendEmail = useResendInvoiceEmail();
  const [crediting, setCrediting] = useState(false);

  return (
    <div className="space-y-4">
      <Button asChild className="-ml-2" size="sm" variant="ghost">
        <Link href="/admin/finance/invoices">
          <ArrowLeft className="mr-1.5 size-4" strokeWidth={2.5} />
          Back to invoices
        </Link>
      </Button>

      {isLoading ? <Skeleton className="h-96 w-full" /> : null}

      {isError ? (
        <EmptyState
          description="This invoice could not be loaded."
          title="Invoice not available"
        />
      ) : null}

      {invoice ? (
        <>
          <Card className="flex flex-wrap items-center gap-2 p-4">
            <Button
              disabled={retryPdf.isPending}
              onClick={() => retryPdf.mutate({ id: invoice.id, force: true })}
              size="sm"
              variant="outline"
            >
              <RotateCw className="mr-1.5 size-4" strokeWidth={2.5} />
              Regenerate PDF
            </Button>

            <Button
              disabled={resendEmail.isPending}
              onClick={() => resendEmail.mutate(invoice.id)}
              size="sm"
              variant="outline"
            >
              <Mail className="mr-1.5 size-4" strokeWidth={2.5} />
              Resend email
            </Button>

            {invoice.amountRefunded < invoice.total ? (
              <Button
                onClick={() => setCrediting(true)}
                size="sm"
                variant="outline"
              >
                <Undo2 className="mr-1.5 size-4" strokeWidth={2.5} />
                Issue credit note
              </Button>
            ) : null}

            {invoice.emailSent && invoice.emailSentAt ? (
              <p className="ml-auto text-xs text-app-muted">
                Emailed {formatDateTime(invoice.emailSentAt, timeZone)}
              </p>
            ) : (
              <p className="ml-auto text-xs text-app-muted">Not yet emailed</p>
            )}
          </Card>

          <InvoiceDetail
            invoice={invoice}
            pdfUrl={adminInvoicePdfUrl(invoice.id)}
          />

          <Card className="space-y-3">
            <div>
              <h3 className="text-sm font-bold text-app-text">Audit trail</h3>
              <p className="text-xs text-app-muted">
                Append-only. Every generation, download, email and credit note
                against this invoice.
              </p>
            </div>

            {audit && audit.entries.length > 0 ? (
              <ol className="divide-y divide-app-border">
                {audit.entries.map((entry) => (
                  <li
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2"
                    key={entry.id}
                  >
                    <span className="text-sm font-semibold text-app-text">
                      {INVOICE_EVENT_LABELS[entry.event]}
                    </span>
                    <span className="text-xs text-app-muted">
                      {formatDateTime(entry.createdAt, timeZone)}
                    </span>
                    <span className="text-xs text-app-muted">
                      {/* No actor means the system did it: a webhook, a cron
                          sweep or the PDF worker. */}
                      {entry.actorName ?? "System"}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-app-muted">No activity recorded yet.</p>
            )}
          </Card>

          {crediting ? (
            <CreditNoteDialog
              currency={invoice.currency}
              invoiceId={invoice.id}
              invoiceNumber={invoice.number}
              maxAmount={invoice.total - invoice.amountRefunded}
              onClose={() => setCrediting(false)}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

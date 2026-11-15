"use client";

import { useState } from "react";
import { INVOICE_EVENT_LABELS } from "@nexa-chess/types";
import { Mail, RotateCw, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import type { Crumb } from "@/components/ui/Breadcrumbs";
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
  useRetryInvoicePdf,
} from "../hooks/useInvoicesApi";
import { CreditNoteDialog } from "./CreditNoteDialog";
import { InvoiceDetail } from "./InvoiceDetail";

const CRUMBS: Crumb[] = [
  { href: "/admin/finance/invoices", label: "Invoices" },
];

/** One invoice, as an admin sees it: the document plus its audit trail (§21). */
export function AdminInvoiceDetailClient({ invoiceId }: { invoiceId: string }) {
  const timeZone = useUserTimeZone();
  const { data: invoice, isLoading, isError } = useAdminInvoice(invoiceId);
  const { data: audit } = useAdminInvoiceAudit(invoiceId);

  const retryPdf = useRetryInvoicePdf();
  const resendEmail = useResendInvoiceEmail();
  const [crediting, setCrediting] = useState(false);

  if (!invoice) {
    return (
      <div>
        <PageHeader
          breadcrumbs={[...CRUMBS, { label: "Invoice" }]}
          title="Invoice"
        />

        {isLoading ? <Skeleton className="h-96 w-full" /> : null}

        {isError ? (
          <EmptyState
            description="This invoice could not be loaded."
            title="Invoice not available"
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <InvoiceDetail
        actions={
          <>
            <Button
              disabled={retryPdf.isPending}
              onClick={() => retryPdf.mutate({ id: invoice.id, force: true })}
              variant="neutral"
            >
              <RotateCw className="size-4" strokeWidth={2.5} />
              Regenerate PDF
            </Button>

            <Button
              disabled={resendEmail.isPending}
              onClick={() => resendEmail.mutate(invoice.id)}
              variant="neutral"
            >
              <Mail className="size-4" strokeWidth={2.5} />
              Resend email
            </Button>

            {invoice.amountRefunded < invoice.total ? (
              <Button onClick={() => setCrediting(true)} variant="outline">
                <Undo2 className="size-4" strokeWidth={2.5} />
                Issue credit note
              </Button>
            ) : null}
          </>
        }
        breadcrumbs={[...CRUMBS, { label: invoice.number }]}
        invoice={invoice}
        pdfUrl={adminInvoicePdfUrl(invoice.id)}
      />

      <Card className="space-y-3 p-4">
        <div>
          <h2 className="text-sm font-bold text-app-text">Audit trail</h2>
          <p className="text-xs text-app-muted">
            Append-only. Every generation, download, email and credit note
            against this invoice.
          </p>
          <p className="mt-1 text-xs text-app-muted">
            {invoice.emailSent && invoice.emailSentAt
              ? `Emailed ${formatDateTime(invoice.emailSentAt, timeZone)}`
              : "Not yet emailed"}
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
    </div>
  );
}

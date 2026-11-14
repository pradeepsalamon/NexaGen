"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import type { Crumb } from "@/components/ui/Breadcrumbs";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useInvoice } from "../hooks/useInvoicesApi";
import { InvoiceDetail } from "./InvoiceDetail";

const CRUMBS: Crumb[] = [{ href: "/student/billing", label: "Billing" }];

/** A student's own invoice (§16). Authorization is enforced by the API. */
export function InvoiceDetailClient({ invoiceId }: { invoiceId: string }) {
  const { data: invoice, isLoading, isError } = useInvoice(invoiceId);

  if (invoice) {
    return (
      <InvoiceDetail
        breadcrumbs={[...CRUMBS, { label: invoice.number }]}
        invoice={invoice}
      />
    );
  }

  return (
    <div>
      <PageHeader breadcrumbs={[...CRUMBS, { label: "Invoice" }]} title="Invoice" />

      {isLoading ? <Skeleton className="h-96 w-full" /> : null}

      {isError ? (
        <EmptyState
          description="This invoice does not exist, or it belongs to another account."
          title="Invoice not available"
        />
      ) : null}
    </div>
  );
}

"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useInvoice } from "../hooks/useInvoicesApi";
import { InvoiceDetail } from "./InvoiceDetail";

/** A student's own invoice (§16). Authorization is enforced by the API. */
export function InvoiceDetailClient({ invoiceId }: { invoiceId: string }) {
  const { data: invoice, isLoading, isError } = useInvoice(invoiceId);

  return (
    <div className="space-y-4">
      <Button asChild className="-ml-2" size="sm" variant="ghost">
        <Link href="/student/billing">
          <ArrowLeft className="mr-1.5 size-4" strokeWidth={2.5} />
          Back to billing
        </Link>
      </Button>

      {isLoading ? <Skeleton className="h-96 w-full" /> : null}

      {isError ? (
        <EmptyState
          description="This invoice does not exist, or it belongs to another account."
          title="Invoice not available"
        />
      ) : null}

      {invoice ? <InvoiceDetail invoice={invoice} /> : null}
    </div>
  );
}

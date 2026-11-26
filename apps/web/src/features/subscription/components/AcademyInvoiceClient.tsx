"use client";

import { useAcademyInvoice } from "../hooks/useSubscription";
import { PlatformInvoiceDocument } from "./PlatformInvoiceDocument";

export function AcademyInvoiceClient({ id }: { id: string }) {
  const query = useAcademyInvoice(id);
  return (
    <PlatformInvoiceDocument
      backHref="/admin/subscription"
      backLabel="Subscription"
      error={query.error}
      invoice={query.data}
      isLoading={query.isLoading}
      onRetry={() => void query.refetch()}
    />
  );
}

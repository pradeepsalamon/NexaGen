"use client";

import { PlatformInvoiceDocument } from "@/features/subscription/components/PlatformInvoiceDocument";
import { usePlatformInvoice } from "../hooks/usePlatformApi";

export function PlatformInvoiceClient({ id }: { id: string }) {
  const query = usePlatformInvoice(id);
  return (
    <PlatformInvoiceDocument
      backHref="/admin/platform"
      backLabel="Platform console"
      invoice={query.data}
      isLoading={query.isLoading}
      onRetry={() => void query.refetch()}
    />
  );
}

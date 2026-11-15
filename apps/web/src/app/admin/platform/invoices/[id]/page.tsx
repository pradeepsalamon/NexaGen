import { PlatformInvoiceClient } from "@/features/platform/components/PlatformInvoiceClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/platform/invoices/[id]") };

export default async function PlatformInvoicePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <PlatformInvoiceClient id={params.id} />;
}

import { AdminInvoiceDetailClient } from "@/features/invoices/components/AdminInvoiceDetailClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/admin/finance/invoices/[id]"),
};

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <AdminInvoiceDetailClient invoiceId={params.id} />;
}

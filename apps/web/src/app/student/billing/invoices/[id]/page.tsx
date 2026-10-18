import { InvoiceDetailClient } from "@/features/invoices/components/InvoiceDetailClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/student/billing/invoices/[id]"),
};

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <InvoiceDetailClient invoiceId={params.id} />;
}

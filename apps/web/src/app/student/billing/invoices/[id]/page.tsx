import { InvoiceDetailClient } from "@/features/invoices/components/InvoiceDetailClient";

export const metadata = {
  title: "Invoice",
};

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <InvoiceDetailClient invoiceId={params.id} />;
}

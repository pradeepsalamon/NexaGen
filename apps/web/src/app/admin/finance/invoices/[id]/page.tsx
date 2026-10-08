import { AdminInvoiceDetailClient } from "@/features/invoices/components/AdminInvoiceDetailClient";

export const metadata = {
  title: "Invoice - Admin",
};

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <AdminInvoiceDetailClient invoiceId={params.id} />;
}

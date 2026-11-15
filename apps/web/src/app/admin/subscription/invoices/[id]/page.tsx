import { AcademyInvoiceClient } from "@/features/subscription/components/AcademyInvoiceClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/subscription/invoices/[id]") };

export default async function AcademyInvoicePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <AcademyInvoiceClient id={params.id} />;
}

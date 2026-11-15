import { SupportTicketDetailClient } from "@/features/support/components/SupportTicketDetailClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/support/tickets/[id]") };

export default async function AdminSupportTicketPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return <SupportTicketDetailClient ticketId={id} />;
}

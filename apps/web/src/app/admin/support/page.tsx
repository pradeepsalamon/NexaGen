import { SupportTicketsClient } from "@/features/support/components/SupportTicketsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/support") };

export default function AdminSupportPage() {
  return <SupportTicketsClient />;
}

import { MessagingClient } from "@/features/messaging/components/MessagingClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/admin/messaging"),
};

export default function AdminMessagingPage() {
  return <MessagingClient />;
}

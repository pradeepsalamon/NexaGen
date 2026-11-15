import { WhatsAppConnectionClient } from "@/features/branding/components/WhatsAppConnectionClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/whatsapp") };

export default function AdminWhatsAppConnectionPage() {
  return <WhatsAppConnectionClient />;
}

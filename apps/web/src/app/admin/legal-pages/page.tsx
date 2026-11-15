import { LegalPagesClient } from "@/features/legal/components/LegalPagesClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/legal-pages") };

export default function AdminLegalPagesPage() {
  return <LegalPagesClient />;
}

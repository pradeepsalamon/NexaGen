import { AcademyContentPacksClient } from "@/features/platform/components/AcademyContentPacksClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/content-packs") };

export default function AdminContentPacksPage() {
  return <AcademyContentPacksClient />;
}

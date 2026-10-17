import { AdminTypographyClient } from "@/features/typography/components/AdminTypographyClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/admin/typography"),
};

export default function AdminTypographyPage() {
  return <AdminTypographyClient />;
}

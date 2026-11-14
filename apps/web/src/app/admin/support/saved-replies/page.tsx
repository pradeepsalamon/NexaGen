import { SupportSavedRepliesClient } from "@/features/support/components/SupportSavedRepliesClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/support/saved-replies") };

export default function AdminSupportSavedRepliesPage() {
  return <SupportSavedRepliesClient />;
}

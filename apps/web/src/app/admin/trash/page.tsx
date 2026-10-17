import { TrashManagementClient } from "@/features/trash/components/TrashManagementClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/trash") };

export default function AdminTrashPage() {
  return <TrashManagementClient />;
}

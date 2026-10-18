import { BatchManagementClient } from "../../../features/batches/components/BatchManagementClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/batches") };

export default function BatchesPage() {
  return <BatchManagementClient />;
}

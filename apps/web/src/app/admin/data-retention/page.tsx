import { DataRetentionClient } from "@/features/retention/components/DataRetentionClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/admin/data-retention")
};

export default function DataRetentionPage() {
  return <DataRetentionClient />;
}

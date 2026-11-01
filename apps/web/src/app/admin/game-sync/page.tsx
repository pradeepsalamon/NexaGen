import { AdminGameSyncClient } from "@/features/game-analysis/components/AdminGameSyncClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/admin/game-sync"),
};

export default function AdminGameSyncPage() {
  return <AdminGameSyncClient />;
}

import { AdminTournamentsClient } from "@/features/tournaments/components/AdminTournamentsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/admin/tournaments"),
};

export default function AdminTournamentsPage() {
  return <AdminTournamentsClient />;
}

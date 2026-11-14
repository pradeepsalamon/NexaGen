import { StudentHistoryClient } from "@/features/tournaments/components/HistoryClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/admin/tournaments/students/[userId]"),
};

export default async function StudentTournamentHistoryPage(props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;
  return <StudentHistoryClient userId={params.userId} />;
}

import { ActivityEditClient } from "@/features/puzzles/components/activities/ActivityEditClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/puzzles/activities/[id]/edit") };

export default async function AdminEditActivityPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <ActivityEditClient id={params.id} basePath="/admin/puzzles" />;
}

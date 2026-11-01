import { ActivityForm } from "@/features/puzzles/components/activities/ActivityForm";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/puzzles/activities/new") };

export default async function AdminNewActivityPage(props: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await props.searchParams;
  return <ActivityForm kind={kind === "PLAYOUT" ? "PLAYOUT" : "MCQ"} basePath="/admin/puzzles" />;
}

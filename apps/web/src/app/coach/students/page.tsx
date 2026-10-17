import { CoachStudentsClient } from "../../../features/coach/components/CoachStudentsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/coach/students")
};

export default async function CoachStudentsPage(
  props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
  }
) {
  const searchParams = await props.searchParams;
  const batchId = typeof searchParams.batchId === 'string' ? searchParams.batchId : undefined;
  return <CoachStudentsClient initialBatchId={batchId} />;
}

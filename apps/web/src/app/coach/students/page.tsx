import { CoachStudentsClient } from "../../../features/coach/components/CoachStudentsClient";

export const metadata = {
  title: "Students - Coach Workspace"
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

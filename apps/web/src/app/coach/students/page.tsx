import { CoachStudentsClient } from "../../../features/coach/components/CoachStudentsClient";

export const metadata = {
  title: "Students - Coach Workspace"
};

export default function CoachStudentsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const batchId = typeof searchParams.batchId === 'string' ? searchParams.batchId : undefined;
  return <CoachStudentsClient initialBatchId={batchId} />;
}

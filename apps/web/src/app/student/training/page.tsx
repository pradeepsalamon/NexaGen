import { Suspense } from "react";
import { PageLoading } from "@/components/layout/PageLoading";
import { StudentTrainingClient } from "@/features/puzzles/components/training/StudentTrainingClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/student/training")
};

export default function StudentTrainingPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <StudentTrainingClient />
    </Suspense>
  );
}

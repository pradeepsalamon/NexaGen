import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { StudentRevisionClient } from "@/features/revision/components/StudentRevisionClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/student/revision")
};

export default function StudentRevisionPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[32rem] w-full" />}>
      <StudentRevisionClient />
    </Suspense>
  );
}

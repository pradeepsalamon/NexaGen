import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { StudentRevisionClient } from "@/features/revision/components/StudentRevisionClient";

export const metadata = {
  title: "Smart Revision"
};

export default function StudentRevisionPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[32rem] w-full" />}>
      <StudentRevisionClient />
    </Suspense>
  );
}

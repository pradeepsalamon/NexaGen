import { Suspense } from "react";
import { PageLoading } from "@/components/layout/PageLoading";
import { AdminAssignmentsClient } from "@/features/assignments/components/AdminAssignmentsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/admin/assignments")
};

export default function AdminAssignmentsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <AdminAssignmentsClient />
    </Suspense>
  );
}

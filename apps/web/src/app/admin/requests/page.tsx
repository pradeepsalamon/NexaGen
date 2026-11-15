import { Suspense } from "react";
import { AdminRequestsClient } from "@/features/approvals/components/AdminRequestsClient";
import { pageTitle } from "@/lib/pageTitles";
import { PageLoading } from "@/components/layout/PageLoading";

export const metadata = { title: pageTitle("/admin/requests") };

export default function AdminRequestsPage() {
  // The client reads ?id= (a notification's deep link).
  return (
    <Suspense fallback={<PageLoading />}>
      <AdminRequestsClient />
    </Suspense>
  );
}

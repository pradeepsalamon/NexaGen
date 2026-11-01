import { Suspense } from "react";
import { AdminRequestsClient } from "@/features/approvals/components/AdminRequestsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/requests") };

export default function AdminRequestsPage() {
  // The client reads ?id= (a notification's deep link).
  return (
    <Suspense fallback={null}>
      <AdminRequestsClient />
    </Suspense>
  );
}

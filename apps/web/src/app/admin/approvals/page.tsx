import { Suspense } from "react";
import { ApprovalsClient } from "@/features/admin/components/approvals/ApprovalsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/approvals") };

export default function AdminApprovalsPage() {
  return (
    <Suspense>
      <ApprovalsClient />
    </Suspense>
  );
}

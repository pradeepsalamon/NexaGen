import { Suspense } from "react";
import { ApprovalsClient } from "@/features/admin/components/approvals/ApprovalsClient";

export default function AdminApprovalsPage() {
  return (
    <Suspense>
      <ApprovalsClient />
    </Suspense>
  );
}

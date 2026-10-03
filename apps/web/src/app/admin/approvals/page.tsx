import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApprovalsClient } from "@/features/admin/components/approvals/ApprovalsClient";

export default function AdminApprovalsPage() {
  const hasAccessToken = Boolean(cookies().get("nexa_access_token")?.value);
  const hasRefreshToken = Boolean(cookies().get("nexa_refresh_token")?.value);

  if (!hasAccessToken && !hasRefreshToken) {
    redirect("/login?reason=unauthorized");
  }

  return (
    <Suspense>
      <ApprovalsClient />
    </Suspense>
  );
}

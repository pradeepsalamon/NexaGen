import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminAssignmentsClient } from "@/features/assignments/components/AdminAssignmentsClient";

const accessTokenCookieName = "nexa_access_token";

export const metadata = {
  title: "Assignment library - Admin"
};

export default function AdminAssignmentsPage() {
  const hasAccessToken = Boolean(cookies().get(accessTokenCookieName)?.value);
  const hasRefreshToken = Boolean(cookies().get("nexa_refresh_token")?.value);

  if (!hasAccessToken && !hasRefreshToken) {
    redirect("/login?reason=unauthorized");
  }

  return <AdminAssignmentsClient />;
}

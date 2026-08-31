import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AnalyticsDashboardClient } from "@/features/analytics/components/AnalyticsDashboardClient";

const accessTokenCookieName = "nexa_access_token";

export default function AdminOverviewPage() {
  const hasAccessToken = Boolean(cookies().get(accessTokenCookieName)?.value);
  const hasRefreshToken = Boolean(cookies().get("nexa_refresh_token")?.value);

  if (!hasAccessToken && !hasRefreshToken) {
    redirect("/login?reason=unauthorized");
  }

  return <AnalyticsDashboardClient />;
}

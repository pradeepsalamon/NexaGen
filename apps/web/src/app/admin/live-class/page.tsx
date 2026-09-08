import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminLiveClassSettingsClient } from "@/features/live-class/settings/AdminLiveClassSettingsClient";

const accessTokenCookieName = "nexa_access_token";

export const metadata = {
  title: "Live Class Settings - Admin",
};

export default function AdminLiveClassSettingsPage() {
  const hasAccessToken = Boolean(cookies().get(accessTokenCookieName)?.value);
  const hasRefreshToken = Boolean(cookies().get("nexa_refresh_token")?.value);

  if (!hasAccessToken && !hasRefreshToken) {
    redirect("/login?reason=unauthorized");
  }

  return <AdminLiveClassSettingsClient />;
}

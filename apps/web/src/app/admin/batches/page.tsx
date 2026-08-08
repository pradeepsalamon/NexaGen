import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BatchManagementClient } from "../../../features/batches/components/BatchManagementClient";

const accessTokenCookieName = "nexa_access_token";

export default function BatchesPage() {
  const hasAccessToken = Boolean(cookies().get(accessTokenCookieName)?.value);

  const hasRefreshToken = Boolean(cookies().get("nexa_refresh_token")?.value);

  if (!hasAccessToken && !hasRefreshToken) {
    redirect("/login?reason=unauthorized");
  }

  return <BatchManagementClient />;
}

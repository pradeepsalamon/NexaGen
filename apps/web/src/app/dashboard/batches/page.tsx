import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BatchManagementClient } from "../../../features/batches/components/BatchManagementClient";

const accessTokenCookieName = "nexagen_access_token";

export default function BatchesPage() {
  const hasAccessToken = Boolean(cookies().get(accessTokenCookieName)?.value);

  if (!hasAccessToken) {
    redirect("/login?next=/dashboard/batches");
  }

  return <BatchManagementClient />;
}

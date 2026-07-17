import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BatchManagementClient } from "../../../features/batches/components/BatchManagementClient";

const accessTokenCookieName = "nexa_access_token";

export default function BatchesPage() {
  const hasAccessToken = Boolean(cookies().get(accessTokenCookieName)?.value);

  if (!hasAccessToken) {
    redirect("/login?next=/admin/batches");
  }

  return <BatchManagementClient />;
}

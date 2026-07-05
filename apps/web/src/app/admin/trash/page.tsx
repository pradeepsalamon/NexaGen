import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TrashManagementClient } from "@/features/trash/components/TrashManagementClient";

const accessTokenCookieName = "nexagen_access_token";

export default function AdminTrashPage() {
  const hasAccessToken = Boolean(cookies().get(accessTokenCookieName)?.value);

  if (!hasAccessToken) {
    redirect("/login?next=/admin/trash");
  }

  return <TrashManagementClient />;
}

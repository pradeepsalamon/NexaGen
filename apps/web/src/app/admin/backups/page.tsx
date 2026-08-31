import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BackupManager } from "../_components/BackupManager";
import { SuperAdminOnly } from "@/components/layout/SuperAdminOnly";

const accessTokenCookieName = "nexa_access_token";

export default function AdminBackupsPage() {
  const hasAccessToken = Boolean(cookies().get(accessTokenCookieName)?.value);
  const hasRefreshToken = Boolean(cookies().get("nexa_refresh_token")?.value);

  if (!hasAccessToken && !hasRefreshToken) {
    redirect("/login?reason=unauthorized");
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-app-text sm:text-2xl">
          Database backups
        </h1>
        <p className="text-sm text-app-muted">
          Download or restore the automated PostgreSQL backups stored in object
          storage.
        </p>
      </div>
      <SuperAdminOnly>
        <BackupManager />
      </SuperAdminOnly>
    </div>
  );
}

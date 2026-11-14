import { BackupManager } from "../_components/BackupManager";
import { SuperAdminOnly } from "@/components/layout/SuperAdminOnly";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/backups") };

export default function AdminBackupsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-app-text sm:text-2xl">
          Database backups
        </h1>
        <p className="text-sm text-app-muted">
          Download the automated PostgreSQL backups stored in object storage.
          Restores are run from the server (see docs/DATABASE_RESTORE.md).
        </p>
      </div>
      <SuperAdminOnly>
        <BackupManager />
      </SuperAdminOnly>
    </div>
  );
}

import { BackupManager } from "../_components/BackupManager";
import { PageHeader } from "@/components/layout/PageHeader";
import { SuperAdminOnly } from "@/components/layout/SuperAdminOnly";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/backups") };

export default function AdminBackupsPage() {
  return (
    <div className="animate-fade-in pb-10">
      <PageHeader
        description="Download the automated PostgreSQL backups stored in object storage. Restores are run from the server (see docs/DATABASE_RESTORE.md)."
        title="Database backups"
      />
      <SuperAdminOnly>
        <BackupManager />
      </SuperAdminOnly>
    </div>
  );
}

import { BackupManager } from "../_components/BackupManager";
import { PageHeader } from "@/components/layout/PageHeader";
import { PlatformOperatorOnly } from "@/components/layout/PlatformOperatorOnly";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/backups") };

export default function AdminBackupsPage() {
  return (
    <div className="animate-fade-in pb-10">
      <PageHeader
        description="Download the automated PostgreSQL backups stored in object storage. Restores are run from the server (see docs/DATABASE_RESTORE.md)."
        title="Database backups"
      />
      <PlatformOperatorOnly>
        <BackupManager />
      </PlatformOperatorOnly>
    </div>
  );
}

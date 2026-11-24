"use client";

import { AlertTriangle, CheckCircle2, Download, HardDriveDownload } from "lucide-react";
import {
  useBackupDownloadLinkMutation,
  useBackupsQuery,
  useTriggerBackupMutation
} from "@/features/backups/hooks/useBackupsApi";
import { formatDateTime } from "@/lib/datetime";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/providers/ToastProvider";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { useTableSort } from "@/hooks/useTableSort";
import { SortButton } from "@/components/ui/DataTableSortButton";
import { Button } from "@/components/ui/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { Spinner } from "@/components/ui/Spinner";
import { TableSkeletonRows } from "@/components/ui/TableSkeletonRows";

export function BackupManager() {
  const tz = useUserTimeZone();
  const toast = useToast();
  const backupsQuery = useBackupsQuery();
  const createBackup = useTriggerBackupMutation();
  const downloadLink = useBackupDownloadLinkMutation();
  const { rows: backups, sortProps } = useTableSort({
    rows: backupsQuery.data ?? [],
    accessors: {
      date: (b) => b.date,
      filename: (b) => b.filename,
      size: (b) => b.size,
      type: (b) => b.type
    }
  });
  const isLoading = backupsQuery.isLoading;
  const isCreating = createBackup.isPending;

  const handleCreateBackup = async () => {
    try {
      const data = await createBackup.mutateAsync();
      toast.success({ message: data.message || "The backup is stored.", title: "Backup created" });
    } catch (error) {
      toast.error({ message: getErrorMessage(error), title: "Couldn't create the backup" });
    }
  };

  const handleDownload = async (key: string) => {
    try {
      const { url } = await downloadLink.mutateAsync(key);
      const a = document.createElement("a");
      a.href = url;
      a.download = key.split("/").pop() || "backup.sql.gz";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      toast.error({ message: getErrorMessage(error), title: "Couldn't get the download link" });
    }
  };

  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const latestBackup = backups.length > 0 ? backups[0] : null;

  return (
    <div className="overflow-hidden rounded-panel border border-app-border bg-app-surface shadow-card">
      <div className="flex flex-col justify-between gap-4 border-b border-app-border p-5 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-bold text-app-text">Off-server backups</h2>
          <p className="mt-1 text-sm text-app-muted">
            Stored in Oracle Object Storage.
          </p>
        </div>
        <Button onClick={handleCreateBackup} disabled={isCreating}>
          {isCreating ? (
            <Spinner aria-hidden="true" className="size-4" />
          ) : (
            <HardDriveDownload aria-hidden="true" className="size-4" strokeWidth={2.5} />
          )}
          Create backup
        </Button>
      </div>

      <div className="flex items-center gap-4 border-b border-app-border bg-app-soft/50 p-4">
        <div className="flex-1">
          <p className="mb-1 text-xs font-semibold text-app-muted">Latest backup</p>
          {isLoading ? (
            <Skeleton className="h-6 w-48" />
          ) : backupsQuery.isError ? (
            <div className="flex flex-wrap items-center gap-3 text-sm text-app-muted">
              {getErrorMessage(backupsQuery.error)}
              <Button size="sm" variant="outline" onClick={() => void backupsQuery.refetch()}>
                Try again
              </Button>
            </div>
          ) : latestBackup ? (
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="success">
                <CheckCircle2 aria-hidden="true" className="size-3.5" />
                Stored
              </Badge>
              <span className="text-sm font-medium text-app-text">
                {formatDateTime(latestBackup.date, tz)}
              </span>
              <span className="text-sm text-app-muted border-l border-app-border pl-3">
                {formatSize(latestBackup.size)} ({latestBackup.type})
              </span>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-sm font-medium text-warning-ink">
              <AlertTriangle aria-hidden="true" className="size-4" />
              No database backups found in OCI Object Storage.
            </p>
          )}
        </div>
      </div>

      <div className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-left pl-5"><SortButton label="Filename" {...sortProps("filename")} /></TableHead>
              <TableHead><SortButton label="Type" {...sortProps("type")} /></TableHead>
              <TableHead><SortButton label="Size" {...sortProps("size")} /></TableHead>
              <TableHead><SortButton label="Date" {...sortProps("date")} /></TableHead>
              <TableHead className="text-right pr-5">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeletonRows columns={5} label="Loading backups…" rows={3} />
            ) : backups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-app-muted">
                  {backupsQuery.isError ? "The backup list couldn't be loaded." : "No database backups found."}
                </TableCell>
              </TableRow>
            ) : (
              backups.map((backup) => (
                <TableRow key={backup.key}>
                  <TableCell className="text-left pl-5 font-medium text-app-text truncate max-w-[200px] sm:max-w-xs" title={backup.filename}>
                    {backup.filename}
                  </TableCell>
                  <TableCell>
                    <Badge variant={backup.type === "Automatic" ? "default" : "secondary"}>
                      {backup.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-app-muted">{formatSize(backup.size)}</TableCell>
                  <TableCell className="text-app-muted">
                    {formatDateTime(backup.date, tz)}
                  </TableCell>
                  <TableCell className="text-right pr-5">
                    <div className="flex justify-end gap-2">
                      <SimpleTooltip label="Download">
                        <Button
                          variant="neutral"
                          size="icon"
                          aria-label="Download backup"
                          className="size-8"
                          onClick={() => handleDownload(backup.key)}
                        >
                          <Download className="size-4" strokeWidth={2.5} />
                        </Button>
                      </SimpleTooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

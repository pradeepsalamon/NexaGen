"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle2, Download, HardDriveDownload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
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

export interface BackupItem {
  key: string;
  filename: string;
  type: "Automatic" | "Manual";
  size: number;
  date: string;
}

export function BackupManager() {
  const tz = useUserTimeZone();
  const [backupItems, setBackups] = useState<BackupItem[]>([]);
  const { rows: backups, sortProps } = useTableSort({
    rows: backupItems,
    accessors: {
      date: (b) => b.date,
      filename: (b) => b.filename,
      size: (b) => b.size,
      type: (b) => b.type
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const fetchBackups = async () => {
    setIsLoading(true);
    try {
      const data = await apiFetch<BackupItem[]>("/admin/backups");
      setBackups(data);
    } catch (error) {
      toast.error("Failed to load backups");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleCreateBackup = async () => {
    setIsCreating(true);
    try {
      const data = await apiFetch<{ message: string; key?: string }>("/admin/backups/trigger", {
        method: "POST",
      });
      toast.success(data.message || "Backup created successfully!");
      fetchBackups();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create backup.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDownload = async (key: string) => {
    try {
      const { url } = await apiFetch<{ url: string }>(`/admin/backups/download?key=${encodeURIComponent(key)}`);
      // Trigger download
      const a = document.createElement("a");
      a.href = url;
      a.download = key.split("/").pop() || "backup.sql.gz";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      toast.error("Failed to generate download link.");
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
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
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
              <TableRow>
                <TableCell colSpan={5} className="h-24">
                  <div className="flex items-center justify-center text-app-muted gap-2">
                    <Loader2 className="size-5 animate-spin" />
                    Loading backups…
                  </div>
                </TableCell>
              </TableRow>
            ) : backups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-app-muted">
                  No database backups found.
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

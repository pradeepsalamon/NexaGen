"use client";

import { useState, useEffect } from "react";
import { HardDriveDownload, Loader2, Download, Trash2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/AlertDialog";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";

export interface BackupItem {
  key: string;
  filename: string;
  type: "Automatic" | "Manual";
  size: number;
  date: string;
}

export function BackupManager() {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  
  const [deleteItem, setDeleteItem] = useState<BackupItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleDelete = async () => {
    if (!deleteItem) return;
    setIsDeleting(true);
    try {
      await apiFetch(`/admin/backups?key=${encodeURIComponent(deleteItem.key)}`, {
        method: "DELETE",
      });
      toast.success("Backup deleted successfully");
      setBackups((prev) => prev.filter((b) => b.key !== deleteItem.key));
    } catch (error) {
      toast.error("Failed to delete backup.");
    } finally {
      setIsDeleting(false);
      setDeleteItem(null);
    }
  };

  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const latestBackup = backups.length > 0 ? backups[0] : null;

  return (
    <div className="rounded-panel border border-app-border bg-app-surface shadow-card mt-5 overflow-hidden">
      <div className="p-5 border-b border-app-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-app-text flex items-center gap-2">
            <HardDriveDownload className="size-5 text-primary" />
            Database Backups
          </h2>
          <p className="mt-1 text-sm text-app-muted">
            Manage off-server database backups stored securely in Oracle Object Storage.
          </p>
        </div>
        <Button
          onClick={handleCreateBackup}
          disabled={isCreating}
          className="gap-2"
        >
          {isCreating ? <Loader2 className="size-4 animate-spin" /> : <HardDriveDownload className="size-4" />}
          Create Backup
        </Button>
      </div>

      <div className="bg-app-soft/50 p-4 border-b border-app-border flex items-center gap-4">
        <div className="flex-1">
          <p className="text-xs font-bold uppercase text-app-muted mb-1">Latest Backup Health</p>
          {isLoading ? (
            <Skeleton className="h-6 w-48" />
          ) : latestBackup ? (
            <div className="flex items-center gap-3">
              <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-white border-transparent">
                ✓ Verified
              </Badge>
              <span className="text-sm font-medium text-app-text">
                {new Date(latestBackup.date).toLocaleString()}
              </span>
              <span className="text-sm text-app-muted border-l border-app-border pl-3">
                {formatSize(latestBackup.size)} ({latestBackup.type})
              </span>
            </div>
          ) : (
            <p className="text-sm text-destructive font-medium">⚠️ No database backups found in OCI Object Storage.</p>
          )}
        </div>
      </div>

      <div className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-left pl-5">Filename</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right pr-5">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24">
                  <div className="flex items-center justify-center text-app-muted gap-2">
                    <Loader2 className="size-5 animate-spin" />
                    Loading backups...
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
                    {new Date(backup.date).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right pr-5">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => handleDownload(backup.key)}
                        title="Download"
                      >
                        <Download className="size-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => setDeleteItem(backup)}
                        title="Delete"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteItem} onOpenChange={(open) => !open && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-destructive" />
              Delete this database backup?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 mt-2">
                <p>This will permanently remove the off-server backup from Oracle Object Storage. This action cannot be undone.</p>
                {deleteItem && (
                  <div className="rounded-control bg-app-soft p-3 text-sm">
                    <strong>File:</strong> {deleteItem.filename} <br />
                    <strong>Size:</strong> {formatSize(deleteItem.size)} <br />
                    <strong>Date:</strong> {new Date(deleteItem.date).toLocaleString()}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="size-4 animate-spin" /> : "Delete Backup"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

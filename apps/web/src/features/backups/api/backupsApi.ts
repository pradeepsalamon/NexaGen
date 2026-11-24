import {
  API_ROUTES,
  type BackupDownloadResponse,
  type DatabaseBackup,
  type TriggerBackupResponse
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export function listBackups(): Promise<DatabaseBackup[]> {
  return apiFetch<DatabaseBackup[]>(API_ROUTES.adminBackups.list);
}

export function triggerBackup(): Promise<TriggerBackupResponse> {
  return apiFetch<TriggerBackupResponse>(API_ROUTES.adminBackups.trigger, { method: "POST" });
}

export function getBackupDownloadLink(key: string): Promise<BackupDownloadResponse> {
  return apiFetch<BackupDownloadResponse>(API_ROUTES.adminBackups.download, { params: { key } });
}

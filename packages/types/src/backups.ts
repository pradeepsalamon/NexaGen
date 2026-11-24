/**
 * Database backups in object storage (`API_ROUTES.adminBackups`, platform
 * operators only). Dates are ISO strings in UTC.
 */
export type DatabaseBackup = {
  date: string;
  filename: string;
  /** Object key; the download and delete routes take it as `?key=`. */
  key: string;
  /** Bytes. */
  size: number;
  type: "Automatic" | "Manual";
};

export type TriggerBackupResponse = { key?: string; message: string };

/** A short-lived signed link to the dump. */
export type BackupDownloadResponse = { url: string };

export type DeleteBackupResponse = { message: string };

import { Injectable, Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Tables whose rows are re-loadable source data, not NexaChess-owned records:
 * the Lichess puzzle catalogue (~6M rows) and its transient load staging table.
 * Their definitions are still dumped; only the rows are skipped. A restored
 * database names the release to reload in `lichess_catalogue_releases`, which
 * IS backed up (docs/DATABASE_RESTORE.md § "Lichess puzzle catalogue"). Keep in
 * step with `scripts/backup_db.sh`.
 */
const EXCLUDED_TABLE_DATA = ['lichess_puzzles', 'lichess_puzzles_staging'];
const PG_DUMP_EXCLUDE_ARGS = EXCLUDED_TABLE_DATA.map(
  (table) => `--exclude-table-data=${table}`,
).join(' ');

export interface BackupItem {
  key: string;
  filename: string;
  type: 'Automatic' | 'Manual';
  size: number;
  date: Date;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private s3Client!: S3Client;
  
  private get ociConfig() {
    return {
      region: process.env.OCI_REGION,
      namespace: process.env.OCI_NAMESPACE,
      bucketName: process.env.OCI_BUCKET_NAME,
      accessKeyId: process.env.OCI_ACCESS_KEY_ID,
      secretAccessKey: process.env.OCI_SECRET_ACCESS_KEY,
    };
  }

  constructor() {
    const config = this.ociConfig;
    if (config.region && config.namespace && config.accessKeyId && config.secretAccessKey) {
      const endpoint = `https://${config.namespace}.compat.objectstorage.${config.region}.oci.customer-oci.com`;
      this.s3Client = new S3Client({
        region: config.region,
        endpoint,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
        forcePathStyle: true,
      });
    }
  }

  private validateConfig() {
    const config = this.ociConfig;
    if (!config.region || !config.namespace || !config.bucketName || !config.accessKeyId || !config.secretAccessKey) {
      throw new BadRequestException('OCI Object Storage configuration is missing in environment variables.');
    }
    if (!this.s3Client) {
      throw new InternalServerErrorException('S3 Client was not initialized properly.');
    }
    return config.bucketName;
  }

  async listBackups(): Promise<BackupItem[]> {
    const bucketName = this.validateConfig();
    try {
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: 'database/',
      });
      const response = await this.s3Client.send(command);
      
      const backups: BackupItem[] = (response.Contents || [])
        .filter(obj => typeof obj.Key === 'string' && obj.Key.endsWith('.sql.gz'))
        .map(obj => {
          const key = obj.Key as string;
          const isAuto = key.includes('/automatic/');
          return {
            key,
            filename: path.basename(key),
            type: isAuto ? 'Automatic' : 'Manual',
            size: obj.Size || 0,
            date: obj.LastModified || new Date(),
          };
        });

      return backups.sort((a, b) => b.date.getTime() - a.date.getTime());
    } catch (error) {
      this.logger.error('Failed to list backups:', error);
      throw new InternalServerErrorException('Failed to retrieve backup list from OCI.');
    }
  }

  /**
   * Object keys arrive from query params and from `LiveSession.recordingUrl`.
   * Without this an operator could sign or delete *any* object
   * in the bucket. See AUDIT.md C6.
   */
  private assertAllowedKey(key: string, allowedPrefixes: string[]) {
    const isSafe =
      typeof key === 'string' &&
      key.length > 0 &&
      !key.includes('..') &&
      !key.startsWith('/') &&
      allowedPrefixes.some((prefix) => key.startsWith(prefix));

    if (!isSafe) {
      throw new BadRequestException('Invalid object key.');
    }
  }

  async getDownloadUrl(key: string): Promise<{ url: string }> {
    const bucketName = this.validateConfig();
    // Also reached via LiveClassService.downloadRecording.
    this.assertAllowedKey(key, ['database/', 'recordings/']);
    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });
      const url = await getSignedUrl(this.s3Client, command, { expiresIn: 900 });
      return { url };
    } catch (error) {
      this.logger.error('Failed to generate download URL:', error);
      throw new InternalServerErrorException('Failed to generate secure download link.');
    }
  }

  async deleteBackup(key: string): Promise<{ message: string }> {
    const bucketName = this.validateConfig();
    this.assertAllowedKey(key, ['database/']);
    try {
      const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      });
      await this.s3Client.send(command);
      this.logger.log(`Deleted backup object: ${key}`);
      return { message: 'Backup successfully deleted.' };
    } catch (error) {
      this.logger.error(`Failed to delete backup ${key}:`, error);
      throw new InternalServerErrorException('Failed to delete backup from OCI.');
    }
  }

  async triggerBackup(): Promise<{ message: string; key?: string }> {
    const bucketName = this.validateConfig();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `nexa-db-${timestamp}.sql.gz`;
    const backupFilePath = path.join('/tmp', backupFileName);
    const objectKey = `database/manual/${backupFileName}`;

    try {
      this.logger.log(`Starting manual database dump to ${backupFilePath}...`);
      
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) {
         throw new Error('DATABASE_URL is not set.');
      }
      
      // pg_dump (libpq) rejects Prisma-specific query params like ?schema=public
      // So we strip all query parameters before passing it to pg_dump
      const cleanDbUrl = new URL(dbUrl.split('?')[0]);
      // The password goes in PGPASSWORD, not the command line: a failed exec's
      // error message echoes the command into the logs, and `ps` shows it too.
      const password = decodeURIComponent(cleanDbUrl.password);
      cleanDbUrl.password = '';

      // Use bash with pipefail so if pg_dump fails, the entire command fails
      const pgDumpCommand = `/bin/bash -c "set -o pipefail; pg_dump ${PG_DUMP_EXCLUDE_ARGS} \\"${cleanDbUrl.toString()}\\" | gzip > ${backupFilePath}"`;

      await execAsync(pgDumpCommand, { env: { ...process.env, PGPASSWORD: password } });
      this.logger.log('Database dump completed. Uploading to OCI Object Storage...');

      // Use readFileSync (Buffer) instead of createReadStream.
      // OCI S3 Compatibility API rejects aws-chunked transfer encoding which AWS SDK
      // automatically uses for streams. Passing a Buffer provides an exact Content-Length.
      const fileBuffer = fs.readFileSync(backupFilePath);

      const uploadCommand = new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        Body: fileBuffer,
        ContentType: 'application/gzip',
      });

      await this.s3Client.send(uploadCommand);

      // Verify the object exists in OCI
      const verifyCommand = new HeadObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      });
      await this.s3Client.send(verifyCommand);

      this.logger.log(`Backup uploaded and verified successfully in OCI. Key: ${objectKey}`);

      return {
        message: 'Backup created, uploaded, and verified successfully.',
        key: objectKey,
      };
    } catch (error) {
      this.logger.error('Backup process failed:', error);
      throw new InternalServerErrorException('Backup failed. Ensure pg_dump is installed and OCI credentials are correct.');
    } finally {
      if (fs.existsSync(backupFilePath)) {
        fs.unlinkSync(backupFilePath);
      }
    }
  }
}

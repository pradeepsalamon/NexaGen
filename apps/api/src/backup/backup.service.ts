import { Injectable, Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
   * Without this an operator could sign, delete, or restore from *any* object
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
      const cleanDbUrl = dbUrl.split('?')[0];
      
      // Use bash with pipefail so if pg_dump fails, the entire command fails
      const pgDumpCommand = `/bin/bash -c "set -o pipefail; pg_dump \\"${cleanDbUrl}\\" | gzip > ${backupFilePath}"`;
      
      await execAsync(pgDumpCommand);
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

  async restoreBackup(key: string): Promise<{ message: string }> {
    const bucketName = this.validateConfig();
    this.assertAllowedKey(key, ['database/']);

    const downloadPath = path.join('/tmp', `restore-${Date.now()}.sql.gz`);
    const safetyDumpPath = path.join('/tmp', `pre-restore-${Date.now()}.sql.gz`);

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new BadRequestException('DATABASE_URL is not set.');
    }
    // pg_dump/psql (libpq) reject Prisma-specific query params like ?schema=public
    const cleanDbUrl = dbUrl.split('?')[0];

    let schemaWasDropped = false;
    let restoreSucceeded = false;

    try {
      this.logger.log(`Downloading backup ${key} for restoration...`);
      const getCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });
      const response = await this.s3Client.send(getCommand);

      // Save stream to file
      const bodyStream = response.Body as NodeJS.ReadableStream;
      await new Promise<void>((resolve, reject) => {
        const writeStream = fs.createWriteStream(downloadPath);
        bodyStream.pipe(writeStream);
        writeStream.on('error', reject);
        writeStream.on('finish', resolve);
      });

      // Verify the archive is readable BEFORE destroying the live schema.
      // Previously a corrupt download left the database empty. See AUDIT.md C6.
      this.logger.log('Verifying downloaded archive integrity...');
      await execAsync(`/bin/bash -c "gunzip -t ${downloadPath}"`);

      if (fs.statSync(downloadPath).size === 0) {
        throw new Error('Downloaded backup is empty.');
      }

      // Take a local safety dump so an operator can roll back a bad restore.
      this.logger.log(`Taking pre-restore safety dump to ${safetyDumpPath}...`);
      await execAsync(
        `/bin/bash -c "set -o pipefail; pg_dump \\"${cleanDbUrl}\\" | gzip > ${safetyDumpPath}"`
      );

      this.logger.log(`Restoring database from ${downloadPath}...`);

      // Drop and recreate the public schema for a clean slate. This prevents
      // "relation already exists" and "duplicate key" conflicts.
      const wipeCommand = `/bin/bash -c "set -o pipefail; psql \\"${cleanDbUrl}\\" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'"`;
      await execAsync(wipeCommand);
      schemaWasDropped = true;

      // Pipe the unzipped sql file into PostgreSQL
      const restoreCommand = `/bin/bash -c "set -o pipefail; gunzip -c ${downloadPath} | psql \\"${cleanDbUrl}\\" -v ON_ERROR_STOP=1"`;
      await execAsync(restoreCommand);

      restoreSucceeded = true;
      this.logger.log(`Database successfully restored from ${key}.`);
      return { message: 'Database successfully restored from backup.' };
    } catch (error) {
      this.logger.error('Restore process failed:', error);

      // The schema is already gone — try to put the previous state back.
      if (schemaWasDropped && fs.existsSync(safetyDumpPath)) {
        this.logger.warn('Restore failed after wipe — rolling back to the pre-restore dump...');
        try {
          await execAsync(
            `/bin/bash -c "set -o pipefail; psql \\"${cleanDbUrl}\\" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'"`
          );
          await execAsync(
            `/bin/bash -c "set -o pipefail; gunzip -c ${safetyDumpPath} | psql \\"${cleanDbUrl}\\" -v ON_ERROR_STOP=1"`
          );
          this.logger.log('Rollback to the pre-restore state succeeded.');
          throw new InternalServerErrorException(
            'Database restore failed. The previous state was rolled back successfully.'
          );
        } catch (rollbackError) {
          if (rollbackError instanceof InternalServerErrorException) {
            throw rollbackError;
          }
          this.logger.error('ROLLBACK FAILED — database may be empty:', rollbackError);
          throw new InternalServerErrorException(
            `Database restore failed AND rollback failed. A safety dump was written to ${safetyDumpPath} on the API host — restore it manually before restarting.`
          );
        }
      }

      throw new InternalServerErrorException(
        'Database restore failed. The database was not modified.'
      );
    } finally {
      if (fs.existsSync(downloadPath)) {
        fs.unlinkSync(downloadPath);
      }
      // Keep the safety dump when anything went wrong after the wipe — it is
      // the only rollback artifact. Clean it up otherwise.
      const keepSafetyDump = schemaWasDropped && !restoreSucceeded;
      if (!keepSafetyDump && fs.existsSync(safetyDumpPath)) {
        fs.unlinkSync(safetyDumpPath);
      }
    }
  }
}

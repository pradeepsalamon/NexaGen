import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config/api";
import { PrismaService } from "../prisma/prisma.service";
import * as fs from "fs";
import * as path from "path";
import type { Request, Response } from "express";

@Injectable()
export class RecordingStorageService {
  private readonly logger = new Logger(RecordingStorageService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the absolute path of the recordings directory on disk.
   */
  getStorageDirectory(): string {
    const env = getApiEnv();
    const storageDir = env.RECORDING_STORAGE_DIR || "/recordings";
    return path.resolve(storageDir);
  }

  /**
   * Returns the maximum allowed storage limit in bytes.
   */
  getStorageLimitBytes(): number {
    const env = getApiEnv();
    const limitGb = env.RECORDING_STORAGE_LIMIT_GB || 130;
    return limitGb * 1024 * 1024 * 1024;
  }

  /**
   * Resolves a recording filename or relative key safely within the storage directory,
   * preventing path traversal attacks.
   */
  resolveFilePath(filenameOrKey: string): string {
    if (!filenameOrKey || typeof filenameOrKey !== "string") {
      throw new BadRequestException("Invalid recording filename.");
    }

    // Strip leading slashes, "recordings/" or "recordings\" prefix if present
    const cleanKey = filenameOrKey
      .replace(/^([/\\]?recordings[/\\])/, "")
      .replace(/^[/\\]+/, "");

    const storageDir = this.getStorageDirectory();
    const resolvedPath = path.resolve(storageDir, cleanKey);

    if (!resolvedPath.startsWith(storageDir)) {
      throw new BadRequestException("Access denied: invalid recording file path.");
    }

    return resolvedPath;
  }

  /**
   * Checks if a recording file exists on local storage.
   */
  hasLocalFile(filenameOrKey: string | null | undefined): boolean {
    if (!filenameOrKey) return false;
    try {
      const filePath = this.resolveFilePath(filenameOrKey);
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  /**
   * Calculates the total bytes consumed by files in the recordings directory.
   */
  async getStorageUsageBytes(): Promise<number> {
    const storageDir = this.getStorageDirectory();
    try {
      if (!fs.existsSync(storageDir)) {
        await fs.promises.mkdir(storageDir, { recursive: true });
        return 0;
      }

      let totalBytes = 0;
      const files = await fs.promises.readdir(storageDir, { withFileTypes: true });

      for (const file of files) {
        if (file.isFile()) {
          const filePath = path.join(storageDir, file.name);
          const stat = await fs.promises.stat(filePath);
          totalBytes += stat.size;
        }
      }

      return totalBytes;
    } catch (error) {
      this.logger.error("Failed to calculate recording storage usage", error);
      return 0;
    }
  }

  /**
   * Returns human-readable storage statistics.
   */
  async getStorageUsage() {
    const usedBytes = await this.getStorageUsageBytes();
    const limitBytes = this.getStorageLimitBytes();
    const usedGb = Number((usedBytes / (1024 * 1024 * 1024)).toFixed(2));
    const limitGb = Number((limitBytes / (1024 * 1024 * 1024)).toFixed(2));
    const usagePercent = limitBytes > 0 ? Number(((usedBytes / limitBytes) * 100).toFixed(1)) : 0;

    return {
      usedBytes,
      limitBytes,
      usedGb,
      limitGb,
      usagePercent,
    };
  }

  /**
   * Ensures that the storage directory has sufficient capacity before starting a recording.
   * If space is nearing the quota, automatically prunes the oldest recordings (FIFO).
   */
  async ensureStorageCapacity(estimatedBytesNeeded = 1024 * 1024 * 1024): Promise<void> {
    const limitBytes = this.getStorageLimitBytes();
    const usedBytes = await this.getStorageUsageBytes();

    if (usedBytes + estimatedBytesNeeded > limitBytes) {
      const bytesToFree = usedBytes + estimatedBytesNeeded - limitBytes + 2 * 1024 * 1024 * 1024; // 2GB safety margin
      this.logger.warn(
        `Recording storage quota limit reached (${(usedBytes / 1024 ** 3).toFixed(2)} GB / ${(limitBytes / 1024 ** 3).toFixed(2)} GB). Triggering auto-pruning to free ${(bytesToFree / 1024 ** 3).toFixed(2)} GB.`
      );
      await this.pruneOldestRecordings(bytesToFree);
    }
  }

  /**
   * Prunes the oldest recorded sessions from disk and marks them as pruned in the database.
   */
  async pruneOldestRecordings(targetBytesToFree: number): Promise<number> {
    let freedBytes = 0;

    try {
      const oldSessions = await this.prisma.liveSession.findMany({
        where: {
          recordingUrl: { not: null },
        },
        orderBy: {
          createdAt: "asc",
        },
        take: 50,
      });

      for (const session of oldSessions) {
        if (freedBytes >= targetBytesToFree) break;
        if (!session.recordingUrl) continue;

        try {
          const filePath = this.resolveFilePath(session.recordingUrl);
          if (fs.existsSync(filePath)) {
            const stat = await fs.promises.stat(filePath);
            await fs.promises.unlink(filePath);
            freedBytes += stat.size;
            this.logger.log(`Pruned old recording file: ${filePath} (${(stat.size / 1024 ** 2).toFixed(2)} MB)`);
          }

          const existingMetadata = (session.metadata as Record<string, any>) || {};
          await this.prisma.liveSession.update({
            where: { id: session.id },
            data: {
              recordingUrl: null,
              metadata: {
                ...existingMetadata,
                recordingStatus: "PURGED_STORAGE_LIMIT",
                purgedAt: new Date().toISOString(),
              },
            },
          });
        } catch (fileError) {
          this.logger.error(`Error pruning recording for session ${session.id}:`, fileError);
        }
      }

      this.logger.log(`Storage auto-pruning complete. Freed ${(freedBytes / 1024 ** 3).toFixed(2)} GB.`);
      return freedBytes;
    } catch (error) {
      this.logger.error("Failed to prune old recordings", error);
      return freedBytes;
    }
  }

  /**
   * Streams an MP4 video file directly to the client with HTTP Range (206 Partial Content) support,
   * enabling seamless playback and scrubbing in browsers.
   */
  async streamVideoFile(filenameOrKey: string, req: Request, res: Response): Promise<void> {
    const filePath = this.resolveFilePath(filenameOrKey);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException("Recording video file not found on disk.");
    }

    const stat = await fs.promises.stat(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (isNaN(start) || start >= fileSize || (parts[1] && end >= fileSize) || start > end) {
        res.writeHead(416, {
          "Content-Range": `bytes */${fileSize}`,
        });
        res.end();
        return;
      }

      const chunkSize = end - start + 1;
      const stream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": "video/mp4",
      });

      stream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
      });

      fs.createReadStream(filePath).pipe(res);
    }
  }
}

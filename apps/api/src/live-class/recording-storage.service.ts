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

const BYTES_PER_GB = 1024 ** 3;
const BYTES_PER_MB = 1024 ** 2;

@Injectable()
export class RecordingStorageService {
  private readonly logger = new Logger(RecordingStorageService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the absolute path of the recordings directory on disk.
   */
  getStorageDirectory(): string {
    const env = getApiEnv();
    return path.resolve(env.RECORDING_STORAGE_DIR || "/recordings");
  }

  /**
   * Returns the maximum allowed storage limit in bytes.
   */
  getStorageLimitBytes(): number {
    const env = getApiEnv();
    const limitGb = env.RECORDING_STORAGE_LIMIT_GB || 130;
    return limitGb * BYTES_PER_GB;
  }

  /**
   * Recordings newer than this are never auto-pruned, even under disk pressure.
   */
  getMinRetentionMs(): number {
    const env = getApiEnv();
    return (env.RECORDING_MIN_RETENTION_DAYS ?? 14) * 24 * 60 * 60 * 1000;
  }

  /**
   * Resolves a recording filename or relative key to an absolute path that is
   * guaranteed to sit inside the storage directory. Rejects path traversal.
   */
  resolveFilePath(filenameOrKey: string): string {
    if (!filenameOrKey || typeof filenameOrKey !== "string") {
      throw new BadRequestException("Invalid recording filename.");
    }

    // Strip a leading slash and an optional "recordings/" (or "recordings\") prefix.
    const cleanKey = filenameOrKey
      .replace(/^([/\\]?recordings[/\\])/, "")
      .replace(/^[/\\]+/, "");

    const storageDir = this.getStorageDirectory();
    const resolvedPath = path.resolve(storageDir, cleanKey);

    // `path.relative` escaping the base yields a "../"-prefixed or absolute path.
    // A plain `startsWith` check would wrongly accept a sibling like
    // "/recordings-other/x".
    const rel = path.relative(storageDir, resolvedPath);
    if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
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
      return fs.existsSync(this.resolveFilePath(filenameOrKey));
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
      const entries = await fs.promises.readdir(storageDir, { withFileTypes: true });
      let totalBytes = 0;
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        try {
          const stat = await fs.promises.stat(path.join(storageDir, entry.name));
          totalBytes += stat.size;
        } catch {
          // File vanished between readdir and stat — ignore.
        }
      }
      return totalBytes;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
      this.logger.error("Failed to calculate recording storage usage", error as Error);
      return 0;
    }
  }

  /**
   * Returns storage statistics for the admin dashboard.
   */
  async getStorageUsage() {
    const usedBytes = await this.getStorageUsageBytes();
    const limitBytes = this.getStorageLimitBytes();

    return {
      usedBytes,
      limitBytes,
      usedGb: Number((usedBytes / BYTES_PER_GB).toFixed(2)),
      limitGb: Number((limitBytes / BYTES_PER_GB).toFixed(2)),
      usagePercent:
        limitBytes > 0 ? Number(((usedBytes / limitBytes) * 100).toFixed(1)) : 0,
    };
  }

  /**
   * Ensures the storage directory has capacity before a recording starts. Under
   * pressure it prunes the oldest recordings that are past the minimum retention
   * window (FIFO). Recordings inside the retention window are never deleted — if
   * that leaves us over quota, we log an error for an admin rather than destroy
   * recent recordings.
   */
  async ensureStorageCapacity(estimatedBytesNeeded = BYTES_PER_GB): Promise<void> {
    const limitBytes = this.getStorageLimitBytes();
    const usedBytes = await this.getStorageUsageBytes();

    if (usedBytes + estimatedBytesNeeded <= limitBytes) return;

    const bytesToFree =
      usedBytes + estimatedBytesNeeded - limitBytes + 2 * BYTES_PER_GB; // 2GB headroom
    this.logger.warn(
      `Recording storage near quota (${(usedBytes / BYTES_PER_GB).toFixed(2)}/${(
        limitBytes / BYTES_PER_GB
      ).toFixed(2)} GB). Auto-pruning to free ${(bytesToFree / BYTES_PER_GB).toFixed(
        2
      )} GB.`
    );

    const freed = await this.pruneOldestRecordings(bytesToFree);

    if (freed < bytesToFree) {
      this.logger.error(
        `Recording storage still over quota after pruning (freed ${(
          freed / BYTES_PER_GB
        ).toFixed(2)}/${(bytesToFree / BYTES_PER_GB).toFixed(
          2
        )} GB). All remaining recordings are within the ${
          this.getMinRetentionMs() / 86_400_000
        }-day retention window. Increase RECORDING_STORAGE_LIMIT_GB, add disk, or archive recordings.`
      );
    }
  }

  /**
   * Deletes the oldest recordings past the retention window from disk and marks
   * them purged in the database. Returns the number of bytes freed.
   */
  async pruneOldestRecordings(targetBytesToFree: number): Promise<number> {
    let freedBytes = 0;
    const cutoff = new Date(Date.now() - this.getMinRetentionMs());

    try {
      const oldSessions = await this.prisma.liveSession.findMany({
        where: {
          recordingUrl: { not: null },
          createdAt: { lt: cutoff },
        },
        orderBy: { createdAt: "asc" },
        take: 50,
      });

      for (const session of oldSessions) {
        if (freedBytes >= targetBytesToFree) break;
        if (!session.recordingUrl) continue;

        try {
          const filePath = this.resolveFilePath(session.recordingUrl);
          try {
            const stat = await fs.promises.stat(filePath);
            await fs.promises.unlink(filePath);
            freedBytes += stat.size;
            this.logger.log(
              `Pruned recording ${filePath} (${(stat.size / BYTES_PER_MB).toFixed(2)} MB)`
            );
          } catch (statErr) {
            if ((statErr as NodeJS.ErrnoException).code !== "ENOENT") throw statErr;
          }

          const existingMetadata =
            (session.metadata as Record<string, unknown>) || {};
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
          this.logger.error(
            `Error pruning recording for session ${session.id}`,
            fileError as Error
          );
        }
      }

      this.logger.log(
        `Auto-pruning complete. Freed ${(freedBytes / BYTES_PER_GB).toFixed(2)} GB.`
      );
      return freedBytes;
    } catch (error) {
      this.logger.error("Failed to prune old recordings", error as Error);
      return freedBytes;
    }
  }

  /**
   * Streams an MP4 file to the client with HTTP Range (206 Partial Content)
   * support so browsers can seek. Handles client aborts and read errors without
   * leaking file descriptors.
   */
  async streamVideoFile(
    filenameOrKey: string,
    req: Request,
    res: Response,
    opts: { attachment?: boolean } = {}
  ): Promise<void> {
    const filePath = this.resolveFilePath(filenameOrKey);

    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new NotFoundException("Recording video file not found on disk.");
      }
      throw error;
    }

    const fileSize = stat.size;
    const parsed = this.parseRange(req.headers.range, fileSize);

    if (parsed === "invalid") {
      res.writeHead(416, { "Content-Range": `bytes */${fileSize}` });
      res.end();
      return;
    }

    const { start, end } = parsed ?? { start: 0, end: fileSize - 1 };
    const stream = fs.createReadStream(filePath, { start, end });

    // Tear the stream down if the client disconnects mid-download (common while
    // scrubbing a video) so we don't hold the fd open.
    const cleanup = () => stream.destroy();
    res.on("close", cleanup);

    stream.on("error", (error) => {
      this.logger.error(`Recording stream error for ${filePath}`, error);
      res.destroy(error);
    });

    res.writeHead(parsed ? 206 : 200, {
      "Content-Type": "video/mp4",
      "Content-Length": end - start + 1,
      "Accept-Ranges": "bytes",
      ...(parsed ? { "Content-Range": `bytes ${start}-${end}/${fileSize}` } : {}),
      ...(opts.attachment
        ? {
            "Content-Disposition": `attachment; filename="${path
              .basename(filePath)
              .replace(/"/g, "")}"`,
          }
        : {}),
    });

    stream.pipe(res);
  }

  /**
   * Parses a single-range `Range` header. Returns:
   * - `null`   → no (or unsupported multi-)range, send the whole file
   * - `"invalid"` → unsatisfiable, caller should reply 416
   * - `{ start, end }` → inclusive byte range
   */
  private parseRange(
    header: string | undefined,
    fileSize: number
  ): { start: number; end: number } | null | "invalid" {
    if (!header || !header.startsWith("bytes=")) return null;

    const spec = header.slice("bytes=".length);
    if (spec.includes(",")) return null; // multi-range unsupported

    const [rawStart, rawEnd] = spec.split("-");
    let start: number;
    let end: number;

    if (rawStart === "") {
      // Suffix range: "bytes=-500" → last 500 bytes.
      const suffix = parseInt(rawEnd, 10);
      if (isNaN(suffix) || suffix <= 0) return "invalid";
      start = Math.max(fileSize - suffix, 0);
      end = fileSize - 1;
    } else {
      start = parseInt(rawStart, 10);
      end = rawEnd === "" ? fileSize - 1 : parseInt(rawEnd, 10);
      if (isNaN(start) || isNaN(end)) return "invalid";
      end = Math.min(end, fileSize - 1);
    }

    if (start > end || start >= fileSize || start < 0) return "invalid";
    return { start, end };
  }
}

import { ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { JwtService } from "@nestjs/jwt";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { UserRole } from "@prisma/client";
import type { Response } from "express";
import streamifier from "streamifier";
import { authenticateUser } from "../auth/authenticate";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { tenantStorageRoot } from "../tenancy/tenant-paths";
import { WhatsAppMediaTooLargeError, WhatsAppService } from "../whatsapp/whatsapp.service";

/** The largest file kept (WhatsApp allows images up to 5 MB; a PDF can be bigger). */
export const SUPPORT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const MAX_ATTEMPTS = 3;
/** Meta keeps a media id downloadable for a limited time; after a day we stop trying. */
const RETRY_WINDOW_MS = 24 * 60 * 60_000;
const CLAIM_LEASE_MS = 2 * 60_000;
const SWEEP_BATCH = 20;

export type SupportFileKind = "image" | "pdf";

/** What the file really is, from its first bytes; null = not a kept kind (the declared type is never trusted). */
export function sniffSupportFile(data: Buffer): { kind: SupportFileKind; extension: string; contentType: string } | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg", kind: "image" };
  }
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { contentType: "image/png", extension: "png", kind: "image" };
  }
  if (data.length >= 12 && data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP") {
    return { contentType: "image/webp", extension: "webp", kind: "image" };
  }
  if (data.length >= 5 && data.subarray(0, 5).toString("latin1") === "%PDF-") {
    return { contentType: "application/pdf", extension: "pdf", kind: "pdf" };
  }
  return null;
}

/** The kind a declared mime type stands for, before download (for the transcript). */
export function supportFileKindOf(mimeType: string | null): SupportFileKind | null {
  if (!mimeType) return null;
  if (mimeType === "application/pdf") return "pdf";
  return ["image/jpeg", "image/png", "image/webp"].includes(mimeType) ? "image" : null;
}

function storageConfigured(): boolean {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

/**
 * Images and PDFs customers send on WhatsApp (docs/WHATSAPP_SUPPORT.md §0,
 * plan D13). Fetched once from Meta with the academy's token, checked by their
 * bytes, stored privately (Cloudinary `authenticated`, raw), and streamed only
 * to the academy's admins. The bot never reads them.
 */
@Injectable()
export class SupportAttachmentsService {
  private readonly logger = new Logger(SupportAttachmentsService.name);

  constructor(
    private readonly jobLocks: JobLockService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService
  ) {}

  /** Fetches and stores one attachment. Call inside its academy. Never throws. */
  async store(id: string): Promise<void> {
    const now = new Date();
    const claim = await this.prisma.supportAttachment.updateMany({
      data: { attempts: { increment: 1 }, claimedAt: now },
      where: {
        attempts: { lt: MAX_ATTEMPTS },
        id,
        OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(now.getTime() - CLAIM_LEASE_MS) } }],
        status: "PENDING"
      }
    });
    if (claim.count === 0) return;
    const row = await this.prisma.supportAttachment.findUnique({ where: { id } });
    if (!row) return;

    const fail = (error: string, final: boolean) =>
      this.prisma.supportAttachment.update({
        data: { claimedAt: null, error: error.slice(0, 300), ...(final ? { status: "FAILED" } : {}) },
        where: { id }
      });
    if (!storageConfigured()) {
      await fail("File storage isn't set up on this server.", true);
      return;
    }
    try {
      const { data } = await this.whatsapp.downloadMedia(row.mediaId, SUPPORT_ATTACHMENT_MAX_BYTES);
      const file = sniffSupportFile(data);
      if (!file) {
        await fail("Not an image or PDF, so it wasn't kept.", true);
        return;
      }
      const stored = await this.upload(`${tenantStorageRoot()}/support/${row.id}`, data, file.extension);
      await this.prisma.supportAttachment.update({
        data: { bytes: stored.bytes ?? data.byteLength, claimedAt: null, error: null, mimeType: file.contentType, status: "STORED", storageKey: stored.public_id },
        where: { id }
      });
    } catch (error) {
      const tooLarge = error instanceof WhatsAppMediaTooLargeError;
      const message = tooLarge ? `${(error as Error).message} Files up to 10 MB are kept.` : (error as Error).message;
      this.logger.warn(`Support attachment ${id} not stored (attempt ${row.attempts}): ${message}`);
      await fail(message, tooLarge || row.attempts >= MAX_ATTEMPTS).catch(() => undefined);
    }
  }

  /** Retries, and deletes the stored files of attachments whose message is gone (retention, erasure). */
  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    await this.jobLocks.runForEachTenant(JOB_LOCKS.supportAttachments, async () => {
      const now = Date.now();
      const due = await this.prisma.supportAttachment.findMany({
        select: { id: true },
        take: SWEEP_BATCH,
        where: { attempts: { lt: MAX_ATTEMPTS }, createdAt: { gt: new Date(now - RETRY_WINDOW_MS) }, messageId: { not: null }, status: "PENDING" }
      });
      for (const row of due) await this.store(row.id);
      // Gave up on: past the retry window without a file.
      await this.prisma.supportAttachment.updateMany({
        data: { error: "WhatsApp's copy of the file expired before it could be kept.", status: "FAILED" },
        where: { createdAt: { lte: new Date(now - RETRY_WINDOW_MS) }, status: "PENDING" }
      });
      await this.removeOrphans();
    });
  }

  /** Stored files whose message was deleted: remove the file, then the row. */
  async removeOrphans(): Promise<number> {
    const orphans = await this.prisma.supportAttachment.findMany({ select: { id: true, storageKey: true }, take: SWEEP_BATCH, where: { messageId: null } });
    let removed = 0;
    for (const orphan of orphans) {
      if (orphan.storageKey) {
        if (!storageConfigured()) continue;
        try {
          await cloudinary.uploader.destroy(orphan.storageKey, { resource_type: "raw", type: "authenticated" });
        } catch (error) {
          this.logger.warn(`Stored support file ${orphan.id} not deleted yet: ${(error as Error).message}`);
          continue;
        }
      }
      await this.prisma.supportAttachment.delete({ where: { id: orphan.id } });
      removed += 1;
    }
    return removed;
  }

  /** Streams a stored file to an admin of its academy, never revealing a storage URL. */
  async stream(accessToken: string | undefined, id: string, res: Response): Promise<void> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only admins can open files sent to the support inbox.");
    }
    const row = await this.prisma.supportAttachment.findFirst({ where: { id, messageId: { not: null } } });
    if (!row?.storageKey || row.status !== "STORED") throw new NotFoundException("File not found.");
    const extension = row.mimeType === "application/pdf" ? "pdf" : (row.mimeType ?? "image/jpeg").split("/")[1];
    const url = cloudinary.utils.private_download_url(row.storageKey, extension === "jpeg" ? "jpg" : extension, {
      expires_at: Math.floor(Date.now() / 1000) + 60,
      resource_type: "raw",
      type: "authenticated"
    });
    const file = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!file.ok) throw new NotFoundException("File not found.");
    const data = Buffer.from(await file.arrayBuffer());
    // Re-checked on the way out: only ever served as the image or PDF it really is.
    const sniffed = sniffSupportFile(data);
    if (!sniffed) throw new NotFoundException("File not found.");
    const name = (row.filename ?? `whatsapp-file.${sniffed.extension}`).replace(/[^\w.\- ]+/g, "_").slice(0, 120);
    res.setHeader("Content-Type", sniffed.contentType);
    res.setHeader("Content-Disposition", `${sniffed.kind === "pdf" ? "attachment" : "inline"}; filename="${name}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(data);
  }

  private upload(key: string, data: Buffer, extension: string): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { format: extension, overwrite: true, public_id: key, resource_type: "raw", type: "authenticated" },
        (error, uploaded) => (error || !uploaded ? reject(new Error(error?.message ?? "Upload failed.")) : resolve(uploaded))
      );
      streamifier.createReadStream(data).pipe(stream);
    });
  }
}

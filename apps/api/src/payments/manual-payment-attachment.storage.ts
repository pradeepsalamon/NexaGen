import { Injectable, Logger } from "@nestjs/common";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import streamifier from "streamifier";

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf"
};

/**
 * Private storage for a manual payment's proof-of-payment attachment (a
 * screenshot or a PDF receipt). Same shape as `InvoiceStorageService`
 * (`type: "authenticated"`, `resource_type: "raw"` — a financial document has
 * no permanently-public URL), except the bytes come from a browser upload
 * instead of a server-generated PDF, so there is no fallback render-on-demand:
 * a failed upload just means the record has no attachment.
 */
@Injectable()
export class ManualPaymentAttachmentStorage {
  private readonly logger = new Logger(ManualPaymentAttachmentStorage.name);

  isConfigured(): boolean {
    return Boolean(
      process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
    );
  }

  async upload(
    recordId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number }
  ): Promise<{
    key: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  } | null> {
    if (!this.isConfigured()) {
      this.logger.warn(
        "Cloudinary is not configured — the manual payment attachment was not stored."
      );
      return null;
    }

    const extension = EXTENSION_BY_MIME_TYPE[file.mimetype];
    if (!extension) {
      this.logger.warn(`Unsupported attachment mime type: ${file.mimetype}`);
      return null;
    }

    const key = `nexa_chess/manual_payments/${recordId}`;

    try {
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            public_id: key,
            resource_type: "raw",
            type: "authenticated",
            overwrite: true,
            invalidate: true,
            format: extension
          },
          (error, uploaded) => {
            if (error || !uploaded) {
              return reject(
                error instanceof Error
                  ? error
                  : new Error(error?.message ?? "Cloudinary upload failed.")
              );
            }
            resolve(uploaded);
          }
        );

        streamifier.createReadStream(file.buffer).pipe(stream);
      });

      return {
        key: result.public_id,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: result.bytes ?? file.size
      };
    } catch (error) {
      this.logger.warn(
        `Manual payment attachment upload failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }

  private signedUrl(
    key: string,
    format: string,
    ttlSeconds: number
  ): string | null {
    if (!this.isConfigured()) return null;

    return cloudinary.utils.private_download_url(key, format, {
      resource_type: "raw",
      type: "authenticated",
      expires_at: Math.floor(Date.now() / 1000) + ttlSeconds
    });
  }

  /** Reads a stored attachment back so the API can stream it to an authorized caller. */
  async download(key: string, mimeType: string): Promise<Buffer | null> {
    const extension = EXTENSION_BY_MIME_TYPE[mimeType] ?? "bin";
    const url = this.signedUrl(key, extension, 60);
    if (!url) return null;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) {
        this.logger.warn(
          `Manual payment attachment ${key} fetch returned ${response.status}.`
        );
        return null;
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      this.logger.warn(
        `Manual payment attachment ${key} could not be fetched: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }
}

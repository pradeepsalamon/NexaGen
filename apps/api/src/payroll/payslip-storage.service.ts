import { Injectable, Logger } from "@nestjs/common";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import streamifier from "streamifier";

/**
 * Private storage for payslip PDFs (§33) — same shape as
 * `payments/invoice-storage.service.ts`: `type: "authenticated"` (no
 * permanently-public URL for a financial document) and `resource_type:
 * "raw"` (a PDF is a file, not an image). Optional like the rest of the
 * storage-backed features — with credentials unset, downloads render on
 * demand instead of streaming an archived copy.
 */
@Injectable()
export class PayslipStorageService {
  private readonly logger = new Logger(PayslipStorageService.name);
  private configuredLogged = false;

  isConfigured(): boolean {
    return Boolean(
      process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
    );
  }

  /** `nexa_chess/payslips/2026/09/NEXA-PAY-2026-000001` (§33). */
  buildKey(documentNumber: string, issuedAt: Date): string {
    const year = issuedAt.getUTCFullYear();
    const month = String(issuedAt.getUTCMonth() + 1).padStart(2, "0");
    return `nexa_chess/payslips/${year}/${month}/${sanitize(documentNumber)}`;
  }

  async upload(
    key: string,
    pdf: Buffer
  ): Promise<{ storageKey: string; bytes: number; url: string | null }> {
    if (!this.isConfigured()) {
      throw new Error("Cloudinary is not configured for payslip storage.");
    }

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: key,
          resource_type: "raw",
          type: "authenticated",
          overwrite: true,
          invalidate: true,
          format: "pdf"
        },
        (error, uploaded) => {
          if (error || !uploaded) {
            return reject(
              error instanceof Error ? error : new Error(error?.message ?? "Cloudinary upload failed.")
            );
          }
          resolve(uploaded);
        }
      );
      streamifier.createReadStream(pdf).pipe(stream);
    });

    return {
      storageKey: result.public_id,
      bytes: result.bytes ?? pdf.byteLength,
      url: result.secure_url ?? null
    };
  }

  signedUrl(storageKey: string, ttlSeconds = 15 * 60): string | null {
    if (!this.isConfigured()) return null;
    return cloudinary.utils.private_download_url(storageKey, "pdf", {
      resource_type: "raw",
      type: "authenticated",
      expires_at: Math.floor(Date.now() / 1000) + ttlSeconds
    });
  }

  async download(storageKey: string): Promise<Buffer | null> {
    const url = this.signedUrl(storageKey, 60);
    if (!url) return null;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(`Payslip PDF ${storageKey} fetch returned ${response.status}.`);
        return null;
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      this.logger.warn(
        `Payslip PDF ${storageKey} could not be fetched: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }

  warnIfUnconfigured(): void {
    if (this.isConfigured() || this.configuredLogged) return;
    this.configuredLogged = true;
    this.logger.warn(
      "Cloudinary is not configured — payslip PDFs will be rendered on demand and not archived."
    );
  }
}

function sanitize(value: string): string {
  return value.replace(/[^\w.-]/g, "_");
}

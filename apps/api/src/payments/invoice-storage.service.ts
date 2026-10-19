import { Injectable, Logger } from "@nestjs/common";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import streamifier from "streamifier";

/**
 * Private storage for invoice PDFs (§13).
 *
 * Cloudinary, reusing the account the rest of the app already uploads to, but
 * with two deliberate differences from `UploadService`:
 *
 *  - `type: "authenticated"` — the asset has no permanently-public URL. A
 *    financial document must not be reachable by guessing a delivery path.
 *  - `resource_type: "raw"` — a PDF is a file, not an image, so Cloudinary
 *    never tries to transform it.
 *
 * Storage is OPTIONAL, in the same way queues and WhatsApp are. With the
 * credentials unset, `isConfigured()` is false, nothing is uploaded, and the
 * download route falls back to rendering on demand — so local dev and a
 * credential-less box still serve invoices.
 */
@Injectable()
export class InvoiceStorageService {
  private readonly logger = new Logger(InvoiceStorageService.name);
  private configuredLogged = false;

  isConfigured(): boolean {
    return Boolean(
      process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
    );
  }

  /**
   * `invoices/2026/09/NEXA-INV-2026-000001` — the §13 layout. Cloudinary adds
   * the extension itself for raw assets, so the key carries none.
   */
  buildKey(documentNumber: string, issuedAt: Date, folder = "invoices"): string {
    const year = issuedAt.getUTCFullYear();
    const month = String(issuedAt.getUTCMonth() + 1).padStart(2, "0");
    return `nexa_chess/${folder}/${year}/${month}/${sanitize(documentNumber)}`;
  }

  /**
   * Stores the PDF and returns its storage key. Overwrites deliberately: a
   * retried render of the same invoice replaces the file rather than
   * accumulating copies, and the content is derived from frozen columns so the
   * bytes are equivalent anyway.
   */
  async upload(
    key: string,
    pdf: Buffer
  ): Promise<{ storageKey: string; bytes: number; url: string | null }> {
    if (!this.isConfigured()) {
      throw new Error("Cloudinary is not configured for invoice storage.");
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
              error instanceof Error
                ? error
                : new Error(error?.message ?? "Cloudinary upload failed.")
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
      // Recorded for support only. It is an authenticated delivery URL and is
      // never handed to a browser unsigned.
      url: result.secure_url ?? null
    };
  }

  /**
   * A short-lived signed URL, for an email link where streaming through the API
   * is not possible. Expires by default in 15 minutes — long enough to click,
   * short enough that a forwarded email stops working.
   */
  signedUrl(storageKey: string, ttlSeconds = 15 * 60): string | null {
    if (!this.isConfigured()) return null;

    return cloudinary.utils.private_download_url(storageKey, "pdf", {
      resource_type: "raw",
      type: "authenticated",
      expires_at: Math.floor(Date.now() / 1000) + ttlSeconds
    });
  }

  /**
   * Reads a stored PDF back so the API can stream it to an authorized caller
   * without ever revealing a storage URL. Returns null when the object is
   * missing, which the caller treats as "re-render it".
   */
  async download(storageKey: string): Promise<Buffer | null> {
    const url = this.signedUrl(storageKey, 60);
    if (!url) return null;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) {
        this.logger.warn(
          `Invoice PDF ${storageKey} fetch returned ${response.status}.`
        );
        return null;
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      this.logger.warn(
        `Invoice PDF ${storageKey} could not be fetched: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }

  /**
   * Only ever used to clear a half-written object before a retry. An issued
   * invoice's PDF is otherwise never deleted.
   */
  async remove(storageKey: string): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      await cloudinary.uploader.destroy(storageKey, {
        resource_type: "raw",
        type: "authenticated"
      });
    } catch (error) {
      this.logger.warn(
        `Failed to remove invoice PDF ${storageKey}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /** Logged once at first use so an unconfigured box is obvious in the logs. */
  warnIfUnconfigured(): void {
    if (this.isConfigured() || this.configuredLogged) return;
    this.configuredLogged = true;
    this.logger.warn(
      "Cloudinary is not configured — invoice PDFs will be rendered on demand and not archived."
    );
  }
}

/** Cloudinary public_ids allow a limited character set; keep it boring. */
function sanitize(value: string): string {
  return value.replace(/[^\w.-]/g, "_");
}

import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException
} from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config/api";
import {
  buildMediaUrl,
  buildMessagesUrl,
  isWhatsAppConfigured
} from "./whatsapp.config";
import type {
  WhatsAppApiSuccess,
  WhatsAppDocumentMessage,
  WhatsAppFailure,
  WhatsAppMediaUploadResult,
  WhatsAppSendOutcome,
  WhatsAppSendResult,
  WhatsAppTemplateMessage,
  WhatsAppTextMessage
} from "./whatsapp.types";
import {
  WHATSAPP_TEXT_BODY_LIMIT,
  buildDocumentPayload,
  buildTemplatePayload,
  buildTextPayload,
  describeWhatsAppFailure,
  normalizeWhatsAppNumber,
  parseSendFailure,
  parseSendResult
} from "./whatsapp.utils";

/** Thrown by the throwing send methods; carries the provider's own diagnosis. */
export class WhatsAppSendError extends Error {
  constructor(readonly failure: WhatsAppFailure) {
    super(failure.message);
    this.name = "WhatsAppSendError";
  }

  get retryable() {
    return this.failure.retryable;
  }
}

/**
 * Sends messages through the WhatsApp Cloud API. One network attempt per call —
 * retries belong to the caller (a BullMQ job, `DEFAULT_JOB_OPTIONS`), so a
 * request never blocks on provider backoff.
 */
@Injectable()
export class WhatsAppService {
  private readonly env = getApiEnv();
  private readonly logger = new Logger(WhatsAppService.name);

  /** False when credentials are unset — check before offering WhatsApp in a UI. */
  isConfigured(): boolean {
    return isWhatsAppConfigured(this.env);
  }

  /** Free-form text. Only deliverable inside the 24h customer-service window. */
  async sendText(message: WhatsAppTextMessage): Promise<WhatsAppSendResult> {
    const body = message.body?.trim();
    if (!body) {
      throw new BadRequestException("WhatsApp message body is empty.");
    }
    if (body.length > WHATSAPP_TEXT_BODY_LIMIT) {
      throw new BadRequestException(
        `WhatsApp message body exceeds ${WHATSAPP_TEXT_BODY_LIMIT} characters.`
      );
    }

    const to = this.resolveRecipient(message.to);
    return this.send(buildTextPayload({ ...message, body }, to), to);
  }

  /** Pre-approved template. The only thing deliverable outside the 24h window. */
  async sendTemplate(message: WhatsAppTemplateMessage): Promise<WhatsAppSendResult> {
    if (!message.name?.trim()) {
      throw new BadRequestException("WhatsApp template name is required.");
    }

    const to = this.resolveRecipient(message.to);
    return this.send(buildTemplatePayload(message, to), to);
  }

  /** Best-effort text send for paths that must not fail because WhatsApp did. */
  async trySendText(message: WhatsAppTextMessage): Promise<WhatsAppSendOutcome> {
    return this.attempt(() => this.sendText(message));
  }

  /** Best-effort template send. See {@link trySendText}. */
  async trySendTemplate(message: WhatsAppTemplateMessage): Promise<WhatsAppSendOutcome> {
    return this.attempt(() => this.sendTemplate(message));
  }

  /**
   * Sends a document (a PDF invoice, say) as a free-form message.
   *
   * Like {@link sendText}, this only lands inside the 24h customer-service
   * window. Outside it, attach the document to an approved template instead —
   * {@link sendTemplate} with `headerDocument`.
   */
  async sendDocument(
    message: WhatsAppDocumentMessage
  ): Promise<WhatsAppSendResult> {
    if (!message.mediaId && !message.link) {
      throw new BadRequestException(
        "A WhatsApp document needs either an uploaded mediaId or a link."
      );
    }

    const to = this.resolveRecipient(message.to);
    return this.send(buildDocumentPayload(message, to), to);
  }

  /** Best-effort document send. See {@link trySendText}. */
  async trySendDocument(
    message: WhatsAppDocumentMessage
  ): Promise<WhatsAppSendOutcome> {
    return this.attempt(() => this.sendDocument(message));
  }

  /**
   * Uploads a file to Meta and returns the handle to send it by.
   *
   * Preferred over passing a `link`: Meta keeps the bytes for 30 days, so
   * nothing has to expose a fetchable URL for a financial document, and the
   * send cannot fail because a short-lived signed URL expired between queueing
   * and delivery.
   *
   * One network attempt, like every other call here — retries belong to the
   * caller's job.
   */
  async uploadMedia(
    file: Buffer,
    filename: string,
    contentType = "application/pdf"
  ): Promise<WhatsAppMediaUploadResult> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException("WhatsApp is not configured.");
    }

    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", contentType);
    form.append(
      "file",
      new Blob([new Uint8Array(file)], { type: contentType }),
      filename
    );

    let response: Response;
    try {
      response = await fetch(buildMediaUrl(this.env), {
        method: "POST",
        // No Content-Type header: fetch sets the multipart boundary itself.
        headers: { Authorization: `Bearer ${this.env.WHATSAPP_ACCESS_TOKEN}` },
        body: form,
        signal: AbortSignal.timeout(this.env.WHATSAPP_TIMEOUT_MS)
      });
    } catch (error) {
      throw this.fail(parseSendFailure(0, null), (error as Error).message);
    }

    const body = await this.readJson(response);
    if (!response.ok) {
      throw this.fail(parseSendFailure(response.status, body));
    }

    const mediaId = (body as { id?: string } | null)?.id;
    if (!mediaId) {
      throw this.fail({
        message: "WhatsApp media upload returned no id.",
        status: response.status,
        retryable: false
      });
    }

    return { mediaId };
  }

  /** Best-effort upload for paths that must survive WhatsApp being down. */
  async tryUploadMedia(
    file: Buffer,
    filename: string,
    contentType = "application/pdf"
  ): Promise<{ ok: true; mediaId: string } | { ok: false; error: WhatsAppFailure }> {
    try {
      const { mediaId } = await this.uploadMedia(file, filename, contentType);
      return { ok: true, mediaId };
    } catch (error) {
      if (error instanceof WhatsAppSendError) {
        return { ok: false, error: error.failure };
      }
      return {
        ok: false,
        error: { message: (error as Error).message, status: 0, retryable: false }
      };
    }
  }

  /** Fan out one text to many recipients; one bad number never sinks the rest. */
  async sendTextToMany(
    recipients: string[],
    body: string,
    options: { previewUrl?: boolean } = {}
  ): Promise<Record<string, WhatsAppSendOutcome>> {
    const unique = [...new Set(recipients.filter(Boolean))];
    const outcomes = await Promise.all(
      unique.map((to) => this.trySendText({ to, body, previewUrl: options.previewUrl }))
    );

    return Object.fromEntries(unique.map((to, index) => [to, outcomes[index]]));
  }

  /** Normalize a raw phone number the way a send would, without sending. */
  normalizeRecipient(raw: string | null | undefined): string | null {
    return normalizeWhatsAppNumber(raw, this.env.WHATSAPP_DEFAULT_COUNTRY_CODE);
  }

  private resolveRecipient(raw: string): string {
    const normalized = this.normalizeRecipient(raw);
    if (!normalized) {
      throw new BadRequestException("Invalid WhatsApp phone number.");
    }
    return normalized;
  }

  private async send(
    payload: Record<string, unknown>,
    to: string
  ): Promise<WhatsAppSendResult> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException("WhatsApp is not configured.");
    }

    let response: Response;
    try {
      response = await fetch(buildMessagesUrl(this.env), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.env.WHATSAPP_TIMEOUT_MS)
      });
    } catch (error) {
      throw this.fail(parseSendFailure(0, null), (error as Error).message);
    }

    const body = await this.readJson(response);

    if (!response.ok) {
      throw this.fail(parseSendFailure(response.status, body));
    }

    try {
      return parseSendResult(body as WhatsAppApiSuccess, to);
    } catch (error) {
      throw this.fail({
        message: (error as Error).message,
        status: response.status,
        retryable: false
      });
    }
  }

  private async attempt(
    send: () => Promise<WhatsAppSendResult>
  ): Promise<WhatsAppSendOutcome> {
    try {
      return { ok: true, result: await send() };
    } catch (error) {
      if (error instanceof WhatsAppSendError) {
        return { ok: false, error: error.failure };
      }
      return {
        ok: false,
        error: {
          message: (error as Error).message,
          status: 0,
          retryable: false
        }
      };
    }
  }

  private fail(failure: WhatsAppFailure, cause?: string) {
    const described = describeWhatsAppFailure(failure);
    this.logger.warn(
      `WhatsApp send failed: ${cause ? `${described} ${cause}` : described}`
    );
    return new WhatsAppSendError(failure);
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
}

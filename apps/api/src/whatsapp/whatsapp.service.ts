import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException
} from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config/api";
import { buildMessagesUrl, isWhatsAppConfigured } from "./whatsapp.config";
import type {
  WhatsAppApiSuccess,
  WhatsAppFailure,
  WhatsAppSendOutcome,
  WhatsAppSendResult,
  WhatsAppTemplateMessage,
  WhatsAppTextMessage
} from "./whatsapp.types";
import {
  WHATSAPP_TEXT_BODY_LIMIT,
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

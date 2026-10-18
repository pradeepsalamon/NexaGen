import type {
  WhatsAppApiErrorBody,
  WhatsAppApiSuccess,
  WhatsAppDocumentMessage,
  WhatsAppFailure,
  WhatsAppSendResult,
  WhatsAppTemplateComponent,
  WhatsAppTextMessage,
  WhatsAppTemplateMessage
} from "./whatsapp.types";

/** Hard limit the Cloud API enforces on a free-form text body. */
export const WHATSAPP_TEXT_BODY_LIMIT = 4096;

const MIN_DIGITS = 8;
const MAX_DIGITS = 15; // E.164
/** At or below this, an un-prefixed number is national and needs a country code. */
const NATIONAL_MAX_DIGITS = 10;

/** Meta codes that mean "try again later" rather than "this will never work". */
const RETRYABLE_ERROR_CODES = new Set([
  4, // application request limit reached
  80007, // rate limit
  130429, // messaging rate limit hit
  131048, // spam rate limit
  131056, // pair rate limit
  133016 // service temporarily unavailable
]);

/**
 * To E.164 digits with no "+", which is the only form the Cloud API accepts.
 * Returns null when the input can't be resolved to a routable number.
 */
export function normalizeWhatsAppNumber(
  raw: string | null | undefined,
  defaultCountryCode?: string
): string | null {
  if (!raw) return null;

  const cleaned = raw.trim().replace(/[^\d+]/g, "");
  if (!cleaned) return null;

  const countryCode = defaultCountryCode?.replace(/\D/g, "") || undefined;
  let digits = cleaned.replace(/\D/g, "");
  if (!digits) return null;

  if (!cleaned.startsWith("+")) {
    if (digits.startsWith("00")) {
      digits = digits.slice(2);
    } else if (digits.startsWith("0")) {
      const national = digits.replace(/^0+/, "");
      if (!countryCode || !national) return null;
      digits = `${countryCode}${national}`;
    } else if (digits.length <= NATIONAL_MAX_DIGITS) {
      if (!countryCode) return null;
      digits = `${countryCode}${digits}`;
    }
  }

  return isValidWhatsAppNumber(digits) ? digits : null;
}

export function isValidWhatsAppNumber(digits: string): boolean {
  return (
    /^[1-9][0-9]*$/.test(digits) &&
    digits.length >= MIN_DIGITS &&
    digits.length <= MAX_DIGITS
  );
}

export function buildTextPayload(message: WhatsAppTextMessage, to: string) {
  return {
    messaging_product: "whatsapp" as const,
    recipient_type: "individual" as const,
    to,
    type: "text" as const,
    text: {
      body: message.body,
      preview_url: message.previewUrl ?? false
    }
  };
}

export function buildDocumentPayload(
  message: WhatsAppDocumentMessage,
  to: string
) {
  return {
    messaging_product: "whatsapp" as const,
    recipient_type: "individual" as const,
    to,
    type: "document" as const,
    document: {
      ...(message.mediaId ? { id: message.mediaId } : { link: message.link }),
      ...(message.filename ? { filename: message.filename } : {}),
      ...(message.caption ? { caption: message.caption } : {})
    }
  };
}

export function buildTemplatePayload(message: WhatsAppTemplateMessage, to: string) {
  const components = message.components ?? buildTemplateComponents(message);

  return {
    messaging_product: "whatsapp" as const,
    recipient_type: "individual" as const,
    to,
    type: "template" as const,
    template: {
      name: message.name,
      language: { code: message.language ?? "en_US" },
      ...(components.length > 0 ? { components } : {})
    }
  };
}

function buildTemplateComponents(
  message: WhatsAppTemplateMessage
): WhatsAppTemplateComponent[] {
  const components: WhatsAppTemplateComponent[] = [];

  // A document header and a text header are mutually exclusive in Meta's
  // schema — a template is approved with one or the other.
  if (message.headerDocument) {
    components.push({
      type: "header",
      parameters: [
        {
          type: "document",
          document: {
            ...(message.headerDocument.mediaId
              ? { id: message.headerDocument.mediaId }
              : { link: message.headerDocument.link }),
            ...(message.headerDocument.filename
              ? { filename: message.headerDocument.filename }
              : {})
          }
        }
      ]
    });
  } else if (message.headerParams?.length) {
    components.push({ type: "header", parameters: toTextParameters(message.headerParams) });
  }
  if (message.bodyParams?.length) {
    components.push({ type: "body", parameters: toTextParameters(message.bodyParams) });
  }

  return components;
}

function toTextParameters(values: string[]) {
  return values.map((value) => ({ type: "text" as const, text: String(value) }));
}

/** Pull the message id out of a success envelope. Throws if the shape is unexpected. */
export function parseSendResult(body: WhatsAppApiSuccess, to: string): WhatsAppSendResult {
  const messageId = body.messages?.[0]?.id;
  if (!messageId) {
    throw new Error("WhatsApp API returned no message id.");
  }

  return { messageId, to, waId: body.contacts?.[0]?.wa_id };
}

/** Normalize any failure (HTTP error body, network error, timeout) into one shape. */
export function parseSendFailure(status: number, body: unknown): WhatsAppFailure {
  const error = (body as WhatsAppApiErrorBody | null)?.error;
  const details = error?.error_data?.details;
  const message =
    [error?.message, details].filter(Boolean).join(" — ") ||
    (status === 0 ? "WhatsApp API is unreachable." : `WhatsApp API responded ${status}.`);

  return {
    message,
    status,
    code: error?.code,
    subcode: error?.error_subcode,
    traceId: error?.fbtrace_id,
    retryable: isRetryableWhatsAppFailure(status, error?.code)
  };
}

export function isRetryableWhatsAppFailure(status: number, code?: number): boolean {
  if (status === 0 || status === 408 || status === 429 || status >= 500) return true;
  return code !== undefined && RETRYABLE_ERROR_CODES.has(code);
}

/** Log-safe one-liner — never includes the message body or the access token. */
export function describeWhatsAppFailure(failure: WhatsAppFailure): string {
  const parts = [`status=${failure.status}`];
  if (failure.code !== undefined) parts.push(`code=${failure.code}`);
  if (failure.subcode !== undefined) parts.push(`subcode=${failure.subcode}`);
  if (failure.traceId) parts.push(`fbtrace=${failure.traceId}`);
  return `${failure.message} (${parts.join(" ")})`;
}

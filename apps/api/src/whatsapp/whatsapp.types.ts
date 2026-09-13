/** Shapes for the WhatsApp Cloud API (Meta Graph API) send endpoint. */

export type WhatsAppComponentType = "header" | "body" | "button";

export interface WhatsAppTextParameter {
  type: "text";
  text: string;
}

export interface WhatsAppTemplateComponent {
  type: WhatsAppComponentType;
  sub_type?: "quick_reply" | "url";
  index?: string;
  parameters: WhatsAppTextParameter[];
}

/** A free-form text message — only deliverable inside the 24h customer service window. */
export interface WhatsAppTextMessage {
  to: string;
  body: string;
  /** Render a link preview for the first URL in `body`. */
  previewUrl?: boolean;
}

/** A pre-approved template — the only thing deliverable outside the 24h window. */
export interface WhatsAppTemplateMessage {
  to: string;
  /** Template name exactly as approved in WhatsApp Manager. */
  name: string;
  /** Template language code, e.g. "en_US". */
  language?: string;
  /** Ordered {{1}}, {{2}}… substitutions for the template body. */
  bodyParams?: string[];
  /** Ordered substitutions for a text header. */
  headerParams?: string[];
  /** Escape hatch: replaces the generated components entirely. */
  components?: WhatsAppTemplateComponent[];
}

export interface WhatsAppSendResult {
  /** Provider message id ("wamid.…"), the handle for delivery webhooks. */
  messageId: string;
  /** Number the message was actually addressed to, normalized. */
  to: string;
  /** Provider-resolved WhatsApp id, when returned. */
  waId?: string;
}

/** Outcome of a best-effort send that must never throw into a request path. */
export type WhatsAppSendOutcome =
  | { ok: true; result: WhatsAppSendResult }
  | { ok: false; error: WhatsAppFailure };

export interface WhatsAppFailure {
  message: string;
  /** HTTP status, or 0 for a network/timeout failure. */
  status: number;
  /** Meta error code, when the provider returned one. */
  code?: number;
  subcode?: number;
  /** Meta's fbtrace_id — quote it in a support ticket. */
  traceId?: string;
  /** Whether the same payload is worth sending again later. */
  retryable: boolean;
}

/** Raw success envelope returned by POST /{phoneNumberId}/messages. */
export interface WhatsAppApiSuccess {
  messaging_product: "whatsapp";
  contacts?: { input: string; wa_id: string }[];
  messages?: { id: string }[];
}

/** Raw error envelope returned by the Graph API. */
export interface WhatsAppApiErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
    error_data?: { details?: string };
  };
}

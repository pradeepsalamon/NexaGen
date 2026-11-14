/** Shapes for the WhatsApp Cloud API (Meta Graph API) send endpoint. */

export type WhatsAppComponentType = "header" | "body" | "button";

export interface WhatsAppTextParameter {
  type: "text";
  text: string;
}

/** A document header parameter — how a PDF rides on a template message. */
export interface WhatsAppDocumentParameter {
  type: "document";
  document: { id?: string; link?: string; filename?: string };
}

export type WhatsAppParameter =
  | WhatsAppTextParameter
  | WhatsAppDocumentParameter;

export interface WhatsAppTemplateComponent {
  type: WhatsAppComponentType;
  sub_type?: "quick_reply" | "url";
  index?: string;
  parameters: WhatsAppParameter[];
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
  /**
   * Attaches a PDF (or similar) as the template's header. The template must
   * have been approved in WhatsApp Manager with a DOCUMENT header, or Meta
   * rejects the send.
   */
  headerDocument?: WhatsAppDocumentRef;
  /** Escape hatch: replaces the generated components entirely. */
  components?: WhatsAppTemplateComponent[];
}

/**
 * How a document is addressed. `mediaId` is preferred — it is an upload Meta
 * already holds, so nothing has to expose a fetchable URL for a financial
 * document. `link` is the fallback, and Meta fetches it server-side at send
 * time, so it must still be reachable then.
 */
export interface WhatsAppDocumentRef {
  mediaId?: string;
  link?: string;
  /** Filename the recipient sees when they save it. */
  filename?: string;
}

/** A free-form document message — 24h window only, like a text. */
export interface WhatsAppDocumentMessage extends WhatsAppDocumentRef {
  to: string;
  /** Shown above the attachment in the chat. */
  caption?: string;
}

export interface WhatsAppMediaUploadResult {
  /** Meta's handle for the upload. Valid for 30 days. */
  mediaId: string;
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

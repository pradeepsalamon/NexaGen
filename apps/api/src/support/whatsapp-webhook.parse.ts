import { createHmac, timingSafeEqual } from "node:crypto";
import { redactSupportText } from "@nexa-chess/types";

/**
 * Meta's `X-Hub-Signature-256: sha256=<hex>` over the exact request bytes, keyed
 * by the app secret. Constant-time compare; any malformed header is a mismatch.
 */
export function verifyWhatsAppSignature(rawBody: string, header: string | string[] | undefined, appSecret: string): boolean {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value || !value.startsWith("sha256=") || !appSecret) return false;
  const given = Buffer.from(value.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** One incoming customer message, with only the fields the bot reads. Text is redacted. */
export interface ParsedWhatsAppMessage {
  kind: "message";
  dedupeKey: string;
  phoneNumberId: string;
  waId: string;
  wamid: string;
  messageType: string;
  /** Redacted text, or the tapped option's title. Null for media. */
  text: string | null;
  replyId: string | null;
  redacted: boolean;
  profileName: string | null;
  occurredAt: Date;
  /** An image or document (the only media kept, for staff): Meta's media id and what it says about it. */
  media: { id: string; mimeType: string | null; filename: string | null; caption: string | null } | null;
}

/** A delivery update for a message we sent. */
export interface ParsedWhatsAppStatus {
  kind: "status";
  dedupeKey: string;
  phoneNumberId: string;
  waId: string;
  wamid: string;
  status: string;
  error: string | null;
  occurredAt: Date;
}

export type ParsedWhatsAppEvent = ParsedWhatsAppMessage | ParsedWhatsAppStatus;

/** Longest text kept from one message (WhatsApp allows 4096). */
const MAX_TEXT = 4096;
const MAX_ID = 256;

type Json = Record<string, unknown>;

function obj(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function str(value: unknown, max = MAX_ID): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, max) : null;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function timestamp(value: unknown): Date {
  const seconds = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date();
}

function readMessage(message: Json): { messageType: string; text: string | null; replyId: string | null } {
  const messageType = str(message.type) ?? "unknown";
  if (messageType === "text") {
    return { messageType, replyId: null, text: str(obj(message.text)?.body, MAX_TEXT) };
  }
  if (messageType === "interactive") {
    const interactive = obj(message.interactive);
    const reply = obj(interactive?.button_reply) ?? obj(interactive?.list_reply);
    return { messageType, replyId: str(reply?.id), text: str(reply?.title, MAX_TEXT) };
  }
  if (messageType === "button") {
    // A quick-reply button on a template message.
    const button = obj(message.button);
    return { messageType, replyId: str(button?.payload), text: str(button?.text, MAX_TEXT) };
  }
  return { messageType, replyId: null, text: null };
}

/** Kept media: an image or a document (photos of receipts, PDFs). Voice, video and stickers aren't. */
function readMedia(message: Json): ParsedWhatsAppMessage["media"] {
  const type = str(message.type);
  if (type !== "image" && type !== "document") return null;
  const media = obj(message[type]);
  const id = str(media?.id);
  if (!id) return null;
  const caption = str(media?.caption, 1024);
  return {
    caption: caption ? redactSupportText(caption).text : null,
    filename: str(media?.filename, 200),
    id,
    mimeType: str(media?.mime_type, 100)
  };
}

/**
 * Flattens a webhook body into the events the bot acts on. Anything it doesn't
 * recognise (other fields, malformed entries) is skipped, never thrown on.
 */
export function parseWhatsAppWebhook(body: unknown): ParsedWhatsAppEvent[] {
  const events: ParsedWhatsAppEvent[] = [];
  const root = obj(body);
  if (!root || root.object !== "whatsapp_business_account") return events;

  for (const entry of arr(root.entry)) {
    for (const change of arr(obj(entry)?.changes)) {
      const changeObj = obj(change);
      if (changeObj?.field !== "messages") continue;
      const value = obj(changeObj.value);
      const phoneNumberId = str(obj(value?.metadata)?.phone_number_id);
      if (!value || !phoneNumberId) continue;

      const names = new Map<string, string>();
      for (const contact of arr(value.contacts)) {
        const waId = str(obj(contact)?.wa_id);
        const name = str(obj(obj(contact)?.profile)?.name, 120);
        if (waId && name) names.set(waId, name);
      }

      for (const raw of arr(value.messages)) {
        const message = obj(raw);
        const waId = str(message?.from, 20);
        const wamid = str(message?.id);
        if (!message || !waId || !wamid) continue;
        const read = readMessage(message);
        const redaction = read.text ? redactSupportText(read.text) : { redacted: false, text: null };
        events.push({
          dedupeKey: `msg:${wamid}`,
          kind: "message",
          media: readMedia(message),
          messageType: read.messageType,
          occurredAt: timestamp(message.timestamp),
          phoneNumberId,
          profileName: names.get(waId) ?? null,
          redacted: redaction.redacted,
          replyId: read.replyId,
          text: redaction.text,
          waId,
          wamid
        });
      }

      for (const raw of arr(value.statuses)) {
        const status = obj(raw);
        const wamid = str(status?.id);
        const state = str(status?.status, 20);
        const waId = str(status?.recipient_id, 20);
        if (!status || !wamid || !state || !waId) continue;
        const firstError = obj(arr(status.errors)[0]);
        const error = firstError
          ? [firstError.code, str(firstError.title, 200) ?? str(firstError.message, 200)].filter(Boolean).join(": ")
          : null;
        events.push({
          dedupeKey: `status:${wamid}:${state}`,
          error,
          kind: "status",
          occurredAt: timestamp(status.timestamp),
          phoneNumberId,
          status: state,
          waId,
          wamid
        });
      }
    }
  }
  return events;
}

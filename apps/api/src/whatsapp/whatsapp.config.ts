import type { ApiEnv } from "@nexa-chess/config/api";

export type WhatsAppEnv = Pick<
  ApiEnv,
  | "WHATSAPP_ACCESS_TOKEN"
  | "WHATSAPP_API_BASE_URL"
  | "WHATSAPP_API_VERSION"
  | "WHATSAPP_DEFAULT_COUNTRY_CODE"
  | "WHATSAPP_PHONE_NUMBER_ID"
  | "WHATSAPP_TIMEOUT_MS"
>;

/** WhatsApp is optional everywhere: unset credentials degrade, never break. */
export function isWhatsAppConfigured(env: WhatsAppEnv): boolean {
  return Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
}

/** Graph API send endpoint for the configured business phone number. */
export function buildMessagesUrl(env: WhatsAppEnv): string {
  if (!isWhatsAppConfigured(env)) {
    throw new Error(
      "WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required to send WhatsApp messages."
    );
  }

  const base = env.WHATSAPP_API_BASE_URL.replace(/\/+$/, "");
  return `${base}/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}

/** Graph API media-upload endpoint, for sending a PDF as a document. */
export function buildMediaUrl(env: WhatsAppEnv): string {
  if (!isWhatsAppConfigured(env)) {
    throw new Error(
      "WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required to upload WhatsApp media."
    );
  }

  const base = env.WHATSAPP_API_BASE_URL.replace(/\/+$/, "");
  return `${base}/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/media`;
}

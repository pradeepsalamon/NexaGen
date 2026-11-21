import { extractTemplateVariables, renderMessageTemplate, type MessageVariables } from "./messaging";

// Approved WhatsApp templates (docs/MESSAGING.md "WhatsApp templates"). Outside the 24h
// customer-service window WhatsApp delivers only a template approved in WhatsApp Manager;
// messaging rules and system messages can each name one. Its {{1}}, {{2}}… slots are filled,
// in order, from `params`: short texts that may use the message's own {{placeholders}}.

export const WHATSAPP_TEMPLATE_LIMITS = {
  /** Meta's own limits for a template's name and its body slots. */
  maxNameLength: 512,
  maxParamLength: 500,
  maxParams: 10
} as const;

/** Language used when a template names none (what Meta's API is sent today). */
export const DEFAULT_WHATSAPP_TEMPLATE_LANGUAGE = "en_US";

/** Meta template names: lower-case letters, digits and underscores. */
const NAME_PATTERN = /^[a-z0-9_]+$/;
/** "en", "en_US", "pt_BR", "fil" … */
const LANGUAGE_PATTERN = /^[a-z]{2,3}(_[A-Z]{2})?$/;

/** A template as it is saved: the name, its language and the values for its slots. */
export interface WhatsAppTemplateSettings {
  name: string | null;
  language: string | null;
  params: readonly string[];
}

/** A template ready to send: slot values rendered for one recipient. */
export interface ResolvedWhatsAppTemplate {
  name: string;
  language: string;
  bodyParams: string[];
}

/** The editor's "one value per line" text → the saved list (blank lines dropped). */
export function parseWhatsAppTemplateParams(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Trimmed, with empty strings as null, so "no template" has one shape. */
export function normalizeWhatsAppTemplate(settings: Partial<WhatsAppTemplateSettings>): WhatsAppTemplateSettings {
  const name = settings.name?.trim() || null;
  const language = settings.language?.trim() || null;
  const params = (settings.params ?? []).map((param) => param.trim()).filter(Boolean);
  return { language, name, params };
}

/**
 * What is wrong with a template before it is saved; empty means it can be saved. `variables`
 * are the placeholders the message can fill. Meta checks the template itself (that it exists,
 * is approved and has as many slots as values) only when a message is sent.
 */
export function whatsappTemplateIssues(
  settings: Partial<WhatsAppTemplateSettings>,
  variables: readonly string[]
): string[] {
  const { language, name, params } = normalizeWhatsAppTemplate(settings);
  const issues: string[] = [];

  if (!name) {
    if (language || params.length > 0) {
      issues.push("Add the template's name, or clear its language and values.");
    }
    return issues;
  }
  if (name.length > WHATSAPP_TEMPLATE_LIMITS.maxNameLength || !NAME_PATTERN.test(name)) {
    issues.push(
      "A template name is written exactly as in WhatsApp Manager: lower-case letters, digits and underscores (e.g. demo_booking_received)."
    );
  }
  if (language && !LANGUAGE_PATTERN.test(language)) {
    issues.push('A language code looks like "en" or "en_US".');
  }
  if (params.length > WHATSAPP_TEMPLATE_LIMITS.maxParams) {
    issues.push(`A template can take at most ${WHATSAPP_TEMPLATE_LIMITS.maxParams} values.`);
  }
  if (params.some((param) => param.length > WHATSAPP_TEMPLATE_LIMITS.maxParamLength)) {
    issues.push(`Each template value can be at most ${WHATSAPP_TEMPLATE_LIMITS.maxParamLength} characters.`);
  }
  const known = new Set(variables);
  const unknown = [...new Set(params.flatMap((param) => extractTemplateVariables(param)))].filter(
    (variable) => !known.has(variable)
  );
  if (unknown.length > 0) {
    issues.push(
      `This message can't fill ${unknown.map((variable) => `{{${variable}}}`).join(", ")} in a template value.`
    );
  }
  return issues;
}

/**
 * The template to send for one recipient, or null when none is set. Values are plain text
 * (WhatsApp shows them as-is), so they use `renderMessageTemplate`, never the formatted one.
 */
export function resolveWhatsAppTemplate(
  settings: Partial<WhatsAppTemplateSettings> | null | undefined,
  variables: MessageVariables
): ResolvedWhatsAppTemplate | null {
  if (!settings) return null;
  const { language, name, params } = normalizeWhatsAppTemplate(settings);
  if (!name) return null;
  return {
    bodyParams: params.map((param) => renderMessageTemplate(param, variables)),
    language: language ?? DEFAULT_WHATSAPP_TEMPLATE_LANGUAGE,
    name
  };
}

// ── Template status from WhatsApp Manager (docs/MESSAGING.md "WhatsApp templates") ──

/** A template as Meta lists it for the academy's WhatsApp Business Account. */
export interface WhatsAppTemplateInfo {
  name: string;
  language: string;
  /** APPROVED, PENDING, REJECTED, PAUSED, DISABLED, … as Meta reports it. */
  status: string;
  /** MARKETING, UTILITY, AUTHENTICATION. */
  category: string;
  /** The body text with its {{1}}, {{2}}… slots, as approved (null when Meta sent none). */
  body: string | null;
  /** How many values the body needs: the highest {{n}} in it. */
  paramCount: number;
  /** Header kind when there is one: TEXT, IMAGE, DOCUMENT, VIDEO, LOCATION. */
  header: string | null;
  /** Its buttons: the kind (QUICK_REPLY, URL, PHONE_NUMBER, …) and the label. */
  buttons: { text: string; type: string }[];
}

/** The number of values a template body needs: its highest {{n}} (0 = none). */
export function whatsappTemplateParamCount(body: string | null | undefined): number {
  let highest = 0;
  for (const match of (body ?? "").matchAll(/\{\{\s*(\d+)\s*\}\}/g)) highest = Math.max(highest, Number(match[1]));
  return highest;
}

/** The template a name + language picks (the default language when none is given). */
export function findWhatsAppTemplate(
  templates: readonly WhatsAppTemplateInfo[],
  name: string,
  language: string | null | undefined
): WhatsAppTemplateInfo | null {
  const wanted = (language || DEFAULT_WHATSAPP_TEMPLATE_LANGUAGE).trim();
  return templates.find((template) => template.name === name.trim() && template.language === wanted) ?? null;
}

export interface WhatsAppTemplateListResponse {
  /** False when the account can't be read: no WABA ID saved, or Meta refused. */
  available: boolean;
  reason: string | null;
  templates: WhatsAppTemplateInfo[];
  fetchedAt: string | null;
}

export type WhatsAppTemplateCheck =
  | { kind: "found"; status: string; category: string }
  | { kind: "other-language"; languages: string[] }
  | { kind: "missing" };

/** What WhatsApp Manager says about a template name + language a rule or setting uses. */
export function checkWhatsAppTemplate(
  templates: readonly WhatsAppTemplateInfo[],
  name: string,
  language: string | null | undefined
): WhatsAppTemplateCheck {
  const wanted = (language || DEFAULT_WHATSAPP_TEMPLATE_LANGUAGE).trim();
  const named = templates.filter((template) => template.name === name.trim());
  const exact = named.find((template) => template.language === wanted);
  if (exact) return { category: exact.category, kind: "found", status: exact.status };
  if (named.length > 0) return { kind: "other-language", languages: named.map((template) => template.language) };
  return { kind: "missing" };
}

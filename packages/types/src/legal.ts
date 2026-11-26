import { z } from "zod";

/**
 * Version of the Terms of Service and Privacy Policy (`/terms`, `/privacy`,
 * text in apps/web `features/legal/content.ts`). Bump it, as the date the new
 * wording takes effect, whenever either document's wording changes: every
 * self-registration stores the version the person agreed to
 * (`users.termsVersion` + `users.termsAcceptedAt`), so a later change can tell
 * who accepted the older text. The API records this constant, never a version
 * sent by the browser.
 */
export const LEGAL_TERMS_VERSION = "2026-11-26";

/** The sign-up checkbox: the request is refused unless it was ticked. */
export const acceptedTermsSchema = z.literal(true, {
  message: "Accept the Terms of Service and Privacy Policy to continue."
});

// ── An academy's own legal pages (docs/SAAS_MULTI_TENANCY.md §F "Legal pages") ──

/** The legal pages an academy can write its own wording for. */
export const LEGAL_PAGE_KINDS = ["privacy", "terms"] as const;
export type LegalPageKind = (typeof LEGAL_PAGE_KINDS)[number];
export const legalPageKindSchema = z.enum(LEGAL_PAGE_KINDS);

export const LEGAL_PAGE_LABELS: Record<LegalPageKind, string> = {
  privacy: "Privacy policy",
  terms: "Terms of service"
};

export const LEGAL_PAGE_PATHS: Record<LegalPageKind, string> = {
  privacy: "/privacy",
  terms: "/terms"
};

export const LEGAL_PAGE_MAX_LENGTH = 60_000;

/** Formatted text (TextEditor), never HTML. Empty = go back to the built-in text. */
export const updateLegalPageRequestSchema = z.object({
  body: z.string().trim().max(LEGAL_PAGE_MAX_LENGTH, `Keep the page under ${LEGAL_PAGE_MAX_LENGTH.toLocaleString("en")} characters.`)
});
export type UpdateLegalPageRequest = z.infer<typeof updateLegalPageRequestSchema>;

/** `GET /tenant/legal/:kind` (public, by host). `body` null = show the built-in text. */
export type PublicLegalPage = {
  kind: LegalPageKind;
  body: string | null;
  updatedAt: string | null;
};

/** `GET /admin/branding/legal`. */
export type AdminLegalPagesResponse = {
  pages: PublicLegalPage[];
  /** False for Nexa's own academy: its pages are part of the app. */
  editable: boolean;
};

/**
 * The version a self-registration records as accepted: the built-in version,
 * or, when the academy has its own wording, when that wording last changed.
 */
export function legalTermsVersionFor(academyPagesUpdatedAt: Array<string | Date>): string {
  if (academyPagesUpdatedAt.length === 0) return LEGAL_TERMS_VERSION;
  const latest = Math.max(...academyPagesUpdatedAt.map((value) => new Date(value).getTime()));
  return `academy:${new Date(latest).toISOString()}`;
}

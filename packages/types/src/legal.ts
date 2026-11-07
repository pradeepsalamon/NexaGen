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
export const LEGAL_TERMS_VERSION = "2026-11-07";

/** The sign-up checkbox: the request is refused unless it was ticked. */
export const acceptedTermsSchema = z.literal(true, {
  message: "Accept the Terms of Service and Privacy Policy to continue."
});

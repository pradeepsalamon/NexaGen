import { z } from "zod";

// Stored transcript of the coach's speech in a live class
// (docs/LIVE_CLASS.md § "Class transcript"). The coach's own browser turns
// their microphone into text and posts finished phrases; no audio reaches the
// API, and a student's voice is never captured.

/**
 * The consent text a coach agrees to. Bump it whenever the wording, the
 * processor (the browser's speech service) or the retention window changes:
 * a coach who agreed to an older version is asked again.
 */
export const TRANSCRIPT_CONSENT_VERSION = 1;

/** Days a transcript line is kept (`RETENTION_RULES`). */
export const TRANSCRIPT_RETENTION_DAYS = 30;

/** Languages the browser recogniser is asked for. One language per session. */
export const TRANSCRIPT_LANGUAGES = [
  { code: "en-IN", label: "English (India)" },
  { code: "ta-IN", label: "Tamil" },
  { code: "en-US", label: "English (US)" },
] as const;

export const transcriptLanguageSchema = z.enum(["en-IN", "ta-IN", "en-US"]);
export type TranscriptLanguage = z.infer<typeof transcriptLanguageSchema>;

export const DEFAULT_TRANSCRIPT_LANGUAGE: TranscriptLanguage = "en-IN";

export const MAX_TRANSCRIPT_LINES_PER_REQUEST = 50;
export const MAX_TRANSCRIPT_LINE_LENGTH = 2000;

export const transcriptLineInputSchema = z.object({
  /** Client-generated per phrase, so a retried request never stores it twice. */
  clientId: z.string().min(8).max(64),
  lang: transcriptLanguageSchema,
  text: z.string().trim().min(1).max(MAX_TRANSCRIPT_LINE_LENGTH),
  /** ISO-8601 UTC: when the phrase was first heard, by the coach's clock. */
  spokenAt: z.string().datetime(),
});
export type TranscriptLineInput = z.infer<typeof transcriptLineInputSchema>;

export const appendTranscriptRequestSchema = z.object({
  lines: z.array(transcriptLineInputSchema).min(1).max(MAX_TRANSCRIPT_LINES_PER_REQUEST),
});
export type AppendTranscriptRequest = z.infer<typeof appendTranscriptRequestSchema>;

export interface AppendTranscriptResponse {
  /** Lines newly stored; a retried line counts as 0. */
  saved: number;
}

export interface LiveClassTranscriptLine {
  id: string;
  lang: string;
  text: string;
  /** ISO-8601 UTC. */
  spokenAt: string;
}

/** Oldest first. `nextCursor` is null on the last page. */
export interface LiveClassTranscriptResponse {
  items: LiveClassTranscriptLine[];
  nextCursor: string | null;
}

export const TRANSCRIPT_PAGE_SIZE = 200;

export const setTranscriptConsentRequestSchema = z.object({
  consent: z.boolean(),
});
export type SetTranscriptConsentRequest = z.infer<typeof setTranscriptConsentRequestSchema>;

export interface TranscriptConsentResponse {
  /** True only when the coach agreed to the current `TRANSCRIPT_CONSENT_VERSION`. */
  consented: boolean;
  /** ISO-8601 UTC; null when never given or withdrawn. */
  consentedAt: string | null;
  /** The version the client must show and agree to. */
  currentVersion: number;
}

/** The one rule for "this consent row still counts". */
export function transcriptConsentIsCurrent(row: {
  transcriptConsentAt: Date | string | null | undefined;
  transcriptConsentVersion: number | null | undefined;
}): boolean {
  return !!row.transcriptConsentAt && row.transcriptConsentVersion === TRANSCRIPT_CONSENT_VERSION;
}

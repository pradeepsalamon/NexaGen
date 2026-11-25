import { z } from "zod";
import { findStudentIdentifiers, studentViewPrivacyViolations } from "./class-summary";

// ──────────────────────────────────────────────────────────────
// AI class recap, v1 (docs/CLASS_RECAPS.md; plan in
// docs/ai/architecture/PHASE3_SPEC.md §0a).
//
// After a class, a language model turns the coach's stored transcript
// (docs/LIVE_CLASS.md § "Class transcript") into a short recap for students.
// The coach (or an admin) reviews and publishes it; nothing reaches a student
// before that. Students' names are replaced by S1, S2… before the model sees
// the text, and any S# or chess notation the model writes is removed: the
// recap never names a student and never quotes a move (speech recognition
// gets notation wrong, and v1 has no board evidence to check a move against).
// ──────────────────────────────────────────────────────────────

/** Stored with every generated recap; bump when a prompt or the clean-up rules change. */
export const CLASS_RECAP_PROMPT_VERSION = "class_recap.v1";

/** Classes shorter than this get no recap. */
export const CLASS_RECAP_MIN_CLASS_MINUTES = 10;
/** A transcript with fewer words than this is skipped (nothing to summarise). */
export const CLASS_RECAP_MIN_WORDS = 80;
/** Ended classes older than this are not picked up any more. */
export const CLASS_RECAP_DISCOVERY_WINDOW_HOURS = 48;
/** Wait after a class ends before its recap is made (the coach's last lines may still arrive). */
export const CLASS_RECAP_START_DELAY_MS = 3 * 60_000;
/** A recap that failed this many runs is left FAILED (the coach can regenerate). */
export const CLASS_RECAP_MAX_ATTEMPTS = 3;
/** Regenerations a coach or admin may ask for per class. */
export const CLASS_RECAP_MAX_REGENERATIONS = 5;
/** What students always see above a recap (owner decision OD-28, 2026-11-25). */
export const CLASS_RECAP_AI_LABEL = "Prepared by your coach with AI assistance";

// ── Content ─────────────────────────────────────────────────

/** Caps on what the model's draft keeps. */
export const CLASS_RECAP_DRAFT_LIMITS = {
  keyPoints: 6,
  practice: 4,
  recapChars: 1200,
  recapSentences: 6,
  itemChars: 240
} as const;

/** Caps on what a coach may save (a little roomier than a draft). */
export const CLASS_RECAP_EDIT_LIMITS = {
  items: 10,
  itemChars: 400,
  recapChars: 2000
} as const;

export const classRecapContentSchema = z.object({
  recap: z.string().trim().min(1, "Write a short recap").max(CLASS_RECAP_EDIT_LIMITS.recapChars),
  keyPoints: z
    .array(z.string().trim().min(1, "Remove empty points").max(CLASS_RECAP_EDIT_LIMITS.itemChars))
    .max(CLASS_RECAP_EDIT_LIMITS.items),
  practice: z
    .array(z.string().trim().min(1, "Remove empty ideas").max(CLASS_RECAP_EDIT_LIMITS.itemChars))
    .max(CLASS_RECAP_EDIT_LIMITS.items)
});
export type ClassRecapContent = z.infer<typeof classRecapContentSchema>;

/**
 * Problems that stop a recap from being saved or published: an internal
 * student code (S1, Student 3) anywhere. A coach may write real names; the
 * model's codes would mean nothing to a student.
 */
export function classRecapContentIssues(content: ClassRecapContent): string[] {
  return studentViewPrivacyViolations(content, "recap").map(
    (v) => `Remove ${v.identifiers.join(", ")}: students see the recap, and these codes mean nothing to them.`
  );
}

// ── Status, provider, settings ──────────────────────────────

export const CLASS_RECAP_STATUSES = ["QUEUED", "RUNNING", "READY", "PUBLISHED", "DISCARDED", "FAILED", "SKIPPED"] as const;
export const classRecapStatusSchema = z.enum(CLASS_RECAP_STATUSES);
export type ClassRecapStatus = z.infer<typeof classRecapStatusSchema>;

export const CLASS_RECAP_STATUS_LABELS: Record<ClassRecapStatus, string> = {
  DISCARDED: "Discarded",
  FAILED: "Couldn't make",
  PUBLISHED: "Published",
  QUEUED: "Waiting",
  READY: "Ready to review",
  RUNNING: "Being written",
  SKIPPED: "Skipped"
};

export type ClassRecapFailure = "NO_TRANSCRIPT" | "TOO_SHORT" | "SHORT_CLASS" | "MODEL_ERROR" | "INVALID_OUTPUT" | "NO_PROVIDER";

export const CLASS_RECAP_FAILURE_LABELS: Record<ClassRecapFailure, string> = {
  INVALID_OUTPUT: "The AI's answer couldn't be used.",
  MODEL_ERROR: "The AI didn't answer.",
  NO_PROVIDER: "No AI is connected for this academy.",
  NO_TRANSCRIPT: "There is no transcript of this class.",
  SHORT_CLASS: `The class was shorter than ${CLASS_RECAP_MIN_CLASS_MINUTES} minutes.`,
  TOO_SHORT: "The transcript is too short to summarise."
};

/** Where the model runs: on the academy's own server, or an outside AI service. */
export const classRecapProviderSchema = z.enum(["LOCAL", "OUTSIDE"]);
export type ClassRecapProvider = z.infer<typeof classRecapProviderSchema>;

export interface ClassRecapSettings {
  /** Recaps are made for this academy's classes that have a transcript. */
  enabled: boolean;
  provider: ClassRecapProvider;
  planIncludes: boolean;
  /** The server's AI kill switch (`AI_CLASS_RECAPS_ENABLED`). */
  serverEnabled: boolean;
  local: { configured: boolean; model: string | null };
  outside: { configured: boolean; name: string | null; model: string | null };
}

export const updateClassRecapSettingsRequestSchema = z
  .object({
    enabled: z.boolean().optional(),
    provider: classRecapProviderSchema.optional()
  })
  .strict();
export type UpdateClassRecapSettingsRequest = z.infer<typeof updateClassRecapSettingsRequestSchema>;

/** The provider a run would use, or null when the chosen one isn't set up. */
export function usableRecapProvider(
  chosen: ClassRecapProvider,
  configured: { local: boolean; outside: boolean }
): ClassRecapProvider | null {
  return configured[chosen === "LOCAL" ? "local" : "outside"] ? chosen : null;
}

// ── Views ───────────────────────────────────────────────────

export interface ClassRecapClassInfo {
  classId: string;
  topic: string;
  batchName: string | null;
  coachName: string;
  /** ISO-8601 UTC. */
  startsAt: string;
}

/** The class's coach and admins. */
export interface ClassRecapStaffView {
  id: string;
  class: ClassRecapClassInfo;
  status: ClassRecapStatus;
  failure: ClassRecapFailure | null;
  /** The model's original draft (kept after edits, so staff can compare). */
  draft: ClassRecapContent | null;
  /** What students see once published: the draft with the coach's edits. */
  content: ClassRecapContent | null;
  edited: boolean;
  provider: ClassRecapProvider | null;
  providerName: string | null;
  model: string | null;
  generatedAt: string | null;
  publishedAt: string | null;
  publishedByName: string | null;
  /** The reviewer's thumbs: 1 up, -1 down. */
  rating: number | null;
  regenerationsLeft: number;
  updatedAt: string;
}

/** A student of the class, once published. */
export interface ClassRecapStudentView {
  id: string;
  class: ClassRecapClassInfo;
  content: ClassRecapContent;
  publishedAt: string;
  aiLabel: string;
}

export type ClassRecapResponse =
  | { viewer: "STAFF"; recap: ClassRecapStaffView | null }
  | { viewer: "STUDENT"; recap: ClassRecapStudentView | null };

export interface ClassRecapListItem {
  id: string;
  class: ClassRecapClassInfo;
  status: ClassRecapStatus;
  failure: ClassRecapFailure | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface ClassRecapListResponse {
  items: ClassRecapListItem[];
  pagination: { total: number; page: number; pageSize: number; totalPages: number };
}

export const classRecapListQuerySchema = z.object({
  status: classRecapStatusSchema.optional()
});

export interface ClassRecapFeedResponse {
  items: ClassRecapStudentView[];
  nextCursor: string | null;
}

export interface ClassRecapReviewCount {
  ready: number;
}

export const publishClassRecapRequestSchema = z
  .object({
    /** The edited recap; omitted = publish what is saved. */
    content: classRecapContentSchema.optional()
  })
  .strict();
export type PublishClassRecapRequest = z.infer<typeof publishClassRecapRequestSchema>;

export const saveClassRecapRequestSchema = z.object({ content: classRecapContentSchema }).strict();
export type SaveClassRecapRequest = z.infer<typeof saveClassRecapRequestSchema>;

export const rateClassRecapRequestSchema = z.object({ rating: z.union([z.literal(1), z.literal(-1)]) }).strict();
export type RateClassRecapRequest = z.infer<typeof rateClassRecapRequestSchema>;

// ── Transcript → model input ────────────────────────────────

export type RecapPerson = { firstName: string; lastName?: string | null; username?: string | null };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nameForms(person: RecapPerson): string[] {
  const first = person.firstName.trim();
  const last = person.lastName?.trim() ?? "";
  const forms = [first, last, `${first} ${last}`.trim(), person.username?.trim() ?? ""];
  // A one- or two-letter name would erase ordinary words.
  return forms.filter((f) => f.length >= 3);
}

/**
 * Replaces every student's name (first, last, full, username; any case) with
 * S1, S2…, and the coach's with "Coach". `students` must come in a stable
 * order (by id): the codes carry no rank. Names written in another script
 * (Tamil) aren't matched; the model is told never to name anyone, and the
 * reviewer reads every recap.
 */
export function pseudonymiseTranscript(text: string, students: RecapPerson[], coach: RecapPerson | null): string {
  const replacements: { form: string; code: string }[] = [];
  students.forEach((student, index) => {
    for (const form of nameForms(student)) replacements.push({ code: `S${index + 1}`, form });
  });
  if (coach) for (const form of nameForms(coach)) replacements.push({ code: "Coach", form });
  // Longest first, so "Asha Kumar" goes before "Asha".
  replacements.sort((a, b) => b.form.length - a.form.length);
  let result = text;
  for (const { form, code } of replacements) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(form)}(?![\\p{L}\\p{N}])`, "giu");
    result = result.replace(pattern, code);
  }
  return result;
}

/**
 * A rough token count: Latin text runs about 4 characters a token; Tamil and
 * other scripts far fewer. Used only to size chunks below a model's context.
 */
export function estimateTokens(text: string): number {
  let latin = 0;
  let other = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) < 0x0250) latin += 1;
    else other += 1;
  }
  return Math.ceil(latin / 4 + other / 1.5);
}

export function countWords(text: string): number {
  return text.split(/\s+/u).filter(Boolean).length;
}

/**
 * Splits transcript lines into chunks of at most `maxTokens` (estimated),
 * on line boundaries; a single over-long line is cut by characters.
 */
export function chunkTranscript(lines: string[], maxTokens: number): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;
  const flush = () => {
    if (current.length) chunks.push(current.join("\n"));
    current = [];
    currentTokens = 0;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const tokens = estimateTokens(line);
    if (tokens > maxTokens) {
      flush();
      const step = Math.max(1, Math.floor((line.length * maxTokens) / tokens));
      for (let i = 0; i < line.length; i += step) chunks.push(line.slice(i, i + step));
      continue;
    }
    if (currentTokens + tokens > maxTokens) flush();
    current.push(line);
    currentTokens += tokens;
  }
  flush();
  return chunks;
}

// ── Prompts ─────────────────────────────────────────────────

export type RecapPrompt = { system: string; user: string };

const SHARED_RULES = [
  "Rules:",
  "- Students appear as S1, S2 and so on. Never mention any student, by code or otherwise.",
  "- Do not write chess moves, squares or notation (such as e4, Nf3, Bxf7 or O-O). Describe the ideas in words.",
  "- Use only what the coach said. Do not invent topics.",
  "- The transcript comes from speech recognition: it may mix Tamil and English and contain mistakes. Write in simple English."
].join("\n");

export function recapPartPrompt(part: string, index: number, total: number): RecapPrompt {
  return {
    system: [
      "You read part of a transcript of what a chess coach said during a class for children.",
      "List the teaching points the coach made in this part: up to 6 short points in English.",
      "Skip greetings, attendance, and talk about microphones or the app.",
      'Return only JSON: {"points": ["..."]}',
      SHARED_RULES
    ].join("\n"),
    user: `Part ${index + 1} of ${total}:\n\n${part}`
  };
}

const RECAP_JSON_SHAPE =
  'Return only JSON: {"recap": "3 to 5 sentences on what the class covered, speaking to the students as you", "keyPoints": ["3 to 5 short ideas the class taught"], "practice": ["1 to 3 things to practise at home"]}';

export function recapFinalPrompt(source: { transcript: string } | { points: string[] }): RecapPrompt {
  const fromPoints = "points" in source;
  return {
    system: [
      "You write a short recap of a chess class for the children who attended it.",
      fromPoints
        ? "You get the teaching points the coach made, in the order of the class."
        : "You get a transcript of what the coach said.",
      RECAP_JSON_SHAPE,
      SHARED_RULES
    ].join("\n"),
    user: fromPoints ? source.points.map((p, i) => `${i + 1}. ${p}`).join("\n") : source.transcript
  };
}

// ── Model output → recap ────────────────────────────────────

/** The first JSON object in a model's answer (code fences and chatter around it are ignored). */
export function parseModelJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

const MOVE_NOTATION =
  /(?<![\p{L}\p{N}])(?:O-O(?:-O)?|0-0(?:-0)?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[a-h]x[a-h][1-8](?:=[QRBN])?[+#]?|[a-hA-H][1-8](?:=[QRBN])?[+#]?)(?![\p{L}\p{N}])/u;

/** True when the text writes a move or a square (e4, Nf3, exd5, O-O). */
export function containsMoveNotation(text: string): boolean {
  return MOVE_NOTATION.test(text);
}

function usableLine(text: string): boolean {
  return findStudentIdentifiers(text).length === 0 && !containsMoveNotation(text);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string").map((v) => v.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function keepItems(items: string[], cap: number): { kept: string[]; removed: number } {
  const seen = new Set<string>();
  const kept: string[] = [];
  let removed = 0;
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (!usableLine(item) || item.length > CLASS_RECAP_DRAFT_LIMITS.itemChars) {
      removed += 1;
      continue;
    }
    if (kept.length < cap) kept.push(item);
  }
  return { kept, removed };
}

/** Teaching points from one part's answer (unusable ones dropped). */
export function readRecapPoints(raw: unknown): string[] {
  const points = raw && typeof raw === "object" ? stringList((raw as { points?: unknown }).points) : [];
  return keepItems(points, 8).kept;
}

export type CleanedRecap = {
  content: ClassRecapContent | null;
  /** Sentences and items dropped for naming a student or writing notation. */
  removed: number;
  problem: string | null;
};

/**
 * The model's final answer as a draft: sentences and items that name a
 * student code or write chess notation are removed, never rewritten. Null
 * when what is left is not a usable recap (no recap text, or no key point).
 */
export function cleanRecapDraft(raw: unknown): CleanedRecap {
  if (!raw || typeof raw !== "object") return { content: null, problem: "The answer was not JSON.", removed: 0 };
  const value = raw as { recap?: unknown; keyPoints?: unknown; practice?: unknown };
  const text = typeof value.recap === "string" ? value.recap.replace(/\s+/g, " ").trim() : "";
  const sentences = text.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  let removed = 0;
  const keptSentences: string[] = [];
  for (const sentence of sentences) {
    if (!usableLine(sentence)) {
      removed += 1;
      continue;
    }
    if (keptSentences.length < CLASS_RECAP_DRAFT_LIMITS.recapSentences) keptSentences.push(sentence);
  }
  const recap = keptSentences.join(" ").slice(0, CLASS_RECAP_DRAFT_LIMITS.recapChars).trim();
  const keyPoints = keepItems(stringList(value.keyPoints), CLASS_RECAP_DRAFT_LIMITS.keyPoints);
  const practice = keepItems(stringList(value.practice), CLASS_RECAP_DRAFT_LIMITS.practice);
  removed += keyPoints.removed + practice.removed;
  if (!recap) return { content: null, problem: "No usable recap text.", removed };
  if (keyPoints.kept.length === 0) return { content: null, problem: "No usable key point.", removed };
  return { content: { keyPoints: keyPoints.kept, practice: practice.kept, recap }, problem: null, removed };
}

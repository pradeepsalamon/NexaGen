import { z } from "zod";

// Knowledge base / help centre (docs/KNOWLEDGE_BASE.md). Admins write every
// article; nothing ships pre-loaded. Each article names the roles it is for
// (and optionally the batches), and only a live, published version is ever
// shown to a reader. Edits make a new version; old ones stay for history and
// rollback. The API enforces every rule here; the UI only mirrors them.

export const KNOWLEDGE_AUDIENCES = ["STUDENT", "COACH", "ADMIN"] as const;
export type KnowledgeAudience = (typeof KNOWLEDGE_AUDIENCES)[number];

export const KNOWLEDGE_ARTICLE_KINDS = ["ARTICLE", "FAQ", "GAME", "RESOURCE"] as const;
export type KnowledgeArticleKind = (typeof KNOWLEDGE_ARTICLE_KINDS)[number];

export const KNOWLEDGE_ARTICLE_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type KnowledgeArticleStatus = (typeof KNOWLEDGE_ARTICLE_STATUSES)[number];

export const KNOWLEDGE_VERSION_STATUSES = ["DRAFT", "SUBMITTED", "PUBLISHED", "SUPERSEDED", "REJECTED"] as const;
export type KnowledgeVersionStatus = (typeof KNOWLEDGE_VERSION_STATUSES)[number];

/** OD-7 (DECISIONS.md): only these sources may go into the knowledge base. */
export const KNOWLEDGE_SOURCE_TYPES = ["OWN_WORK", "PUBLIC_DOMAIN", "CC0", "CC_BY", "PERMISSION"] as const;
export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPES)[number];

export const KNOWLEDGE_SOURCE_LABELS: Record<KnowledgeSourceType, string> = {
  CC0: "CC0 (no rights reserved)",
  CC_BY: "CC-BY (credit the author)",
  OWN_WORK: "Our own work",
  PERMISSION: "Used with written permission",
  PUBLIC_DOMAIN: "Public domain",
};

export const KNOWLEDGE_RESOURCE_TYPES = ["PAGE", "COURSE", "PUZZLE_FOLDER", "LIBRARY_GAME"] as const;
export type KnowledgeResourceType = (typeof KNOWLEDGE_RESOURCE_TYPES)[number];

export const KNOWLEDGE_EVENT_TYPES = [
  "CREATED",
  "DRAFT_SAVED",
  "SUBMITTED",
  "PUBLISHED",
  "REJECTED",
  "UNPUBLISHED",
  "ARCHIVED",
  "RESTORED",
  "ROLLED_BACK",
  "SETTINGS_CHANGED",
] as const;
export type KnowledgeEventType = (typeof KNOWLEDGE_EVENT_TYPES)[number];

export const KNOWLEDGE_TITLE_MAX = 200;
export const KNOWLEDGE_SUMMARY_MAX = 500;
export const KNOWLEDGE_BODY_MAX = 100_000;
export const KNOWLEDGE_PGN_MAX = 50_000;
export const KNOWLEDGE_NOTE_MAX = 1000;
export const KNOWLEDGE_QUERY_MAX = 200;
export const KNOWLEDGE_IMPORT_MAX = 200;
export const KNOWLEDGE_ROUTE_TAGS_MAX = 20;
export const KNOWLEDGE_BATCH_SCOPE_MAX = 200;
export const KNOWLEDGE_SEARCH_LIMIT = 20;
/** A query counts as "unanswered" when it found nothing. */
export const KNOWLEDGE_TREND_DAYS = 30;
/** A coach sees a student query in trends only once this many searches made it. */
export const KNOWLEDGE_TREND_MIN_COUNT = 2;
/**
 * …and only for a batch with at least this many current students. The log has no
 * user id, so repeat searches can't be told apart from distinct students; in a
 * small batch one student's repeated query would point straight at them.
 */
export const KNOWLEDGE_TREND_MIN_BATCH_SIZE = 5;

// ── Visibility ──────────────────────────────────────────────────────────────

export type KnowledgeUserRole = "SUPER_ADMIN" | "ADMIN" | "COACH" | "STUDENT";

/** The audience a signed-in user reads as. Super admins read as admins. */
export function knowledgeAudienceForRole(role: KnowledgeUserRole): KnowledgeAudience {
  if (role === "SUPER_ADMIN" || role === "ADMIN") return "ADMIN";
  return role;
}

export function isKnowledgeStaff(role: KnowledgeUserRole): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

export type KnowledgeVisibilityFacts = {
  status: KnowledgeArticleStatus;
  hasPublishedVersion: boolean;
  audience: readonly KnowledgeAudience[];
  /**
   * Set when an admin limited the article to batches. It outlives the batch rows,
   * so purging a batch from Trash can't turn a scoped article into a public one:
   * scoped with no batches left = no student or coach reaches it.
   */
  batchScoped: boolean;
  /** The batches it is limited to (ignored unless `batchScoped`). */
  batchIds: readonly string[];
  publishAt: Date | null;
  expiresAt: Date | null;
};

/** Published, has a live version, and inside its publish window. */
export function isKnowledgeArticleLive(article: KnowledgeVisibilityFacts, now: Date): boolean {
  if (article.status !== "PUBLISHED" || !article.hasPublishedVersion) return false;
  if (article.publishAt && article.publishAt.getTime() > now.getTime()) return false;
  if (article.expiresAt && article.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

/**
 * Whether a reader may see an article in the help centre. The one rule the
 * API query (`KnowledgeService.readerWhere`), preview-as-role and the tests share.
 *  - it must be live;
 *  - the reader's audience must be listed (an empty audience is nobody);
 *  - a batch-scoped article reaches students/coaches only through one of its
 *    batches; admins are never batch-scoped.
 */
export function canReadKnowledgeArticle(
  reader: { audience: KnowledgeAudience; batchIds: readonly string[] },
  article: KnowledgeVisibilityFacts,
  now: Date,
): boolean {
  if (!isKnowledgeArticleLive(article, now)) return false;
  if (!article.audience.includes(reader.audience)) return false;
  if (reader.audience === "ADMIN" || !article.batchScoped) return true;
  return article.batchIds.some((id) => reader.batchIds.includes(id));
}

// ── Content checks ──────────────────────────────────────────────────────────

// Ported from services/ai-runtime/app/rag/injection.py (the RAG PoC). Text
// that looks like it carries instructions for a model is flagged, and an admin
// must acknowledge the flag to publish it: once AI answers draw on these
// articles (Phase 5b), that text would reach the model.
const INJECTION_PATTERNS: Record<string, RegExp> = {
  "exfiltration":
    /\b(?:reveal|print|output|repeat|leak|show)\s+(?:the\s+|your\s+)?(?:system\s+prompt|hidden\s+instructions|secrets?|api\s+keys?|passwords?)/i,
  "ignore-instructions":
    /\b(?:ignore|disregard|forget|override)\s+(?:(?:all|any|the|your)\s+)*(?:previous|prior|above|earlier|preceding|system|original)\s+(?:instructions?|prompts?|messages?|rules|directions|context)/i,
  "new-instructions": /\bnew\s+(?:system\s+)?instructions?\s*:/i,
  "persona-switch": /\byou\s+are\s+now\b|\bfrom\s+now\s+on\s+you\b|\bact\s+as\s+(?:an?\s+)?(?:unrestricted|different)\b/i,
  "role-line": /^\s*(?:#+\s*)?(?:system|assistant|developer)\s*(?:prompt)?\s*:/im,
  "role-tag": /<\|?\s*\/?\s*(?:system|im_start|im_end|assistant|user|developer)\s*\|?>/i,
  "tool-call": /\b(?:call|invoke|execute|run|use)\s+(?:the\s+)?(?:tool|function)\b/i,
};

export const KNOWLEDGE_WARNING_LABELS: Record<string, string> = {
  "exfiltration": "Asks to reveal hidden prompts or secrets",
  "ignore-instructions": "Tells a reader to ignore earlier instructions",
  "missing-credit": "CC-BY or permission content needs a credit / licence note",
  "new-instructions": "Announces new instructions",
  "persona-switch": "Tries to change who the reader is",
  "role-line": "Has a line pretending to be a system or assistant message",
  "role-tag": "Has chat-format role tags",
  "tool-call": "Tells a reader to call a tool or function",
};

/** Names of the checks that fire on a version's text; empty when clean. */
export function detectKnowledgeWarnings(input: {
  title: string;
  summary?: string | null;
  body: string;
  sourceType?: KnowledgeSourceType;
  sourceNote?: string | null;
}): string[] {
  const text = [input.title, input.summary ?? "", input.body].join("\n");
  const found = Object.entries(INJECTION_PATTERNS)
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name);
  if ((input.sourceType === "CC_BY" || input.sourceType === "PERMISSION") && !input.sourceNote?.trim()) {
    found.push("missing-credit");
  }
  return found.sort();
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Lower-cased, whitespace-collapsed: how searches are grouped in the inbox. */
export function normalizeKnowledgeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ").slice(0, KNOWLEDGE_QUERY_MAX);
}

export function slugifyKnowledgeTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || "article";
}

/** A route tag matches the page it names and everything under it. */
export function knowledgeRouteMatches(tag: string, route: string): boolean {
  const clean = tag.replace(/\/+$/, "") || "/";
  return route === clean || route.startsWith(`${clean}/`);
}

export type KnowledgeDiffLine = { kind: "same" | "added" | "removed"; text: string };

/**
 * Line diff (longest common subsequence) between two versions' text. Articles
 * are small (≤ KNOWLEDGE_BODY_MAX); past 2,000 lines a side it falls back to
 * "everything removed, everything added" rather than an O(n·m) table.
 */
export function diffKnowledgeLines(before: string, after: string): KnowledgeDiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length > 2000 || b.length > 2000) {
    return [
      ...a.map((text) => ({ kind: "removed" as const, text })),
      ...b.map((text) => ({ kind: "added" as const, text })),
    ];
  }
  const n = a.length;
  const m = b.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const out: KnowledgeDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ kind: "removed", text: a[i++] });
    } else {
      out.push({ kind: "added", text: b[j++] });
    }
  }
  while (i < n) out.push({ kind: "removed", text: a[i++] });
  while (j < m) out.push({ kind: "added", text: b[j++] });
  return out;
}

/** The text a version is diffed and searched on. */
export function knowledgeVersionText(v: {
  title: string;
  summary?: string | null;
  body: string;
  pgn?: string | null;
}): string {
  return [`# ${v.title}`, v.summary ? `> ${v.summary}` : "", v.body, v.pgn ? `PGN:\n${v.pgn}` : ""]
    .filter(Boolean)
    .join("\n\n");
}

// ── Request schemas ─────────────────────────────────────────────────────────

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const isoDate = z
  .string()
  .datetime({ offset: true })
  .nullish()
  .transform((v) => v ?? null);

const routeTag = z
  .string()
  .trim()
  .regex(/^\/[a-z0-9\-/[\]]*$/i, "Route tags are paths like /student/assignments.")
  .max(120);

/** The writable content of a version. */
export const knowledgeContentSchema = z
  .object({
    body: z.string().max(KNOWLEDGE_BODY_MAX).default(""),
    changeNote: optionalText(KNOWLEDGE_NOTE_MAX),
    pgn: optionalText(KNOWLEDGE_PGN_MAX),
    resourceRef: optionalText(300),
    resourceType: z.enum(KNOWLEDGE_RESOURCE_TYPES).nullish().transform((v) => v ?? null),
    summary: optionalText(KNOWLEDGE_SUMMARY_MAX),
    title: z.string().trim().min(1, "Give it a title.").max(KNOWLEDGE_TITLE_MAX),
  })
  // Not "//host" or "/\\host", and no control characters: browsers drop tabs and
  // newlines from URLs, so "/\t/host" would open as "//host".
  .refine((v) => v.resourceType !== "PAGE" || !v.resourceRef || (/^\/(?![/\\])/.test(v.resourceRef) && !/[\u0000-\u001F\u007F]/.test(v.resourceRef)), {
    message: "A page link is a path starting with /.",
    path: ["resourceRef"],
  });
export type KnowledgeContentInput = z.infer<typeof knowledgeContentSchema>;

/** Article-level settings: not versioned, every change is logged. */
const knowledgeSettingsBase = z.object({
    audience: z.array(z.enum(KNOWLEDGE_AUDIENCES)).max(3),
    batchIds: z.array(z.string().min(1).max(64)).max(KNOWLEDGE_BATCH_SCOPE_MAX),
    categoryId: z.string().min(1).max(64).nullish().transform((v) => v ?? null),
    expiresAt: isoDate,
    kind: z.enum(KNOWLEDGE_ARTICLE_KINDS),
    language: z.string().trim().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/, "Use a language code like en, ta or hi.").default("en"),
    publishAt: isoDate,
    reviewBy: isoDate,
    routeTags: z.array(routeTag).max(KNOWLEDGE_ROUTE_TAGS_MAX),
    sourceNote: optionalText(KNOWLEDGE_NOTE_MAX),
    sourceType: z.enum(KNOWLEDGE_SOURCE_TYPES),
    translationOfId: z.string().min(1).max(64).nullish().transform((v) => v ?? null),
});

export const knowledgeSettingsSchema = knowledgeSettingsBase.refine((v) => !v.publishAt || !v.expiresAt || new Date(v.expiresAt) > new Date(v.publishAt), {
    message: "The expiry must be after the publish time.",
    path: ["expiresAt"],
  });
export type KnowledgeSettingsInput = z.infer<typeof knowledgeSettingsSchema>;

export const createKnowledgeArticleSchema = z.object({
  content: knowledgeContentSchema,
  settings: knowledgeSettingsSchema,
});
export type CreateKnowledgeArticleRequest = z.input<typeof createKnowledgeArticleSchema>;

export const updateKnowledgeDraftSchema = knowledgeContentSchema;
export type UpdateKnowledgeDraftRequest = z.input<typeof updateKnowledgeDraftSchema>;

export const updateKnowledgeSettingsSchema = knowledgeSettingsSchema;
export type UpdateKnowledgeSettingsRequest = z.input<typeof updateKnowledgeSettingsSchema>;

export const publishKnowledgeSchema = z.object({
  /** Required when the version has warnings. */
  acknowledgeWarnings: z.boolean().default(false),
  changeNote: optionalText(KNOWLEDGE_NOTE_MAX),
  /** Publish this version (a draft or a coach submission); defaults to the open draft. */
  versionId: z.string().min(1).max(64).optional(),
});
export type PublishKnowledgeRequest = z.input<typeof publishKnowledgeSchema>;

export const rejectKnowledgeSchema = z.object({
  note: z.string().trim().min(1, "Tell the coach why.").max(KNOWLEDGE_NOTE_MAX),
  versionId: z.string().min(1).max(64),
});
export type RejectKnowledgeRequest = z.infer<typeof rejectKnowledgeSchema>;

export const rollbackKnowledgeSchema = z.object({
  changeNote: optionalText(KNOWLEDGE_NOTE_MAX),
  versionId: z.string().min(1).max(64),
});
export type RollbackKnowledgeRequest = z.input<typeof rollbackKnowledgeSchema>;

export const knowledgeCategorySchema = z.object({
  description: optionalText(500),
  name: z.string().trim().min(1, "Name the category.").max(80),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});
export type KnowledgeCategoryRequest = z.input<typeof knowledgeCategorySchema>;

export const updateKnowledgeCategorySchema = knowledgeCategorySchema.partial().extend({
  archived: z.boolean().optional(),
});
export type UpdateKnowledgeCategoryRequest = z.input<typeof updateKnowledgeCategorySchema>;

/** A coach's suggestion: a new article, or an edit of one they can read. */
export const suggestKnowledgeSchema = z.object({
  articleId: z.string().min(1).max(64).optional(),
  content: knowledgeContentSchema,
});
export type SuggestKnowledgeRequest = z.input<typeof suggestKnowledgeSchema>;

export const knowledgeFeedbackSchema = z.object({ helpful: z.boolean() });
export type KnowledgeFeedbackRequest = z.infer<typeof knowledgeFeedbackSchema>;

export const knowledgeHelpQuerySchema = z.object({
  categoryId: z.string().min(1).max(64).optional(),
  language: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/).optional(),
  q: z.string().trim().max(KNOWLEDGE_QUERY_MAX).optional(),
  /** The page the reader opened help from; boosts articles tagged for it. */
  route: z.string().regex(/^\/[A-Za-z0-9\-/_]*$/).max(200).optional(),
});
export type KnowledgeHelpQuery = z.infer<typeof knowledgeHelpQuerySchema>;

/** Staff only: read the help centre as another role would. */
export const knowledgePreviewQuerySchema = knowledgeHelpQuerySchema.extend({
  asRole: z.enum(KNOWLEDGE_AUDIENCES),
  /** Read as a member of this batch (otherwise only unscoped articles). */
  batchId: z.string().min(1).max(64).optional(),
});
export type KnowledgePreviewQuery = z.infer<typeof knowledgePreviewQuerySchema>;

export const knowledgeAdminListQuerySchema = z.object({
  audience: z.enum(KNOWLEDGE_AUDIENCES).optional(),
  categoryId: z.string().min(1).max(64).optional(),
  filter: z.enum(["all", "needsReview", "scheduled", "expired", "flagged"]).default("all"),
  q: z.string().trim().max(KNOWLEDGE_QUERY_MAX).optional(),
  status: z.enum(KNOWLEDGE_ARTICLE_STATUSES).optional(),
});
export type KnowledgeAdminListQuery = z.infer<typeof knowledgeAdminListQuerySchema>;

export const resolveKnowledgeQuerySchema = z.object({
  articleId: z.string().min(1).max(64).nullish().transform((v) => v ?? null),
  query: z.string().trim().min(1).max(KNOWLEDGE_QUERY_MAX),
  resolution: z.enum(["ANSWERED", "DISMISSED"]),
});
export type ResolveKnowledgeQueryRequest = z.input<typeof resolveKnowledgeQuerySchema>;

/** One article in an export file / import request. */
export const knowledgeImportItemSchema = z.object({
  category: z.string().trim().max(80).nullish().transform((v) => v ?? null),
  content: knowledgeContentSchema,
  settings: knowledgeSettingsBase
    .omit({ batchIds: true, categoryId: true, translationOfId: true })
    .partial()
    .extend({ sourceType: z.enum(KNOWLEDGE_SOURCE_TYPES) }),
  slug: z.string().max(100).optional(),
});
export type KnowledgeImportItem = z.input<typeof knowledgeImportItemSchema>;

export const knowledgeImportSchema = z.object({
  items: z.array(knowledgeImportItemSchema).min(1, "Nothing to import.").max(KNOWLEDGE_IMPORT_MAX),
});
export type KnowledgeImportRequest = z.input<typeof knowledgeImportSchema>;

// ── Responses ───────────────────────────────────────────────────────────────

export type KnowledgeCategoryDto = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  archived: boolean;
  articleCount: number;
};

export type KnowledgeVersionSummary = {
  id: string;
  number: number;
  status: KnowledgeVersionStatus;
  title: string;
  changeNote: string | null;
  warnings: string[];
  author: { id: string; name: string } | null;
  reviewedBy: { id: string; name: string } | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type KnowledgeVersionDto = KnowledgeVersionSummary & {
  summary: string | null;
  body: string;
  pgn: string | null;
  resourceType: KnowledgeResourceType | null;
  resourceRef: string | null;
};

export type KnowledgeSettingsDto = {
  kind: KnowledgeArticleKind;
  categoryId: string | null;
  audience: KnowledgeAudience[];
  batchIds: string[];
  routeTags: string[];
  language: string;
  translationGroupId: string | null;
  sourceType: KnowledgeSourceType;
  sourceNote: string | null;
  publishAt: string | null;
  expiresAt: string | null;
  reviewBy: string | null;
};

export type KnowledgeAdminArticleSummary = KnowledgeSettingsDto & {
  id: string;
  slug: string;
  status: KnowledgeArticleStatus;
  title: string;
  categoryName: string | null;
  /** Live for readers right now (published and inside its window). */
  live: boolean;
  publishedVersionNumber: number | null;
  latestVersionNumber: number;
  hasDraft: boolean;
  pendingSubmissions: number;
  warnings: string[];
  helpful: number;
  notHelpful: number;
  updatedAt: string;
};

export type KnowledgeAdminListResponse = {
  articles: KnowledgeAdminArticleSummary[];
  counts: { needsReview: number; submissions: number; flagged: number };
};

export type KnowledgeEventDto = {
  id: string;
  type: KnowledgeEventType;
  versionNumber: number | null;
  actor: { id: string; name: string } | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

export type KnowledgeAdminArticleDetail = KnowledgeAdminArticleSummary & {
  batches: { id: string; name: string }[];
  translations: { id: string; slug: string; language: string; title: string }[];
  published: KnowledgeVersionDto | null;
  draft: KnowledgeVersionDto | null;
  versions: KnowledgeVersionSummary[];
  events: KnowledgeEventDto[];
};

export type KnowledgeVersionDiffResponse = {
  from: KnowledgeVersionSummary;
  to: KnowledgeVersionSummary;
  lines: KnowledgeDiffLine[];
};

export type KnowledgeSubmissionDto = {
  articleId: string;
  /** So an edit keeps the kind-specific fields (PGN, resource link). */
  articleKind: KnowledgeArticleKind;
  articleSlug: string;
  /** The live title, or null for a suggested new article. */
  articleTitle: string | null;
  isNewArticle: boolean;
  version: KnowledgeVersionDto;
};

export type KnowledgeSubmissionsResponse = { submissions: KnowledgeSubmissionDto[] };

export type KnowledgeHelpArticleSummary = {
  id: string;
  slug: string;
  kind: KnowledgeArticleKind;
  title: string;
  summary: string | null;
  categoryId: string | null;
  categoryName: string | null;
  language: string;
  /** A short piece of the body around the match (search results only). */
  snippet: string | null;
  /** Tagged for the page the reader came from. */
  forThisPage: boolean;
  updatedAt: string;
};

export type KnowledgeHelpResponse = {
  categories: { id: string; name: string; description: string | null; articleCount: number }[];
  articles: KnowledgeHelpArticleSummary[];
  /** Articles tagged for `route`, when one was given. */
  forThisPage: KnowledgeHelpArticleSummary[];
  /** Set for a search; false = nothing matched (logged for the admins' inbox). */
  searched: boolean;
};

export type KnowledgeHelpArticle = KnowledgeHelpArticleSummary & {
  versionNumber: number;
  body: string;
  pgn: string | null;
  resourceType: KnowledgeResourceType | null;
  resourceRef: string | null;
  sourceType: KnowledgeSourceType;
  sourceNote: string | null;
  publishedAt: string | null;
  translations: { slug: string; language: string; title: string }[];
  related: KnowledgeHelpArticleSummary[];
  myFeedback: boolean | null;
};

export type KnowledgeQueryInsight = {
  query: string;
  count: number;
  lastAskedAt: string;
  roles: KnowledgeAudience[];
};

export type KnowledgeInsightsResponse = {
  days: number;
  /** Searches that found nothing, most frequent first, unresolved only. */
  unanswered: KnowledgeQueryInsight[];
  /** Most searched overall. */
  topQueries: KnowledgeQueryInsight[];
  /** Articles readers marked not helpful. */
  notHelpful: { id: string; slug: string; title: string; helpful: number; notHelpful: number }[];
  totals: { searches: number; unanswered: number };
};

export type KnowledgeCoachTrendsResponse = {
  days: number;
  minBatchSize: number;
  minCount: number;
  batches: { id: string; name: string; queries: { query: string; count: number }[] }[];
};

export type KnowledgeExportFile = {
  format: "nexa-knowledge-export";
  version: 1;
  exportedAt: string;
  items: (KnowledgeImportItem & { slug: string })[];
};

export type KnowledgeImportResponse = { created: number; articleIds: string[] };

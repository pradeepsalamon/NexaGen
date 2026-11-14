import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";

/**
 * Content-Security-Policy violation reports (docs/AUTHORIZATION.md, CSP).
 *
 * Browsers send two shapes: the older `report-uri` body
 * (`{ "csp-report": { … } }`, `application/csp-report`) and the Reporting API's
 * batch (`[{ type: "csp-violation", body: { … } }]`,
 * `application/reports+json`). Both become one `csp-violation` log line.
 *
 * Nothing is stored. URLs keep only origin + path (a query string can carry a
 * one-time token, and students are minors), samples and user agents are
 * dropped, and each distinct violation is logged on its 1st, 10th, 100th, …
 * occurrence in this process, so a noisy page can't flood the log.
 */
export type CspViolation = {
  blocked: string;
  directive: string;
  disposition: string;
  document: string;
  line?: number;
  source?: string;
};

const text = z.string().max(4_000).optional();
const num = z.number().int().nonnegative().optional();

const legacyReport = z.object({
  "csp-report": z.object({
    "blocked-uri": text,
    disposition: text,
    "document-uri": text,
    "effective-directive": text,
    "line-number": num,
    "source-file": text,
    "violated-directive": text
  })
});

const reportingApiReport = z.object({
  body: z.object({
    blockedURL: text,
    disposition: text,
    documentURL: text,
    effectiveDirective: text,
    lineNumber: num,
    sourceFile: text
  }),
  type: z.string()
});

/** Keywords browsers put in a "blocked" field instead of a URL. */
const KEYWORDS = new Set(["inline", "eval", "wasm-eval", "trusted-types-policy", "trusted-types-sink", "data", "blob", "self"]);
const MAX_KEYS = 2_000;
const MAX_REPORTS_PER_BATCH = 20;

/** Origin + path only; keywords and schemes (`data`, `blob:`) pass as is. */
export function sanitizeReportUrl(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (KEYWORDS.has(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "ws:" || url.protocol === "wss:") {
      return `${url.origin}${url.pathname}`.slice(0, 200);
    }
    return url.protocol.replace(/:$/, "");
  } catch {
    return "(unreadable)";
  }
}

function directiveName(value: string | undefined): string {
  return (value ?? "").trim().split(/\s+/)[0]?.slice(0, 40) || "(none)";
}

export function parseCspReports(body: unknown): CspViolation[] {
  const legacy = legacyReport.safeParse(body);
  if (legacy.success) {
    const r = legacy.data["csp-report"];
    return [
      {
        blocked: sanitizeReportUrl(r["blocked-uri"]),
        directive: directiveName(r["effective-directive"] ?? r["violated-directive"]),
        disposition: r.disposition === "enforce" ? "enforce" : "report",
        document: sanitizeReportUrl(r["document-uri"]),
        line: r["line-number"],
        source: r["source-file"] ? sanitizeReportUrl(r["source-file"]) : undefined
      }
    ];
  }
  if (!Array.isArray(body)) return [];
  return body.slice(0, MAX_REPORTS_PER_BATCH).flatMap((entry): CspViolation[] => {
    const parsed = reportingApiReport.safeParse(entry);
    if (!parsed.success || parsed.data.type !== "csp-violation") return [];
    const r = parsed.data.body;
    return [
      {
        blocked: sanitizeReportUrl(r.blockedURL),
        directive: directiveName(r.effectiveDirective),
        disposition: r.disposition === "enforce" ? "enforce" : "report",
        document: sanitizeReportUrl(r.documentURL),
        line: r.lineNumber,
        source: r.sourceFile ? sanitizeReportUrl(r.sourceFile) : undefined
      }
    ];
  });
}

@Injectable()
export class CspReportService {
  private readonly logger = new Logger("CspReport");
  private readonly counts = new Map<string, number>();
  private overflow = 0;

  record(body: unknown): void {
    for (const violation of parseCspReports(body)) {
      const key = [violation.directive, violation.blocked, violation.document, violation.source ?? ""].join("|");
      if (!this.counts.has(key) && this.counts.size >= MAX_KEYS) {
        // Full (a public route: anyone can send 2,000 distinct URLs): new keys
        // share one throttled counter, so they can't log on every report.
        this.overflow += 1;
        if (/^10*$/.test(String(this.overflow))) {
          this.logger.warn({ msg: "csp-violation-overflow", count: this.overflow, directive: violation.directive });
        }
        continue;
      }
      const count = (this.counts.get(key) ?? 0) + 1;
      this.counts.set(key, count);
      if (/^10*$/.test(String(count))) {
        this.logger.warn({ msg: "csp-violation", count, ...violation });
      }
    }
  }
}

import * as fs from "fs";
import * as path from "path";
import { Logger } from "@nestjs/common";
import { API_ROUTES } from "@nexa-chess/types";
import { CspReportService, parseCspReports, sanitizeReportUrl } from "./csp-report.service";

describe("CSP violation reports", () => {
  const legacy = {
    "csp-report": {
      "blocked-uri": "https://evil.example/x.js?token=secret",
      disposition: "report",
      "document-uri": "https://nexachess.in/reset-password?token=abc#frag",
      "effective-directive": "script-src-elem",
      "line-number": 12,
      "original-policy": "default-src 'self'",
      "script-sample": "alert(document.cookie)",
      "source-file": "https://nexachess.in/_next/static/chunks/app.js?v=1",
      "violated-directive": "script-src-elem 'self'"
    }
  };
  const reportingApi = [
    {
      age: 3,
      body: {
        blockedURL: "inline",
        disposition: "enforce",
        documentURL: "https://dev.nexachess.in/student/schedule?week=2",
        effectiveDirective: "style-src-attr",
        lineNumber: 1,
        sample: "color:red",
        sourceFile: "https://dev.nexachess.in/student/schedule"
      },
      type: "csp-violation",
      url: "https://dev.nexachess.in/student/schedule?week=2",
      user_agent: "Mozilla/5.0"
    },
    { body: {}, type: "deprecation" }
  ];

  it("reads the report-uri form and keeps only origin + path", () => {
    expect(parseCspReports(legacy)).toEqual([
      {
        blocked: "https://evil.example/x.js",
        directive: "script-src-elem",
        disposition: "report",
        document: "https://nexachess.in/reset-password",
        line: 12,
        source: "https://nexachess.in/_next/static/chunks/app.js"
      }
    ]);
  });

  it("reads Reporting API batches and skips other report types", () => {
    expect(parseCspReports(reportingApi)).toEqual([
      {
        blocked: "inline",
        directive: "style-src-attr",
        disposition: "enforce",
        document: "https://dev.nexachess.in/student/schedule",
        line: 1,
        source: "https://dev.nexachess.in/student/schedule"
      }
    ]);
  });

  it("ignores bodies that aren't reports, and caps a batch", () => {
    expect(parseCspReports({})).toEqual([]);
    expect(parseCspReports("nonsense")).toEqual([]);
    expect(parseCspReports([{ type: "csp-violation", body: { lineNumber: -1 } }])).toEqual([]);
    const many = Array.from({ length: 50 }, () => reportingApi[0]);
    expect(parseCspReports(many)).toHaveLength(20);
  });

  it("never passes a query string, a sample or a scheme's payload on", () => {
    expect(sanitizeReportUrl("data:text/html,<script>")).toBe("data");
    expect(sanitizeReportUrl("blob:https://nexachess.in/uuid")).toBe("blob");
    expect(sanitizeReportUrl("eval")).toBe("eval");
    expect(sanitizeReportUrl("not a url")).toBe("(unreadable)");
    expect(sanitizeReportUrl(undefined)).toBe("");
    expect(JSON.stringify(parseCspReports(legacy))).not.toMatch(/token|secret|cookie|abc/);
  });

  it("logs a repeated violation on its 1st, 10th and 100th occurrence only", () => {
    const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const service = new CspReportService();
    for (let i = 0; i < 100; i += 1) service.record(legacy);
    expect(warn.mock.calls.map(([entry]) => (entry as { count: number }).count)).toEqual([1, 10, 100]);
    expect(warn.mock.calls[0][0]).toMatchObject({ directive: "script-src-elem", msg: "csp-violation" });
    warn.mockRestore();
  });

  it("once 2,000 distinct violations are tracked, new ones share one throttled counter", () => {
    const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const service = new CspReportService();
    const distinct = (i: number) => ({ "csp-report": { ...legacy["csp-report"], "blocked-uri": `https://evil${i}.example/x.js` } });
    for (let i = 0; i < 2_000; i += 1) service.record(distinct(i));
    warn.mockClear();
    for (let i = 2_000; i < 2_100; i += 1) service.record(distinct(i));
    expect(warn.mock.calls.map(([entry]) => entry as { count: number; msg: string })).toEqual([
      expect.objectContaining({ count: 1, msg: "csp-violation-overflow" }),
      expect.objectContaining({ count: 10, msg: "csp-violation-overflow" }),
      expect.objectContaining({ count: 100, msg: "csp-violation-overflow" })
    ]);
    warn.mockRestore();
  });

  it("the web sends its reports to this route through its own /api", () => {
    const config = fs.readFileSync(path.resolve(__dirname, "../../../web/next.config.mjs"), "utf8");
    expect(config).toContain(`const CSP_REPORT_PATH = "/api${API_ROUTES.security.cspReport}";`);
  });
});

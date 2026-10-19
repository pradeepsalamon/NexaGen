import { parseApiEnv } from "@nexa-chess/config/api";

const SECRET = "s".repeat(31) + "-ai-runtime-shared-secret";

const enabled = (overrides: Record<string, string | undefined> = {}) =>
  ({ AI_ENABLED: "true", AI_RUNTIME_SHARED_SECRET: SECRET, ...overrides }) as NodeJS.ProcessEnv;

describe("AI_* configuration", () => {
  it("defaults to disabled and needs no secret", () => {
    const env = parseApiEnv({});
    expect(env.AI_ENABLED).toBe(false);
    expect(env.AI_RUNTIME_SHARED_SECRET).toBeUndefined();
    expect(env.AI_RUNTIME_URL).toBe("http://ai-runtime:8000");
    expect(env.AI_RUNTIME_TIMEOUT_MS).toBe(5000);
  });

  it("ignores a bad URL or secret while disabled", () => {
    expect(() => parseApiEnv({ AI_RUNTIME_SHARED_SECRET: "short", AI_RUNTIME_URL: "https://x" })).not.toThrow();
  });

  it("accepts a valid enable", () => {
    const env = parseApiEnv(enabled({ AI_RUNTIME_URL: "http://127.0.0.1:8000" }));
    expect(env.AI_ENABLED).toBe(true);
    expect(env.AI_RUNTIME_URL).toBe("http://127.0.0.1:8000");
  });

  it.each([
    ["no secret", { AI_RUNTIME_SHARED_SECRET: undefined }],
    ["a short secret", { AI_RUNTIME_SHARED_SECRET: "x".repeat(31) }],
    ["a placeholder secret", { AI_RUNTIME_SHARED_SECRET: `change-this-${"x".repeat(40)}` }],
    ["the access-token secret", { JWT_ACCESS_SECRET: SECRET }],
    ["the refresh-token secret", { JWT_REFRESH_SECRET: SECRET }],
    ["an https URL", { AI_RUNTIME_URL: "https://ai-runtime:8000" }],
    ["an unknown host", { AI_RUNTIME_URL: "http://evil.example:8000" }],
    ["credentials in the URL", { AI_RUNTIME_URL: "http://user:pass@ai-runtime:8000" }],
    ["a path", { AI_RUNTIME_URL: "http://ai-runtime:8000/v1" }],
    ["a query", { AI_RUNTIME_URL: "http://ai-runtime:8000?x=1" }],
    ["not a URL", { AI_RUNTIME_URL: "ai-runtime" }]
  ])("refuses to boot when enabled with %s", (_label, overrides) => {
    expect(() => parseApiEnv(enabled(overrides))).toThrow();
  });

  it("checks in development too, not only production", () => {
    expect(() => parseApiEnv(enabled({ AI_RUNTIME_SHARED_SECRET: "short", NODE_ENV: "development" }))).toThrow(
      /AI_RUNTIME_SHARED_SECRET/
    );
  });

  it.each(["499", "30001", "abc"])("rejects AI_RUNTIME_TIMEOUT_MS=%s", (value) => {
    expect(() => parseApiEnv({ AI_RUNTIME_TIMEOUT_MS: value })).toThrow();
  });
});

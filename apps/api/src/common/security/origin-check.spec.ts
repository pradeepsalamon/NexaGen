import { createOriginCheckMiddleware, isAllowedRequestOrigin } from "./origin-check";

const allowed = new Set(["https://nexa.example"]);
const req = (method: string, headers: Record<string, string> = {}) => ({ headers, method });

describe("isAllowedRequestOrigin", () => {
  it("lets safe methods through from any origin", () => {
    expect(isAllowedRequestOrigin(req("GET", { origin: "https://evil.example" }), allowed)).toBe(true);
  });

  it("accepts a state-changing request from an allowed origin", () => {
    expect(isAllowedRequestOrigin(req("POST", { origin: "https://nexa.example" }), allowed)).toBe(true);
  });

  it("rejects a cross-site form post", () => {
    expect(isAllowedRequestOrigin(req("POST", { origin: "https://evil.example" }), allowed)).toBe(false);
  });

  it("rejects an opaque null origin", () => {
    expect(isAllowedRequestOrigin(req("DELETE", { origin: "null" }), allowed)).toBe(false);
  });

  it("falls back to the Referer when Origin is missing", () => {
    expect(isAllowedRequestOrigin(req("PATCH", { referer: "https://nexa.example/admin/users" }), allowed)).toBe(true);
    expect(isAllowedRequestOrigin(req("PATCH", { referer: "https://evil.example/page" }), allowed)).toBe(false);
  });

  it("lets through non-browser clients that send neither header", () => {
    expect(isAllowedRequestOrigin(req("POST"), allowed)).toBe(true);
  });
});

describe("createOriginCheckMiddleware", () => {
  const run = (path: string, headers: Record<string, string>) => {
    const middleware = createOriginCheckMiddleware(["https://nexa.example/"], ["/webhooks/livekit"]);
    const next = jest.fn();
    const json = jest.fn();
    const response = { status: jest.fn().mockReturnValue({ json }) };
    middleware({ headers, method: "POST", path } as never, response as never, next);
    return { json, next, response };
  };

  it("exempts webhook paths", () => {
    expect(run("/webhooks/livekit", { origin: "https://livekit.example" }).next).toHaveBeenCalled();
  });

  it("answers 403 for a disallowed origin", () => {
    const { next, response } = run("/live-class/abc/kick", { origin: "https://evil.example" });
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
  });

  it("normalizes a trailing slash in the configured origin", () => {
    expect(run("/live-class/abc/kick", { origin: "https://nexa.example" }).next).toHaveBeenCalled();
  });
});

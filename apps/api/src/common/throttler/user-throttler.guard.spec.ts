import { JwtService } from "@nestjs/jwt";
import { resolveThrottleTracker } from "./user-throttler.guard";

jest.mock("@nexa-chess/config/api", () => ({
  getApiEnv: () => ({ JWT_ACCESS_SECRET: "secret" })
}));

describe("resolveThrottleTracker", () => {
  const jwt = new JwtService({});
  const sign = (payload: object, secret = "secret") => jwt.sign(payload, { secret });
  const req = (path: string, token?: string) => ({
    ip: "203.0.113.7",
    originalUrl: path,
    cookies: token ? { nexa_access_token: token } : {}
  });

  it("keys a signed-in request by user id", () => {
    const token = sign({ sub: "u1", type: "access" });
    expect(resolveThrottleTracker(req("/presence/heartbeat", token))).toBe("user:u1");
  });

  it("falls back to IP for anonymous requests", () => {
    expect(resolveThrottleTracker(req("/presence/heartbeat"))).toBe("203.0.113.7");
  });

  it("keeps auth routes on IP even with a valid token", () => {
    const token = sign({ sub: "u1", type: "access" });
    expect(resolveThrottleTracker(req("/auth/login", token))).toBe("203.0.113.7");
  });

  it("ignores a forged or non-access token", () => {
    expect(resolveThrottleTracker(req("/x", sign({ sub: "u1", type: "access" }, "wrong")))).toBe(
      "203.0.113.7"
    );
    expect(resolveThrottleTracker(req("/x", sign({ sub: "u1", type: "refresh" })))).toBe(
      "203.0.113.7"
    );
  });
});

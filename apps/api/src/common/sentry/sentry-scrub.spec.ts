import type { ErrorEvent } from "@sentry/nestjs";
import { scrubSentryBreadcrumb, scrubSentryEvent, stripQuery } from "./sentry-scrub";

describe("sentry scrubbing", () => {
  it("strips query strings and fragments", () => {
    expect(stripQuery("/live-class/1/recording/stream?st=secret")).toBe("/live-class/1/recording/stream");
    expect(stripQuery("/demo/abc#invite")).toBe("/demo/abc");
    expect(stripQuery("/batches")).toBe("/batches");
  });

  it("drops cookies, bodies, credentials and everything but the user id", () => {
    const event = scrubSentryEvent({
      request: {
        cookies: { nexa_access_token: "jwt" },
        data: { password: "hunter2" },
        headers: { Authorization: "Bearer x", Cookie: "a=b", "user-agent": "jest", "X-Forwarded-For": "1.2.3.4" },
        query_string: "invite=token",
        url: "https://api.test/demo/1/join?invite=token"
      },
      type: undefined,
      user: { email: "kid@example.com", id: "user-1", ip_address: "1.2.3.4", username: "kid" }
    } as ErrorEvent);

    expect(event.request).toEqual({
      headers: { "user-agent": "jest" },
      url: "https://api.test/demo/1/join"
    });
    expect(event.user).toEqual({ id: "user-1" });
  });

  it("removes a user with no id entirely", () => {
    const event = scrubSentryEvent({ type: undefined, user: { ip_address: "1.2.3.4" } } as ErrorEvent);
    expect(event.user).toBeUndefined();
  });

  it("strips query strings from breadcrumb urls", () => {
    const breadcrumb = scrubSentryBreadcrumb({ category: "http", data: { method: "GET", url: "https://x.test/a?st=1" } });
    expect(breadcrumb.data).toEqual({ method: "GET", url: "https://x.test/a" });
  });
});

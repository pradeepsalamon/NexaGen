import { DomainCheckService } from "./domain-check.service";

describe("DomainCheckService", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("passes only when the host echoes the token this process issued", async () => {
    const service = new DomainCheckService();
    global.fetch = jest.fn(async (url: string | URL | Request) => {
      const token = String(url).split("/").pop()!;
      expect(service.isIssued(token)).toBe(true);
      return new Response(JSON.stringify({ token }), { status: 200 });
    }) as typeof fetch;
    await expect(service.check("learn.example.com", "https")).resolves.toMatchObject({ ok: true });
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toMatch(/^https:\/\/learn\.example\.com\/api\/tenant\/domain-check\//);
  });

  it("fails on another app's answer, a non-200, or a network error, and forgets the token", async () => {
    const service = new DomainCheckService();
    let seen = "";
    global.fetch = jest.fn(async (url: string | URL | Request) => {
      seen = String(url).split("/").pop()!;
      return new Response(JSON.stringify({ token: "someone-else" }), { status: 200 });
    }) as typeof fetch;
    await expect(service.check("a.example.com", "https")).resolves.toMatchObject({ ok: false });
    expect(service.isIssued(seen)).toBe(false);

    global.fetch = jest.fn(async () => new Response("nope", { status: 502 })) as typeof fetch;
    await expect(service.check("a.example.com", "https")).resolves.toMatchObject({ ok: false });

    global.fetch = jest.fn(async () => {
      throw new TypeError("fetch failed", { cause: new Error("getaddrinfo ENOTFOUND") });
    }) as typeof fetch;
    const failed = await service.check("a.example.com", "https");
    expect(failed.ok).toBe(false);
    expect(failed.result).toContain("ENOTFOUND");
  });
});

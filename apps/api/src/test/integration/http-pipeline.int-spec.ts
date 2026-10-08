import { API_ROUTES } from "@nexa-chess/types";
import { createTestApp, type TestApp } from "./app";
import { TEST_ORIGIN } from "./app-env";
import { resetDatabase } from "./db";
import { createWorld } from "./access/world";

// The behaviours configureApp() promises, pinned across Express/body-parser upgrades.
describe("HTTP pipeline (real app)", () => {
  let t: TestApp;
  let w: Awaited<ReturnType<typeof createWorld>>;
  let base = "";

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    w = await createWorld(t.prisma);
    base = t.baseUrl.replace("[::1]", "127.0.0.1");
  });
  afterAll(async () => {
    await t?.close();
  });

  const post = (path: string, headers: Record<string, string>, body: string) =>
    fetch(base + path, { body, headers, method: "POST" });

  it("a body-less POST reaches the handler with {} (body-parser 2 leaves it undefined)", async () => {
    // Validation sees {} and names the missing field, not "expected object, received undefined".
    const res = await t.call(w.a.coach, "POST", API_ROUTES.puzzles.archive(w.a.privatePuzzle.id));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("archived:");
  });

  it("does not parse urlencoded bodies (cross-site form posts)", async () => {
    const res = await post(
      API_ROUTES.auth.login,
      { "Content-Type": "application/x-www-form-urlencoded", Origin: TEST_ORIGIN },
      "email=a@b.example&password=x"
    );
    expect(res.status).toBe(400);
  });

  it("rejects a state-changing request from another origin", async () => {
    const res = await post(API_ROUTES.auth.login, { "Content-Type": "application/json", Origin: "https://evil.example" }, "{}");
    expect(res.status).toBe(403);
  });

  it("keeps webhook bodies raw for signature checks", async () => {
    const livekit = await post(
      API_ROUTES.attendance.webhook,
      { Authorization: "x", "Content-Type": "application/webhook+json" },
      '{"event":"room_started"}'
    );
    const razorpay = await post(
      API_ROUTES.payments.webhookRazorpay,
      { "Content-Type": "application/json", "X-Razorpay-Signature": "x" },
      '{"event":"payment.captured","payload":{}}'
    );
    expect(await livekit.json()).toMatchObject({ message: "Invalid webhook signature.", statusCode: 401 });
    expect(await razorpay.json()).toMatchObject({ message: "Invalid webhook signature.", statusCode: 400 });
  });

  it("refuses an oversized JSON body", async () => {
    const res = await post(
      API_ROUTES.auth.login,
      { "Content-Type": "application/json", Origin: TEST_ORIGIN },
      JSON.stringify({ email: "a".repeat(2_000_000) })
    );
    expect(res.status).toBe(413);
  });

  it("parses numeric query params and 404s unknown routes", async () => {
    const list = await t.call(w.admin, "GET", `${API_ROUTES.batches.list}?page=1&pageSize=1`);
    expect(list.status).toBe(200);
    expect((list.body as { batches: unknown[] }).batches).toHaveLength(1);
    expect((await t.call(null, "GET", "/definitely/not/here")).status).toBe(404);
  });
});

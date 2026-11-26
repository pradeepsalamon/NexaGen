import { API_ROUTES, type AiIntegrationsResponse, type AiProviderModelsResponse } from "@nexa-chess/types";
import { UserRole, UserStatus } from "@prisma/client";
import { createTestApp, type TestApp } from "../../test/integration/app";
import { createUser, resetDatabase } from "../../test/integration/db";
import { AiProvidersService } from "./ai-providers.service";

// Platform console → AI (docs/AI_PROVIDERS.md) on real Postgres. The
// providers' own API is stubbed: no request leaves the machine.
describe("platform console: AI providers and models per feature (real app, real Postgres)", () => {
  let t: TestApp;
  let operator: Awaited<ReturnType<typeof createUser>>;
  let admin: Awaited<ReturnType<typeof createUser>>;
  let fetchSpy: jest.SpyInstance;
  const KEY = "gsk_test_key_0123456789abcd";

  const op = (method: string, path: string, body?: unknown) => t.call(operator, method, path, body);

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    const active = async (role: UserRole) =>
      t.prisma.user.update({ data: { status: UserStatus.ACTIVE }, where: { id: (await createUser(t.prisma, role)).id } });
    operator = await active(UserRole.SUPER_ADMIN);
    admin = await active(UserRole.ADMIN);
    const realFetch = global.fetch;
    fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (!url.startsWith("https://api.groq.com/")) return realFetch(input, init);
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      if (auth !== `Bearer ${KEY}`) return new Response(JSON.stringify({ error: "invalid_api_key" }), { status: 401 });
      if (url.endsWith("/models")) {
        return new Response(
          JSON.stringify({ data: [{ context_window: 131072, id: "qwen/qwen3.8-27b" }, { id: "openai/gpt-oss-120b" }, { id: "whisper-large-v3" }] }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 });
    });
  });

  afterAll(async () => {
    fetchSpy?.mockRestore();
    await t?.close();
  });

  it("is for platform operators only", async () => {
    expect((await t.call(admin, "GET", API_ROUTES.platform.ai)).status).toBe(403);
    expect((await t.call(admin, "PUT", API_ROUTES.platform.aiProvider("GROQ"), { apiKey: KEY, enabled: true })).status).toBe(403);
  });

  it("a key the provider refuses is never stored", async () => {
    const refused = await op("PUT", API_ROUTES.platform.aiProvider("GROQ"), { apiKey: "gsk_wrong_key_000000", enabled: true });
    expect(refused.status).toBe(400);
    expect(await t.prisma.aiProviderCredential.count()).toBe(0);
  });

  it("connects a key (stored encrypted, shown by its last 4), and Auto maps the features to it", async () => {
    const saved = await op("PUT", API_ROUTES.platform.aiProvider("groq"), { apiKey: KEY, enabled: true });
    expect(saved.status).toBe(200);
    const view = saved.body as AiIntegrationsResponse;
    expect(view.providers.find((p) => p.provider === "GROQ")).toMatchObject({ connected: true, keyHint: "abcd" });
    expect(JSON.stringify(view)).not.toContain(KEY);
    const row = await t.prisma.aiProviderCredential.findUniqueOrThrow({ where: { provider: "GROQ" } });
    expect(row.apiKeyEncrypted).not.toContain(KEY);
    expect(view.features.find((f) => f.feature === "CLASS_RECAP")?.route).toEqual({
      fallback: { auto: true, model: "openai/gpt-oss-120b", provider: "GROQ" },
      primary: { auto: true, model: "qwen/qwen3.8-27b", provider: "GROQ" }
    });
    expect(t.app.get(AiProvidersService).routeConfigs("PLAY_REVIEW_COMMENT")[0]).toMatchObject({
      apiKey: KEY,
      model: "qwen/qwen3.8-27b",
      providerId: "GROQ",
      url: "https://api.groq.com/openai/v1"
    });
    const audit = await t.prisma.platformAuditLog.findMany({ where: { action: "ai.provider.key-saved" } });
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain(KEY);
  });

  it("lists the provider's chat models", async () => {
    const models = (await op("GET", API_ROUTES.platform.aiProviderModels("GROQ"))).body as AiProviderModelsResponse;
    expect(models.models.map((m) => m.id)).toEqual(["openai/gpt-oss-120b", "qwen/qwen3.8-27b"]);
  });

  it("maps a feature to chosen models; a provider not connected is refused", async () => {
    const refused = await op("PUT", API_ROUTES.platform.aiFeature("CLASS_RECAP"), {
      fallback: null,
      fallbackOff: false,
      primary: { model: "gemini-3.1-flash-lite", provider: "GEMINI" }
    });
    expect(refused.status).toBe(400);

    const saved = await op("PUT", API_ROUTES.platform.aiFeature("class_recap"), {
      fallback: null,
      fallbackOff: true,
      primary: { model: "openai/gpt-oss-120b", provider: "GROQ" }
    });
    expect(saved.status).toBe(200);
    expect((saved.body as AiIntegrationsResponse).features.find((f) => f.feature === "CLASS_RECAP")?.route).toEqual({
      fallback: null,
      primary: { auto: false, model: "openai/gpt-oss-120b", provider: "GROQ" }
    });
    expect((await op("PUT", API_ROUTES.platform.aiFeature("NOPE"), { fallback: null, fallbackOff: false, primary: null })).status).toBe(400);
  });

  it("tests a model with one tiny request", async () => {
    const result = await op("POST", API_ROUTES.platform.aiTest, { model: "qwen/qwen3.8-27b", provider: "GROQ" });
    expect(result.body).toMatchObject({ ok: true });
  });

  it("removing the key turns every route off", async () => {
    expect((await op("DELETE", API_ROUTES.platform.aiProvider("GROQ"))).status).toBe(200);
    expect(t.app.get(AiProvidersService).routeConfigs("CLASS_RECAP")).toEqual([]);
    expect((await op("DELETE", API_ROUTES.platform.aiProvider("GROQ"))).status).toBe(404);
  });
});

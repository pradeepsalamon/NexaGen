import { AI_FEATURES, aiConsentCoveredProviders, AI_REVIEW_CONSENT_VERSION, resolveAiFeatureRoute } from "@nexa-chess/types";
import { callChatModel, type ChatModelConfig } from "../chat-model";
import { parseModelList } from "./ai-providers.service";

describe("resolveAiFeatureRoute (the one rule)", () => {
  it("nothing connected: no route", () => {
    expect(resolveAiFeatureRoute({ choice: null, connected: [], feature: "CLASS_RECAP" })).toEqual({ fallback: null, primary: null });
  });

  it("Auto: the feature's best connected model, the fallback on another provider", () => {
    const route = resolveAiFeatureRoute({ choice: null, connected: ["GEMINI", "GROQ"], feature: "CLASS_RECAP" });
    expect(route.primary).toEqual({ auto: true, model: "qwen/qwen3.8-27b", provider: "GROQ" });
    expect(route.fallback).toEqual({ auto: true, model: "gemini-3.1-flash-lite", provider: "GEMINI" });
  });

  it("Auto with one provider: the fallback is that provider's next model", () => {
    const route = resolveAiFeatureRoute({ choice: null, connected: ["GROQ"], feature: "CLASS_RECAP" });
    expect(route.primary?.model).toBe("qwen/qwen3.8-27b");
    expect(route.fallback).toEqual({ auto: true, model: "openai/gpt-oss-120b", provider: "GROQ" });
  });

  it("skips an Auto model the provider no longer offers", () => {
    const route = resolveAiFeatureRoute({
      choice: null,
      connected: ["GROQ", "GEMINI"],
      feature: "PLAY_REVIEW_COMMENT",
      offered: { GROQ: ["openai/gpt-oss-20b"] }
    });
    expect(route.primary).toMatchObject({ model: "gemini-3.1-flash-lite", provider: "GEMINI" });
    expect(route.fallback).toBeNull();
  });

  it("an operator's choice wins while its provider is connected, and falls back to Auto when not", () => {
    const choice = { fallback: null, fallbackOff: false, primary: { model: "nvidia/nemotron-3.5-super-vl:free", provider: "OPENROUTER" as const } };
    expect(resolveAiFeatureRoute({ choice, connected: ["OPENROUTER", "GROQ"], feature: "CLASS_RECAP" }).primary).toEqual({
      auto: false,
      model: "nvidia/nemotron-3.5-super-vl:free",
      provider: "OPENROUTER"
    });
    expect(resolveAiFeatureRoute({ choice, connected: ["GROQ"], feature: "CLASS_RECAP" }).primary).toMatchObject({ auto: true, provider: "GROQ" });
  });

  it("no fallback when switched off; never the main model as its own fallback", () => {
    const main = { model: "qwen/qwen3.8-27b", provider: "GROQ" as const };
    expect(
      resolveAiFeatureRoute({ choice: { fallback: null, fallbackOff: true, primary: null }, connected: ["GROQ", "GEMINI"], feature: "CLASS_RECAP" })
        .fallback
    ).toBeNull();
    const same = resolveAiFeatureRoute({ choice: { fallback: main, fallbackOff: false, primary: main }, connected: ["GROQ", "GEMINI"], feature: "CLASS_RECAP" });
    expect(same.fallback).toMatchObject({ auto: true, provider: "GEMINI" });
  });

  it("every feature's Auto list is non-empty", () => {
    for (const info of Object.values(AI_FEATURES)) expect(info.auto.length).toBeGreaterThan(0);
  });
});

describe("aiConsentCoveredProviders", () => {
  const current = (providers: string[]) => ({ allowed: true, providers, version: AI_REVIEW_CONSENT_VERSION });
  it("only the route's providers the consent named", () => {
    expect(aiConsentCoveredProviders(current(["GROQ"]), ["GROQ", "GEMINI"])).toEqual(["GROQ"]);
    expect(aiConsentCoveredProviders(current([]), ["GROQ"])).toEqual([]);
    expect(aiConsentCoveredProviders({ ...current(["GROQ"]), allowed: false }, ["GROQ"])).toEqual([]);
    expect(aiConsentCoveredProviders({ ...current(["GROQ"]), version: AI_REVIEW_CONSENT_VERSION - 1 }, ["GROQ"])).toEqual([]);
    expect(aiConsentCoveredProviders(null, ["GROQ"])).toEqual([]);
  });
});

describe("parseModelList", () => {
  it("keeps chat models, strips Gemini's prefix, marks OpenRouter's free ones first", () => {
    expect(parseModelList("GROQ", { data: [{ id: "qwen/qwen3.8-27b", context_window: 131072 }, { id: "whisper-large-v3" }, { active: false, id: "old" }] })).toEqual([
      { contextWindow: 131072, free: null, id: "qwen/qwen3.8-27b", name: null }
    ]);
    expect(parseModelList("GEMINI", { data: [{ id: "models/gemini-3.1-flash-lite" }, { id: "models/text-embedding-004" }] }).map((m) => m.id)).toEqual([
      "gemini-3.1-flash-lite"
    ]);
    const openrouter = parseModelList("OPENROUTER", {
      data: [
        { id: "a/paid", pricing: { completion: "0.0001", prompt: "0.0001" } },
        { id: "z/model:free", name: "Z (free)", pricing: { completion: "0", prompt: "0" } }
      ]
    });
    expect(openrouter.map((m) => [m.id, m.free])).toEqual([
      ["z/model:free", true],
      ["a/paid", false]
    ]);
    expect(parseModelList("GROQ", { error: "x" })).toEqual([]);
  });
});

describe("callChatModel", () => {
  const config: ChatModelConfig = {
    apiKey: "k",
    model: "openai/gpt-oss-20b",
    name: "Groq",
    provider: "OUTSIDE",
    providerId: "GROQ",
    timeoutMs: 5000,
    url: "https://api.groq.com/openai/v1"
  };
  const request = { json: true, maxTokens: 500, system: "s", temperature: 0, user: "u" };
  afterEach(() => jest.restoreAllMocks());

  it("retries once without JSON mode when Groq's JSON validation refuses the answer", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "json_validate_failed" } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'Here: {"recap":"x"}' } }] }), { status: 200 }));
    await expect(callChatModel(config, request, new AbortController().signal)).resolves.toContain('{"recap":"x"}');
    const bodies = fetchSpy.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>);
    expect(bodies[0].response_format).toEqual({ type: "json_object" });
    expect(bodies[1].response_format).toBeUndefined();
  });

  it("doesn't retry an overloaded model (that spends the daily quota)", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(new Response("busy", { status: 503 }));
    await expect(callChatModel(config, request, new AbortController().signal)).rejects.toMatchObject({ status: 503 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("our own server gets a seed and no thinking room; outside models get the room and no seed", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 }));
    await callChatModel({ ...config, apiKey: null, provider: "LOCAL", providerId: null }, request, new AbortController().signal);
    await callChatModel(config, request, new AbortController().signal);
    const [local, outside] = fetchSpy.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>);
    expect(local).toMatchObject({ max_tokens: 500, seed: 7 });
    expect(outside.max_tokens).toBe(4500);
    expect(outside.seed).toBeUndefined();
  });
});

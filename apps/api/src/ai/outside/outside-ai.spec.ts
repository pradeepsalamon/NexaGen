import type { PlayItem } from "@nexa-chess/types";
import { OpenAiCompatibleProvider, outsideAiConfigFromEnv, pseudonymisePlay } from "./outside-ai";

const item: PlayItem = {
  batchId: "batch_secret",
  classId: "class_secret",
  key: "MATCH:game_secret",
  playedAt: "2026-11-24T10:00:00.000Z",
  result: "1-0",
  review: null,
  segments: [
    {
      label: "Ananya's game in Rook batch",
      moves: [
        { byStudent: true, correct: null, elapsedMs: null, ply: 1, san: "e4", uci: "e2e4" },
        { byStudent: false, correct: null, elapsedMs: null, ply: 2, san: "e5", uci: "e7e5" }
      ],
      result: "1-0",
      startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      studentSide: "white"
    }
  ],
  source: "MATCH",
  sourceId: "game_secret",
  studentMoveCount: 1,
  title: "Ananya Kumar vs Ravi — Rook batch, Nexa Chess Academy"
};

describe("pseudonymisePlay", () => {
  it("sends chess facts only: no ids, names, titles, classes, batches or dates", () => {
    const payload = pseudonymisePlay(item, {
      accuracy: 80,
      findings: [{ bestMoveSan: "d4", fenBefore: "x", kind: "MISTAKE", motif: null, playedSan: "e4", ply: 1, segment: 0, winPercentLoss: 12 }]
    });
    const text = JSON.stringify(payload);
    for (const secret of ["secret", "Ananya", "Ravi", "Rook", "Nexa", "2026"]) expect(text).not.toContain(secret);
    expect(payload.segments[0].moves).toEqual(["*e4", "e5"]);
    expect(payload.findings[0]).toEqual({ better: "d4", kind: "MISTAKE", motif: null, moveNumber: 1, played: "e4", segment: 0 });
  });

  it("keeps a Storm puzzle's label (number and rating), nothing else's", () => {
    const rush = pseudonymisePlay({ ...item, segments: [{ ...item.segments[0], label: "Puzzle 3 (1200)" }], source: "RUSH" }, { accuracy: null, findings: [] });
    expect(rush.segments[0].label).toBe("Puzzle 3 (1200)");
  });
});

describe("outside AI provider", () => {
  const env = (over: Record<string, unknown>) =>
    ({ AI_REVIEW_PROVIDER_TIMEOUT_MS: 30000, ...over }) as unknown as Parameters<typeof outsideAiConfigFromEnv>[0];

  it("is off unless URL, key and model are all set", () => {
    expect(outsideAiConfigFromEnv(env({}))).toBeNull();
    expect(outsideAiConfigFromEnv(env({ AI_REVIEW_PROVIDER_API_KEY: "k", AI_REVIEW_PROVIDER_URL: "https://llm.example/v1" }))).toBeNull();
    expect(
      outsideAiConfigFromEnv(env({ AI_REVIEW_PROVIDER_API_KEY: "k", AI_REVIEW_PROVIDER_MODEL: "m", AI_REVIEW_PROVIDER_URL: "https://llm.example/v1/" }))
    ).toMatchObject({ model: "m", name: "llm.example", url: "https://llm.example/v1" });
  });

  it("never calls out without a configuration", async () => {
    const fetchSpy = jest.spyOn(global, "fetch");
    await expect(new OpenAiCompatibleProvider(null).comment(pseudonymisePlay(item, { accuracy: null, findings: [] }))).rejects.toThrow(
      "not configured"
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("posts the pseudonymised play to <url>/chat/completions and returns the text", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "  Nice opening!  " } }] }), { status: 200 })
    );
    const provider = new OpenAiCompatibleProvider({ apiKey: "key", model: "m1", name: "Test AI", timeoutMs: 5000, url: "https://llm.example/v1" });
    await expect(provider.comment(pseudonymisePlay(item, { accuracy: null, findings: [] }))).resolves.toBe("Nice opening!");
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://llm.example/v1/chat/completions");
    expect(String(init.body)).not.toContain("Ananya");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer key");
    fetchSpy.mockRestore();
  });
});

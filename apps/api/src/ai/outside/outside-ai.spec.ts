import type { PlayItem } from "@nexa-chess/types";
import type { ChatModelConfig } from "../chat-model";
import { OpenAiCompatibleProvider, pseudonymisePlay } from "./outside-ai";

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
  const config = (over: Partial<ChatModelConfig> = {}): ChatModelConfig => ({
    apiKey: "key",
    model: "m1",
    name: "Groq",
    provider: "OUTSIDE",
    providerId: "GROQ",
    timeoutMs: 5000,
    url: "https://llm.example/v1",
    ...over
  });
  const play = pseudonymisePlay(item, { accuracy: null, findings: [] });
  const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

  afterEach(() => jest.restoreAllMocks());

  it("never calls out with an empty route", async () => {
    const fetchSpy = jest.spyOn(global, "fetch");
    await expect(new OpenAiCompatibleProvider(() => []).comment([], play, new AbortController().signal)).rejects.toThrow("No model");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts the pseudonymised play to <url>/chat/completions with room for thinking", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(ok("  Nice opening!  "));
    const answer = await new OpenAiCompatibleProvider(() => []).comment([config()], play, new AbortController().signal);
    expect(answer.text).toBe("Nice opening!");
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://llm.example/v1/chat/completions");
    const body = JSON.parse(String(init.body)) as { max_tokens: number; seed?: number };
    expect(String(init.body)).not.toContain("Ananya");
    // 400 of its own + the outside thinking room (docs/ai/PROVIDER_EVAL.md §7.1).
    expect(body.max_tokens).toBe(4400);
    expect(body.seed).toBeUndefined();
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer key");
  });

  it("falls back to the second model when the first is out of quota", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(ok("From the fallback."));
    const answer = await new OpenAiCompatibleProvider(() => []).comment(
      [config(), config({ model: "m2", name: "Google Gemini", providerId: "GEMINI", url: "https://other.example/v1" })],
      play,
      new AbortController().signal
    );
    expect(answer).toMatchObject({ servedBy: { model: "m2", providerId: "GEMINI" }, text: "From the fallback." });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws the last error when every model fails", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response("overloaded", { status: 503 }));
    await expect(
      new OpenAiCompatibleProvider(() => []).comment([config(), config({ model: "m2" })], play, new AbortController().signal)
    ).rejects.toThrow("503");
  });
});

import { generateRecap, RecapDeferredError, RecapGenerationError } from "./class-recap.generator";

const FINAL = JSON.stringify({
  keyPoints: ["Develop pieces early", "Castle for king safety"],
  practice: ["Play two games"],
  recap: "Today you learned about the opening. We saw why development matters."
});

const line = (n: number) => `The coach explains idea number ${n} about the opening and development of pieces.`;

describe("generateRecap", () => {
  it("one part: a single call writes the recap", async () => {
    const complete = jest.fn(async () => FINAL);
    const result = await generateRecap({ chunkTokens: 5000, complete, lines: [line(1), line(2)] });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.calls).toBe(1);
    expect(result.content.keyPoints).toHaveLength(2);
  });

  it("several parts: points per part, then one call over all points", async () => {
    const complete = jest
      .fn()
      .mockResolvedValueOnce('{"points": ["Knights before bishops"]}')
      .mockResolvedValueOnce('{"points": ["S1 asked a question", "Castle early"]}')
      .mockResolvedValueOnce(FINAL);
    const result = await generateRecap({ chunkTokens: 25, complete, lines: [line(1), line(2)] });
    expect(complete).toHaveBeenCalledTimes(3);
    const finalPrompt = complete.mock.calls[2][0] as { user: string };
    // The S1 point never reaches the final call.
    expect(finalPrompt.user).toBe("1. Knights before bishops\n2. Castle early");
    expect(result.calls).toBe(3);
  });

  it("retries the final answer once with the problem, then succeeds", async () => {
    const complete = jest.fn().mockResolvedValueOnce('{"recap": "S1 won.", "keyPoints": []}').mockResolvedValueOnce(FINAL);
    const result = await generateRecap({ chunkTokens: 5000, complete, lines: [line(1)] });
    expect(complete).toHaveBeenCalledTimes(2);
    expect((complete.mock.calls[1][0] as { user: string }).user).toMatch(/previous answer could not be used/);
    expect(result.content.recap).toMatch(/opening/);
  });

  it("fails INVALID_OUTPUT after two unusable answers", async () => {
    const complete = jest.fn(async () => "not json");
    await expect(generateRecap({ chunkTokens: 5000, complete, lines: [line(1)] })).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("a model error is MODEL_ERROR", async () => {
    const complete = jest.fn(async () => {
      throw new Error("503");
    });
    const error = await generateRecap({ chunkTokens: 5000, complete, lines: [line(1)] }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecapGenerationError);
    expect((error as RecapGenerationError).code).toBe("MODEL_ERROR");
  });

  it("beforeCall can stop the run before any call (a class went live)", async () => {
    const complete = jest.fn(async () => FINAL);
    const beforeCall = jest.fn(async () => {
      throw new RecapDeferredError("live");
    });
    await expect(generateRecap({ beforeCall, chunkTokens: 5000, complete, lines: [line(1)] })).rejects.toBeInstanceOf(RecapDeferredError);
    expect(complete).not.toHaveBeenCalled();
  });

  it("no part gives a point: INVALID_OUTPUT without a final call", async () => {
    const complete = jest.fn(async () => '{"points": []}');
    await expect(generateRecap({ chunkTokens: 25, complete, lines: [line(1), line(2)] })).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
    expect(complete).toHaveBeenCalledTimes(2);
  });
});

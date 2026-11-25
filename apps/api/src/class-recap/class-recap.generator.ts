import {
  chunkTranscript,
  cleanRecapDraft,
  parseModelJson,
  readRecapPoints,
  recapFinalPrompt,
  recapPartPrompt,
  type ClassRecapContent,
  type RecapPrompt
} from "@nexa-chess/types";

/** Parts of one transcript sent to the model; a longer class keeps its first parts. */
export const MAX_RECAP_PARTS = 20;
const PART_MAX_TOKENS = 500;
const FINAL_MAX_TOKENS = 800;

export type RecapFailureCode = "MODEL_ERROR" | "INVALID_OUTPUT";

export class RecapGenerationError extends Error {
  constructor(
    readonly code: RecapFailureCode,
    message: string
  ) {
    super(message);
  }
}

/** Thrown by `beforeCall` (or an aborted call) when the run must stop and resume later. */
export class RecapDeferredError extends Error {}

export type RecapGenerationResult = {
  content: ClassRecapContent;
  calls: number;
  removed: number;
};

/**
 * Transcript lines (already pseudonymised) → a draft recap.
 *
 * One part: a single call writes the recap. Several parts (map → reduce):
 * each part's teaching points first, then one call turns them into the recap.
 * The final answer gets one repair retry; what still can't be used is an
 * INVALID_OUTPUT failure. `beforeCall` runs before every call (the live-class
 * check for the local model) and may throw `RecapDeferredError`.
 */
export async function generateRecap(input: {
  lines: string[];
  chunkTokens: number;
  complete: (prompt: RecapPrompt, maxTokens: number) => Promise<string>;
  beforeCall?: () => Promise<void>;
}): Promise<RecapGenerationResult> {
  let calls = 0;
  const call = async (prompt: RecapPrompt, maxTokens: number): Promise<string> => {
    await input.beforeCall?.();
    calls += 1;
    try {
      return await input.complete(prompt, maxTokens);
    } catch (error) {
      if (error instanceof RecapDeferredError) throw error;
      throw new RecapGenerationError("MODEL_ERROR", (error as Error).message);
    }
  };

  const parts = chunkTranscript(input.lines, input.chunkTokens).slice(0, MAX_RECAP_PARTS);
  if (parts.length === 0) throw new RecapGenerationError("INVALID_OUTPUT", "Nothing to summarise.");

  let finalPrompt: RecapPrompt;
  if (parts.length === 1) {
    finalPrompt = recapFinalPrompt({ transcript: parts[0] });
  } else {
    const points: string[] = [];
    for (const [index, part] of parts.entries()) {
      const answer = await call(recapPartPrompt(part, index, parts.length), PART_MAX_TOKENS);
      points.push(...readRecapPoints(parseModelJson(answer)));
    }
    if (points.length === 0) throw new RecapGenerationError("INVALID_OUTPUT", "No teaching points came back.");
    finalPrompt = recapFinalPrompt({ points });
  }

  const first = cleanRecapDraft(parseModelJson(await call(finalPrompt, FINAL_MAX_TOKENS)));
  if (first.content) return { calls, content: first.content, removed: first.removed };

  const repair: RecapPrompt = {
    system: finalPrompt.system,
    user: `${finalPrompt.user}\n\nYour previous answer could not be used (${first.problem}) Follow the rules and return only the JSON.`
  };
  const second = cleanRecapDraft(parseModelJson(await call(repair, FINAL_MAX_TOKENS)));
  if (second.content) return { calls, content: second.content, removed: second.removed };
  throw new RecapGenerationError("INVALID_OUTPUT", second.problem ?? "The answer couldn't be used.");
}

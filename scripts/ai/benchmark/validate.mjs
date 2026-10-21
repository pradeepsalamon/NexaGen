// Output schema + grounding validator for the capacity benchmark. Mirrors the
// Phase 3 design (AI_FOUNDATION.md §A.2/§A.3); the production validator will
// live in NestJS, this copy only scores the benchmark.
import { Chess } from "chess.js";
import { z } from "zod";

const evidenceRef = z.string().regex(/^E\d+$/);
const observation = z.object({ evidence: z.array(evidenceRef).min(1), text: z.string().min(1).max(400) });
const suggestion = z.object({ kind: z.enum(["PRACTICE", "NEXT_TOPIC", "HOMEWORK_IDEA"]), text: z.string().min(1).max(300) });

export const summarySchema = z.object({
  coach: z.object({
    lessonOverview: z.array(observation).min(1).max(6),
    nextLessonObjectives: z.array(suggestion).min(1).max(5),
    teachingObservations: z.array(observation).max(6),
    variations: z.array(z.object({ comment: z.string().max(300), fromEvidence: evidenceRef, san: z.string().min(1).max(200) })).max(4),
  }),
  student: z.object({
    keyConcepts: z.array(z.object({ evidence: z.array(evidenceRef).min(1), name: z.string().min(1).max(80) })).min(1).max(6),
    practiceIdeas: z.array(suggestion).min(1).max(5),
    recap: z.array(observation).min(1).max(6),
  }),
});

// JSON Schema handed to Ollama's `format` (structured output). Kept by hand so
// the script has no zod-to-json-schema dependency; summarySchema is the judge.
// The length and count limits must match summarySchema: Ollama's grammar
// enforces them while decoding, and without them the model wrote
// paragraph-long names (first real run, 2026-10-19).
const str = (maxLength) => ({ maxLength, minLength: 1, type: "string" });
const arr = (items, minItems, maxItems) => ({ items, maxItems, minItems, type: "array" });
const ref = { pattern: "^E[0-9]+$", type: "string" };
const refArray = arr(ref, 1, 8);
const obsJson = { properties: { evidence: refArray, text: str(400) }, required: ["text", "evidence"], type: "object" };
const sugJson = {
  properties: { kind: { enum: ["PRACTICE", "NEXT_TOPIC", "HOMEWORK_IDEA"], type: "string" }, text: str(300) },
  required: ["text", "kind"],
  type: "object",
};
export const summaryJsonSchema = {
  properties: {
    coach: {
      properties: {
        lessonOverview: arr(obsJson, 1, 6),
        nextLessonObjectives: arr(sugJson, 1, 5),
        teachingObservations: arr(obsJson, 0, 6),
        variations: arr(
          {
            properties: { comment: str(300), fromEvidence: ref, san: str(200) },
            required: ["san", "fromEvidence", "comment"],
            type: "object",
          },
          0,
          4,
        ),
      },
      required: ["lessonOverview", "variations", "teachingObservations", "nextLessonObjectives"],
      type: "object",
    },
    student: {
      properties: {
        keyConcepts: arr({ properties: { evidence: refArray, name: str(80) }, required: ["name", "evidence"], type: "object" }, 1, 6),
        practiceIdeas: arr(sugJson, 1, 5),
        recap: arr(obsJson, 1, 6),
      },
      required: ["recap", "keyConcepts", "practiceIdeas"],
      type: "object",
    },
  },
  required: ["coach", "student"],
  type: "object",
};

function mainlineSans(pgn) {
  const chess = new Chess();
  chess.loadPgn(pgn);
  return chess.history();
}

const stripMoveNumbers = (line) =>
  line
    .replace(/\d+\.(\.\.)?/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/[!?]+$/, ""))
    .filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));

// A variation is grounded only when its moves are a contiguous run of the
// referenced game's mainline (the Phase 3 rule is "replays from its PGN").
function sanRunInGame(san, pgn) {
  const run = stripMoveNumbers(san);
  if (run.length === 0) return false;
  const game = mainlineSans(pgn);
  for (let i = 0; i + run.length <= game.length; i += 1) {
    if (run.every((m, j) => game[i + j] === m)) return true;
  }
  return false;
}

// Returns { schemaValid, schemaErrors, violations[] }. Violations are grounding
// failures the Phase 3 validator would reject (it then retries once).
export function validateSummary(raw, bundle) {
  let parsed;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (error) {
    return { schemaErrors: [`invalid JSON: ${error.message}`], schemaValid: false, violations: [] };
  }
  const result = summarySchema.safeParse(parsed);
  if (!result.success) {
    return {
      schemaErrors: result.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
      schemaValid: false,
      violations: [],
    };
  }

  const summary = result.data;
  const byId = new Map(bundle.evidence.map((e) => [e.id, e]));
  const violations = [];
  const checkRefs = (where, refs) => {
    for (const ref of refs) if (!byId.has(ref)) violations.push(`${where}: unknown evidence ${ref}`);
  };

  summary.coach.lessonOverview.forEach((o, i) => checkRefs(`coach.lessonOverview[${i}]`, o.evidence));
  summary.coach.teachingObservations.forEach((o, i) => checkRefs(`coach.teachingObservations[${i}]`, o.evidence));
  summary.coach.variations.forEach((v, i) => {
    const source = byId.get(v.fromEvidence);
    if (!source) violations.push(`coach.variations[${i}]: unknown evidence ${v.fromEvidence}`);
    else if (source.kind !== "CHAPTER_PGN") violations.push(`coach.variations[${i}]: ${v.fromEvidence} is not a game`);
    else if (!sanRunInGame(v.san, source.pgn)) violations.push(`coach.variations[${i}]: "${v.san}" is not in ${v.fromEvidence}`);
  });
  summary.student.recap.forEach((o, i) => checkRefs(`student.recap[${i}]`, o.evidence));
  summary.student.keyConcepts.forEach((k, i) => checkRefs(`student.keyConcepts[${i}]`, k.evidence));

  const studentText = JSON.stringify(summary.student);
  if (/\bS\d+\b/.test(studentText)) violations.push("student: contains an S# pseudonym");

  const knownPuzzles = new Set(bundle.evidence.filter((e) => e.kind === "PUZZLE").map((e) => e.puzzleId));
  for (const id of JSON.stringify(summary).match(/\bpz_\d+_\d+\b/g) ?? []) {
    if (!knownPuzzles.has(id)) violations.push(`unknown puzzle id ${id}`);
  }

  return { schemaErrors: [], schemaValid: true, summary, violations };
}

// Rough fact recall until the Phase 3 golden set exists: share of the bundle's
// expected keywords the coach view mentions.
export function factRecall(summary, bundle) {
  const text = JSON.stringify(summary.coach).toLowerCase();
  const hits = bundle.expectFacts.filter((k) => text.includes(k.toLowerCase()));
  return hits.length / bundle.expectFacts.length;
}

// A known-good answer built straight from the bundle, for --self-test.
export function referenceSummary(bundle) {
  const pgn = bundle.evidence.find((e) => e.id === bundle.pgnRef).pgn;
  const firstMoves = mainlineSans(pgn).slice(0, 4).join(" ");
  const puzzle = bundle.evidence.find((e) => e.kind === "PUZZLE");
  return {
    coach: {
      lessonOverview: [{ evidence: ["E1", bundle.pgnRef], text: `Lesson on ${bundle.expectFacts.join(" and ")}.` }],
      nextLessonObjectives: [{ kind: "NEXT_TOPIC", text: "Revisit the model game." }],
      teachingObservations: [{ evidence: [puzzle.id], text: `S1 needs more ${puzzle.theme} practice (${puzzle.puzzleId}).` }],
      variations: [{ comment: "Opening moves", fromEvidence: bundle.pgnRef, san: firstMoves }],
    },
    student: {
      keyConcepts: [{ evidence: [bundle.pgnRef], name: bundle.expectFacts[0] }],
      practiceIdeas: [{ kind: "PRACTICE", text: "Replay the model game." }],
      recap: [{ evidence: ["E1"], text: "We studied a classic attacking game." }],
    },
  };
}

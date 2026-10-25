// Output schema + grounding for the capacity benchmark. The rules live in
// @nexa-chess/types (class-summary.ts), shared with the Phase 3 worker; this
// file only adapts them to the benchmark. Needs `npm run build -w @nexa-chess/types`
// (run-capacity-benchmark.sh does it).
import { createRequire } from "node:module";

const types = createRequire(import.meta.url)("@nexa-chess/types");

export const {
  buildSummaryLines,
  checkClassSummaryOutput,
  classSummaryOutputJsonSchema,
  formatSummaryLine,
  generateGroundedClassSummary,
  SUMMARY_MIN_KEPT_CLAIM_SHARE,
} = types;

export const summaryJsonSchema = classSummaryOutputJsonSchema();

// Rough fact recall until the Phase 3 golden set exists: share of the bundle's
// expected keywords the coach view mentions.
export function factRecall(summary, bundle) {
  const text = JSON.stringify(summary.coach).toLowerCase();
  const hits = bundle.expectFacts.filter((k) => text.includes(k.toLowerCase()));
  return hits.length / bundle.expectFacts.length;
}

// A known-good model answer for a bundle, for --self-test.
export function referenceOutput(bundle) {
  const puzzle = bundle.evidence.find((e) => e.kind === "PUZZLE");
  return {
    coach: {
      lessonOverview: [{ evidence: ["E1", bundle.pgnRef], text: `Lesson on ${bundle.expectFacts.join(" and ")}.` }],
      nextLessonObjectives: [{ kind: "NEXT_TOPIC", text: "Revisit the model game." }],
      teachingObservations: [{ evidence: [puzzle.id], text: `S1 needs more ${puzzle.theme} practice (${puzzle.puzzleId}).` }],
      variations: [{ comment: "The opening moves.", fromMove: 1, line: "L1", toMove: 2 }],
    },
    student: {
      keyConcepts: [{ evidence: [bundle.pgnRef], name: bundle.expectFacts[0] }],
      practiceIdeas: [{ kind: "PRACTICE", text: "Replay the model game." }],
      recap: [{ evidence: ["E1"], text: "We studied a classic attacking game." }],
    },
  };
}

// After-class summary grounding (docs/ai/architecture/PHASE3_SPEC.md §5–§6, ADR-008).
//
// Chess correctness is never delegated to the model:
//   - Move lines are built here from the evidence's `moves` (the SAN mainline
//     the evidence builder replayed from the stored game). The model only
//     points at a line and a move range and comments on it; the SAN shown to a
//     coach is rendered by `formatSummaryLine`, never copied from model output.
//   - Every chess token the model writes in prose (moves, squares, engine
//     scores, game results, puzzle ids) must appear in the evidence.
//   - One repair call; after that, unsupported items are removed instead of
//     failing or fabricating, and the summary is usable only if enough is left
//     (`assessClassSummaryUsability`, pre-registered for the 3a re-run).
//
// Pure module: no I/O, no chess library. Shared by the capacity benchmark
// (scripts/ai/benchmark/) and, once Phase 3 is approved, the NestJS worker.
import { z } from "zod";

export const CLASS_SUMMARY_SCHEMA_VERSION = "class_summary.v2";
export const CLASS_SUMMARY_GAME_EVIDENCE_KINDS = ["BOARD_GAME", "CHAPTER_PGN"] as const;
export const SUMMARY_MAX_LINE_PLIES = 120;
export const SUMMARY_MAX_VARIATION_MOVES = 6;
// "Usable" (INFRASTRUCTURE_DECISION.md §4.3): at least this share of the
// model's items survives removal of unsupported claims.
export const SUMMARY_MIN_KEPT_CLAIM_SHARE = 0.75;

// ---------------------------------------------------------------- evidence

export type SummaryEvidenceItem = {
  [key: string]: unknown;
  id: string;
  kind: string;
  /** Game kinds: SAN mainline replayed by code from the stored game. */
  moves?: string[];
  /** Game kinds: the position the mainline starts from (default: standard start). */
  startFen?: string;
  title?: string;
};

export type SummaryBundle = { evidence: SummaryEvidenceItem[] };

export const SUMMARY_STANDARD_START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type SummaryLine = {
  fromEvidence: string;
  id: string;
  /** Full-move number of each ply, same length as `moves`. */
  moveNumbers: number[];
  moves: string[];
  startFen: string;
  title: string;
  /** Whether the first ply is a White move. */
  whiteFirst: boolean;
};

function lineStart(startFen: string | undefined) {
  const fields = startFen?.trim().split(/\s+/) ?? [];
  const fullMove = Number.parseInt(fields[5] ?? "1", 10);
  return { fullMove: Number.isFinite(fullMove) && fullMove > 0 ? fullMove : 1, whiteFirst: fields[1] !== "b" };
}

/** One line per game item with moves, in evidence order: L1, L2, … */
export function buildSummaryLines(bundle: SummaryBundle): SummaryLine[] {
  const lines: SummaryLine[] = [];
  for (const item of bundle.evidence) {
    if (!(CLASS_SUMMARY_GAME_EVIDENCE_KINDS as readonly string[]).includes(item.kind)) continue;
    if (!Array.isArray(item.moves)) continue;
    const moves = item.moves.filter((m): m is string => typeof m === "string" && m.trim().length > 0).slice(0, SUMMARY_MAX_LINE_PLIES);
    if (moves.length === 0) continue;
    const { fullMove, whiteFirst } = lineStart(item.startFen);
    const moveNumbers = moves.map((_, ply) => fullMove + Math.floor((whiteFirst ? ply : ply + 1) / 2));
    lines.push({
      fromEvidence: item.id,
      id: `L${lines.length + 1}`,
      moveNumbers,
      moves,
      startFen: typeof item.startFen === "string" && item.startFen.trim() ? item.startFen.trim() : SUMMARY_STANDARD_START_FEN,
      title: typeof item.title === "string" ? item.title : item.id,
      whiteFirst,
    });
  }
  return lines;
}

const isWhitePly = (line: SummaryLine, ply: number) => (ply % 2 === 0) === line.whiteFirst;

/** "9. Nxb5 cxb5 10. Bxb5+" for the plies whose move number is in [fromMove, toMove]. */
export function formatSummaryLine(line: SummaryLine, fromMove?: number, toMove?: number): string {
  const from = fromMove ?? line.moveNumbers[0];
  const to = toMove ?? line.moveNumbers[line.moveNumbers.length - 1];
  const parts: string[] = [];
  line.moves.forEach((san, ply) => {
    const number = line.moveNumbers[ply];
    if (number < from || number > to) return;
    if (isWhitePly(line, ply)) parts.push(`${number}. ${san}`);
    else parts.push(parts.length === 0 ? `${number}... ${san}` : san);
  });
  return parts.join(" ");
}

// ---------------------------------------------------------------- model output

const evidenceRef = z.string().regex(/^E[0-9]+$/);
const evidenceRefs = z.array(evidenceRef).min(1).max(8);
const observation = z.object({ evidence: evidenceRefs, text: z.string().min(1).max(400) });
const suggestion = z.object({ kind: z.enum(["HOMEWORK_IDEA", "NEXT_TOPIC", "PRACTICE"]), text: z.string().min(1).max(300) });
const lineComment = z.object({
  comment: z.string().min(1).max(300),
  fromMove: z.number().int().min(1).max(500),
  line: z.string().regex(/^L[0-9]+$/),
  toMove: z.number().int().min(1).max(500),
});

/** What the model returns. Variations point at a code-built line; they carry no moves. */
export const classSummaryModelOutputSchema = z.object({
  coach: z.object({
    lessonOverview: z.array(observation).min(1).max(6),
    nextLessonObjectives: z.array(suggestion).min(1).max(5),
    teachingObservations: z.array(observation).max(6),
    variations: z.array(lineComment).max(4),
  }),
  student: z.object({
    keyConcepts: z.array(z.object({ evidence: evidenceRefs, name: z.string().min(1).max(80) })).min(1).max(6),
    practiceIdeas: z.array(suggestion).min(1).max(5),
    recap: z.array(observation).min(1).max(6),
  }),
});

export type ClassSummaryModelOutput = z.infer<typeof classSummaryModelOutputSchema>;

/** JSON Schema for a structured-output decoder (Ollama `format`); limits included. */
export function classSummaryOutputJsonSchema(): Record<string, unknown> {
  const { $schema: _schema, ...schema } = z.toJSONSchema(classSummaryModelOutputSchema) as Record<string, unknown>;
  return schema;
}

/** What a coach reviews: the model's items that survived, variations rendered by code. */
export type GroundedClassSummary = Omit<ClassSummaryModelOutput, "coach"> & {
  coach: Omit<ClassSummaryModelOutput["coach"], "variations"> & {
    variations: Array<z.infer<typeof lineComment> & { fromEvidence: string; san: string }>;
  };
};

// ---------------------------------------------------------------- grounding

export type SummaryViolation = { path: string; reason: string };

const SAN_TOKEN = /(?<![A-Za-z0-9])(O-O-O|O-O|0-0-0|0-0|[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[a-h]x[a-h][1-8](?:=[QRBN])?[+#]?|[a-h][1-8](?:=[QRBN])?[+#]?)(?![A-Za-z0-9])/g;
const EVALUATION_TOKEN = /(?<![\w.])[+\-−]\d+\.\d+(?![\w.])/g;
const RESULT_TOKEN = /(?<![\d/½])(1-0|0-1|1\/2-1\/2|½-½)(?![\d/½])/g;
// Internal student identifiers: the S1, S2, … pseudonyms (also "S 1", "S-1",
// "s1") and "student 3" / "student #3". The letter must stand alone, so
// "Bus 2", "moves 1" or "S-shaped" don't match, and no chess token is an S
// followed by digits.
const STUDENT_IDENTIFIER = /(?<![A-Za-z0-9])(?:[Ss][ -]?\d{1,3}|[Ss]tudent\s*#?\s*\d{1,3})(?![0-9])/g;
const DEFAULT_PUZZLE_ID = /\bpz_[0-9]+_[0-9]+\b/g;

/** Squares holding a piece in a FEN's placement field. */
function occupiedSquares(fen: string): string[] {
  const squares: string[] = [];
  (fen.split(/\s+/)[0] ?? "").split("/").forEach((row, r) => {
    let file = 0;
    for (const ch of row) {
      if (/[1-8]/.test(ch)) file += Number(ch);
      else {
        if (file < 8 && r < 8) squares.push(`${"abcdefgh"[file]}${8 - r}`);
        file += 1;
      }
    }
  });
  return squares;
}

const CASTLING_SQUARES: Record<string, Record<"b" | "w", string[]>> = {
  "O-O": { b: ["f8", "g8"], w: ["f1", "g1"] },
  "O-O-O": { b: ["c8", "d8"], w: ["c1", "d1"] },
};

const normalizeSan = (san: string) => san.replace(/[+#!?]+$/, "").replace(/^0-0-0$/, "O-O-O").replace(/^0-0$/, "O-O");
const SQUARE = /^[a-h][1-8]$/;

function collectStrings(value: unknown, out: string[], skipKey?: string) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) if (key !== skipKey) collectStrings(v, out);
  }
}

type GroundingFacts = {
  corpus: string;
  evidenceIds: Set<string>;
  lines: Map<string, SummaryLine>;
  puzzleIds: Set<string>;
  sans: Set<string>;
  squares: Set<string>;
};

function groundingFacts(bundle: SummaryBundle, lines: SummaryLine[]): GroundingFacts {
  const texts: string[] = [];
  bundle.evidence.forEach((item) => collectStrings(item, texts, "moves"));
  const sans = new Set<string>();
  const squares = new Set<string>();
  const addSan = (token: string) => {
    const san = normalizeSan(token);
    sans.add(san);
    for (const square of san.match(/[a-h][1-8]/g) ?? []) squares.add(square);
  };
  // A square is grounded when a piece stands on it at the start of a line, a
  // move lands on it, or the evidence text mentions it.
  lines.forEach((line) => {
    occupiedSquares(line.startFen).forEach((square) => squares.add(square));
    line.moves.forEach((san, ply) => {
      addSan(san);
      CASTLING_SQUARES[normalizeSan(san)]?.[isWhitePly(line, ply) ? "w" : "b"].forEach((square) => squares.add(square));
    });
  });
  for (const text of texts) for (const match of text.matchAll(SAN_TOKEN)) addSan(match[1]);
  const puzzleIds = new Set(bundle.evidence.map((e) => e.puzzleId).filter((id): id is string => typeof id === "string"));
  return {
    corpus: texts.join("\n"),
    evidenceIds: new Set(bundle.evidence.map((e) => e.id)),
    lines: new Map(lines.map((l) => [l.id, l])),
    puzzleIds,
    sans,
    squares,
  };
}

function textProblems(text: string, facts: GroundingFacts, puzzleIdPattern: RegExp, studentView: boolean): string[] {
  const problems: string[] = [];
  for (const match of text.matchAll(SAN_TOKEN)) {
    const san = normalizeSan(match[1]);
    const known = SQUARE.test(san) ? facts.squares.has(san) : facts.sans.has(san);
    if (!known) problems.push(`"${match[1]}" is not a move or square in the evidence`);
  }
  for (const match of text.matchAll(EVALUATION_TOKEN)) {
    if (!facts.corpus.includes(match[0])) problems.push(`engine score "${match[0]}" is not in the evidence`);
  }
  for (const match of text.matchAll(RESULT_TOKEN)) {
    if (!facts.corpus.includes(match[1])) problems.push(`result "${match[1]}" is not in the evidence`);
  }
  for (const match of text.matchAll(new RegExp(puzzleIdPattern.source, "g"))) {
    if (!facts.puzzleIds.has(match[0])) problems.push(`puzzle "${match[0]}" is not in the evidence`);
  }
  if (studentView) {
    const ids = findStudentIdentifiers(text);
    if (ids.length) problems.push(`the student view names a student (S#: ${ids.join(", ")})`);
  }
  return problems;
}

/** Internal student identifiers in a string, in order of appearance. */
export function findStudentIdentifiers(text: string): string[] {
  return [...text.matchAll(STUDENT_IDENTIFIER)].map((m) => m[0]);
}

export type StudentPrivacyViolation = { identifiers: string[]; path: string };

/**
 * Every string anywhere in a student-facing object (any field, at any depth)
 * that names a student by an internal identifier. The student view must
 * return []: the summary gate here, and the Phase 3 publish route (§7).
 */
export function studentViewPrivacyViolations(studentView: unknown, path = "student"): StudentPrivacyViolation[] {
  if (typeof studentView === "string") {
    const identifiers = findStudentIdentifiers(studentView);
    return identifiers.length ? [{ identifiers, path }] : [];
  }
  if (Array.isArray(studentView)) return studentView.flatMap((v, i) => studentViewPrivacyViolations(v, `${path}.${i}`));
  if (studentView && typeof studentView === "object") {
    return Object.entries(studentView).flatMap(([key, v]) => studentViewPrivacyViolations(v, `${path}.${key}`));
  }
  return [];
}

/** A variation range shortened to stay inside its game and the move cap. */
export type SummaryRangeAdjustment = { applied: [number, number]; path: string; requested: [number, number] };

export type ClassSummaryCheck =
  | { claimCount: 0; ok: false; schemaErrors: string[] }
  | {
      adjustments: SummaryRangeAdjustment[];
      claimCount: number;
      ok: true;
      /** With over-long variation ranges already shortened (`adjustments`). */
      output: ClassSummaryModelOutput;
      violations: SummaryViolation[];
    };

export type ClassSummaryCheckOptions = { lines?: SummaryLine[]; puzzleIdPattern?: RegExp };

/** Parses model output and lists every unsupported item (path = "section.field.index"). */
export function checkClassSummaryOutput(raw: unknown, bundle: SummaryBundle, options: ClassSummaryCheckOptions = {}): ClassSummaryCheck {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return { claimCount: 0, ok: false, schemaErrors: [`invalid JSON: ${(error as Error).message}`] };
    }
  }
  const result = classSummaryModelOutputSchema.safeParse(parsed);
  if (!result.success) {
    return {
      claimCount: 0,
      ok: false,
      schemaErrors: result.error.issues.slice(0, 8).map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    };
  }

  const output = result.data;
  const adjustments: SummaryRangeAdjustment[] = [];
  const facts = groundingFacts(bundle, options.lines ?? buildSummaryLines(bundle));
  const puzzleIdPattern = options.puzzleIdPattern ?? DEFAULT_PUZZLE_ID;
  const violations: SummaryViolation[] = [];
  const flag = (path: string, reasons: string[]) => reasons.forEach((reason) => violations.push({ path, reason }));
  const refProblems = (refs: string[]) => refs.filter((ref) => !facts.evidenceIds.has(ref)).map((ref) => `unknown evidence ${ref}`);

  const observations = (section: string, items: Array<{ evidence: string[]; text: string }>, studentView: boolean) =>
    items.forEach((item, i) =>
      flag(`${section}.${i}`, [...refProblems(item.evidence), ...textProblems(item.text, facts, puzzleIdPattern, studentView)]),
    );
  const suggestions = (section: string, items: Array<{ text: string }>, studentView: boolean) =>
    items.forEach((item, i) => flag(`${section}.${i}`, textProblems(item.text, facts, puzzleIdPattern, studentView)));

  observations("coach.lessonOverview", output.coach.lessonOverview, false);
  observations("coach.teachingObservations", output.coach.teachingObservations, false);
  suggestions("coach.nextLessonObjectives", output.coach.nextLessonObjectives, false);
  output.coach.variations.forEach((v, i) => {
    const path = `coach.variations.${i}`;
    const line = facts.lines.get(v.line);
    if (!line) return flag(path, [`unknown line ${v.line}`]);
    const first = line.moveNumbers[0];
    const last = line.moveNumbers[line.moveNumbers.length - 1];
    const range: string[] = [];
    if (v.fromMove > v.toMove) range.push(`fromMove ${v.fromMove} is after toMove ${v.toMove}`);
    else if (v.fromMove < first || v.fromMove > last) range.push(`move ${v.fromMove} is outside ${v.line} (${first}–${last})`);
    else {
      // The start is in the game: shorten the end to the game's last move and
      // to the move cap. The moves still come from the game, so this can't
      // invent anything; a start outside the game can't be repaired.
      const toMove = Math.min(v.toMove, last, v.fromMove + SUMMARY_MAX_VARIATION_MOVES - 1);
      if (toMove !== v.toMove) {
        adjustments.push({ applied: [v.fromMove, toMove], path, requested: [v.fromMove, v.toMove] });
        output.coach.variations[i] = { ...v, toMove };
      }
    }
    flag(path, [...range, ...textProblems(v.comment, facts, puzzleIdPattern, false)]);
  });
  observations("student.recap", output.student.recap, true);
  output.student.keyConcepts.forEach((k, i) =>
    flag(`student.keyConcepts.${i}`, [...refProblems(k.evidence), ...textProblems(k.name, facts, puzzleIdPattern, true)]),
  );
  suggestions("student.practiceIdeas", output.student.practiceIdeas, true);

  const claimCount =
    output.coach.lessonOverview.length +
    output.coach.teachingObservations.length +
    output.coach.nextLessonObjectives.length +
    output.coach.variations.length +
    output.student.recap.length +
    output.student.keyConcepts.length +
    output.student.practiceIdeas.length;
  return { adjustments, claimCount, ok: true, output, violations };
}

/** Problems as one-line strings, for the repair prompt. */
export const describeSummaryViolations = (violations: SummaryViolation[]) => violations.map((v) => `${v.path}: ${v.reason}`);

// ---------------------------------------------------------------- removal + usability

/** Drops every item with a violation and renders variations from the lines. */
export function pruneClassSummary(
  output: ClassSummaryModelOutput,
  violations: SummaryViolation[],
  lines: SummaryLine[],
): { removedPaths: string[]; summary: GroundedClassSummary } {
  const bad = new Set(violations.map((v) => v.path));
  const keep = <T>(section: string, items: T[]) => items.filter((_, i) => !bad.has(`${section}.${i}`));
  const byId = new Map(lines.map((l) => [l.id, l]));
  return {
    removedPaths: [...bad].sort(),
    summary: {
      coach: {
        lessonOverview: keep("coach.lessonOverview", output.coach.lessonOverview),
        nextLessonObjectives: keep("coach.nextLessonObjectives", output.coach.nextLessonObjectives),
        teachingObservations: keep("coach.teachingObservations", output.coach.teachingObservations),
        variations: keep("coach.variations", output.coach.variations).map((v) => {
          const line = byId.get(v.line) as SummaryLine; // kept ⇒ the line exists
          return { ...v, fromEvidence: line.fromEvidence, san: formatSummaryLine(line, v.fromMove, v.toMove) };
        }),
      },
      student: {
        keyConcepts: keep("student.keyConcepts", output.student.keyConcepts),
        practiceIdeas: keep("student.practiceIdeas", output.student.practiceIdeas),
        recap: keep("student.recap", output.student.recap),
      },
    },
  };
}

export type ClassSummaryUsability = { keptShare: number; reasons: string[]; usable: boolean };

/**
 * Pre-registered rule (INFRASTRUCTURE_DECISION.md §4.3). A summary is usable when,
 * after the repair retry and removal of unsupported items:
 *   1. every required section still has an item (overview, next objectives,
 *      recap, key concepts, practice ideas), and
 *   2. at least SUMMARY_MIN_KEPT_CLAIM_SHARE of the model's items were kept.
 * Schema-invalid output is never usable.
 */
export function assessClassSummaryUsability(summary: GroundedClassSummary, claimCount: number, removedCount: number): ClassSummaryUsability {
  const reasons: string[] = [];
  const required: Array<[string, unknown[]]> = [
    ["coach.lessonOverview", summary.coach.lessonOverview],
    ["coach.nextLessonObjectives", summary.coach.nextLessonObjectives],
    ["student.keyConcepts", summary.student.keyConcepts],
    ["student.practiceIdeas", summary.student.practiceIdeas],
    ["student.recap", summary.student.recap],
  ];
  for (const [section, items] of required) if (items.length === 0) reasons.push(`${section} is empty after removing unsupported items`);
  const keptShare = claimCount === 0 ? 0 : (claimCount - removedCount) / claimCount;
  if (keptShare < SUMMARY_MIN_KEPT_CLAIM_SHARE) {
    reasons.push(`only ${Math.round(keptShare * 100)}% of items were supported (minimum ${SUMMARY_MIN_KEPT_CLAIM_SHARE * 100}%)`);
  }
  return { keptShare, reasons, usable: reasons.length === 0 };
}

/** The coach-facing summary back in model-output shape, for re-checking (it must have no violations). */
function toModelOutput(summary: GroundedClassSummary): ClassSummaryModelOutput {
  return {
    ...summary,
    coach: { ...summary.coach, variations: summary.coach.variations.map(({ comment, fromMove, line, toMove }) => ({ comment, fromMove, line, toMove })) },
  };
}

// ---------------------------------------------------------------- generation policy

export type ClassSummaryAttempt = {
  adjustments: SummaryRangeAdjustment[];
  claimCount: number;
  /** Student-view items naming a student, before removal. */
  privacyViolations: number;
  schemaErrors: string[];
  schemaValid: boolean;
  violations: SummaryViolation[];
};

export type GroundedClassSummaryResult = {
  adjustments: SummaryRangeAdjustment[];
  attempts: 1 | 2;
  failureCode?: "GROUNDING" | "RUNTIME" | "SCHEMA";
  firstAttempt?: ClassSummaryAttempt;
  finalAttempt?: ClassSummaryAttempt;
  lines: SummaryLine[];
  /** Student-identifier hits left in the delivered student view; must be 0 for READY. */
  privacyResidual: number;
  removedPaths: string[];
  /** Violations left in the coach-facing summary; 0 by construction (a leak check). */
  residualViolations: number;
  runtimeError?: string;
  /** Which answer the summary was built from (see `selectClassSummaryCandidate`). */
  selectedAttempt?: 1 | 2;
  /** DEFERRED: `beforeRetry` declined the repair call (e.g. a class went live). */
  status: "DEFERRED" | "FAILED" | "READY";
  summary?: GroundedClassSummary;
  usability?: ClassSummaryUsability;
};

export type ClassSummaryGenerate = (request: { attempt: 1 | 2; lines: SummaryLine[]; problems: string[] }) => Promise<string>;

const isStudentPrivacyViolation = (v: SummaryViolation) => v.reason.startsWith("the student view names a student");

const toAttempt = (check: ClassSummaryCheck): ClassSummaryAttempt =>
  check.ok
    ? {
        adjustments: check.adjustments,
        claimCount: check.claimCount,
        privacyViolations: new Set(check.violations.filter(isStudentPrivacyViolation).map((v) => v.path)).size,
        schemaErrors: [],
        schemaValid: true,
        violations: check.violations,
      }
    : { adjustments: [], claimCount: 0, privacyViolations: 0, schemaErrors: check.schemaErrors, schemaValid: false, violations: [] };

/** One schema-valid answer after removal of its unsupported items, with every gate evaluated. */
export type ClassSummaryCandidate = {
  adjustments: SummaryRangeAdjustment[];
  attempt: 1 | 2;
  privacyResidual: number;
  ready: boolean;
  removedPaths: string[];
  residualViolations: number;
  summary: GroundedClassSummary;
  unsupportedItems: number;
  usability: ClassSummaryUsability;
};

function toCandidate(
  attempt: 1 | 2,
  check: Extract<ClassSummaryCheck, { ok: true }>,
  bundle: SummaryBundle,
  options: ClassSummaryCheckOptions & { lines: SummaryLine[] },
): ClassSummaryCandidate {
  const { removedPaths, summary } = pruneClassSummary(check.output, check.violations, options.lines);
  const usability = assessClassSummaryUsability(summary, check.claimCount, removedPaths.length);
  const residual = checkClassSummaryOutput(toModelOutput(summary), bundle, options);
  const residualViolations = residual.ok ? residual.violations.length : 1;
  const privacyResidual = studentViewPrivacyViolations(summary.student).length;
  return {
    adjustments: check.adjustments,
    attempt,
    privacyResidual,
    ready: usability.usable && residualViolations === 0 && privacyResidual === 0,
    removedPaths,
    residualViolations,
    summary,
    unsupportedItems: removedPaths.length,
    usability,
  };
}

/**
 * Deterministic choice between the first answer and the repair. Both have
 * already passed the same schema, grounding and privacy checks; a candidate
 * that fails any gate is never READY, whichever is picked. In order:
 *   1. a READY candidate beats one that isn't;
 *   2. fewer unsupported items removed;
 *   3. a larger share of items kept;
 *   4. the repair (it answered the listed problems).
 */
export function selectClassSummaryCandidate(candidates: ClassSummaryCandidate[]): ClassSummaryCandidate | undefined {
  return [...candidates].sort(
    (a, b) =>
      Number(b.ready) - Number(a.ready) ||
      a.unsupportedItems - b.unsupportedItems ||
      b.usability.keptShare - a.usability.keptShare ||
      b.attempt - a.attempt,
  )[0];
}

/**
 * One generation, at most one repair retry on any schema error or violation,
 * removal of whatever is still unsupported, then the better of the two
 * answers. Never invents content.
 */
export async function generateGroundedClassSummary(input: {
  beforeRetry?: () => Promise<boolean> | boolean;
  bundle: SummaryBundle;
  generate: ClassSummaryGenerate;
  puzzleIdPattern?: RegExp;
}): Promise<GroundedClassSummaryResult> {
  const lines = buildSummaryLines(input.bundle);
  const options = { lines, puzzleIdPattern: input.puzzleIdPattern };
  const base = { adjustments: [] as SummaryRangeAdjustment[], lines, privacyResidual: 0, removedPaths: [] as string[], residualViolations: 0 };

  let raw: string;
  try {
    raw = await input.generate({ attempt: 1, lines, problems: [] });
  } catch (error) {
    return { ...base, attempts: 1, failureCode: "RUNTIME", runtimeError: (error as Error).message, status: "FAILED" };
  }
  const first = checkClassSummaryOutput(raw, input.bundle, options);
  const firstAttempt = toAttempt(first);
  const checks: Array<[1 | 2, ClassSummaryCheck]> = [[1, first]];
  let attempts: 1 | 2 = 1;
  let runtimeError: string | undefined;

  if (!first.ok || first.violations.length > 0) {
    if (input.beforeRetry && !(await input.beforeRetry())) return { ...base, attempts, firstAttempt, status: "DEFERRED" };
    const problems = first.ok ? describeSummaryViolations(first.violations) : first.schemaErrors;
    attempts = 2;
    try {
      raw = await input.generate({ attempt: 2, lines, problems });
      checks.push([2, checkClassSummaryOutput(raw, input.bundle, options)]);
    } catch (error) {
      runtimeError = (error as Error).message; // the first answer can still be used if it is good enough
    }
  }

  const finalAttempt = attempts === 2 && checks.length === 2 ? toAttempt(checks[1][1]) : attempts === 1 ? firstAttempt : undefined;
  const candidates = checks
    .filter((entry): entry is [1 | 2, Extract<ClassSummaryCheck, { ok: true }>] => entry[1].ok)
    .map(([attempt, check]) => toCandidate(attempt, check, input.bundle, options));
  const chosen = selectClassSummaryCandidate(candidates);
  const common = { attempts, finalAttempt, firstAttempt, lines, runtimeError };
  if (!chosen) {
    return { ...base, ...common, failureCode: runtimeError ? "RUNTIME" : "SCHEMA", status: "FAILED" };
  }
  return {
    ...common,
    adjustments: chosen.adjustments,
    failureCode: chosen.ready ? undefined : runtimeError ? "RUNTIME" : "GROUNDING",
    privacyResidual: chosen.privacyResidual,
    removedPaths: chosen.removedPaths,
    residualViolations: chosen.residualViolations,
    selectedAttempt: chosen.attempt,
    status: chosen.ready ? "READY" : "FAILED",
    summary: chosen.summary,
    usability: chosen.usability,
  };
}

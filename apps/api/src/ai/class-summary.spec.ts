import {
  assessClassSummaryUsability,
  buildSummaryLines,
  checkClassSummaryOutput,
  classSummaryOutputJsonSchema,
  findStudentIdentifiers,
  formatSummaryLine,
  generateGroundedClassSummary,
  selectClassSummaryCandidate,
  studentViewPrivacyViolations,
  type ClassSummaryCandidate,
  type ClassSummaryModelOutput,
  type SummaryBundle,
} from "@nexa-chess/types";
import { Chess } from "../common/chess/chess";

// Grounding rules for after-class summaries (PHASE3_SPEC.md §5–§6, ADR-008).
// Games are replayed with the same Chess wrapper the evidence builder will use.

const OPERA =
  "1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0";

function replay(pgn: string): string[] {
  const chess = new Chess();
  chess.loadPgn(pgn);
  return chess.history();
}

function bundle(overrides: Partial<{ games: boolean }> = {}): SummaryBundle {
  const games = overrides.games ?? true;
  return {
    evidence: [
      { id: "E1", kind: "CLASS", title: "Rapid development and the power of pins" },
      ...(games ? [{ id: "E2", kind: "CHAPTER_PGN", moves: replay(OPERA), pgn: OPERA, title: "Opera Game" }] : []),
      { id: "E3", kind: "PUZZLE", puzzleId: "pz_0_1", results: [{ seconds: 40, solved: true, student: "S1" }], theme: "pin" },
      { id: "E4", kind: "POLL", options: [{ san: "Nxf7", votes: 2 }], question: "Best move for White?" },
      { id: "E5", kind: "ROOM_CHAT", from: "S2", text: "what if black plays h6 first?" },
    ],
  };
}

function goodOutput(withVariation = true): ClassSummaryModelOutput {
  return {
    coach: {
      lessonOverview: [{ evidence: ["E1", "E2"], text: "We studied development and pins through the Opera Game." }],
      nextLessonObjectives: [{ kind: "NEXT_TOPIC", text: "Pins against an uncastled king." }],
      teachingObservations: [{ evidence: ["E3"], text: "S1 solved pz_0_1 quickly." }],
      variations: withVariation ? [{ comment: "The knight sacrifice opens the b-file.", fromMove: 10, line: "L1", toMove: 11 }] : [],
    },
    student: {
      keyConcepts: [{ evidence: ["E2"], name: "Pins" }],
      practiceIdeas: [{ kind: "PRACTICE", text: "Replay the Opera Game from move 10." }],
      recap: [{ evidence: ["E2"], text: "White's Bg5 pinned the knight and Rd8 delivered mate." }],
    },
  };
}

const json = (value: unknown) => JSON.stringify(value);

describe("class summary lines", () => {
  it("builds lines only from game evidence with moves, numbered by evidence order", () => {
    const b = bundle();
    b.evidence.push({ id: "E6", kind: "CHAPTER_PGN", moves: [], title: "Empty chapter" });
    b.evidence.push({ id: "E7", kind: "CHAPTER_PGN", title: "Chapter without moves" });
    b.evidence.push({ id: "E8", kind: "BOARD_GAME", moves: replay("1. d4 d5 2. c4"), title: "Class game" });
    const lines = buildSummaryLines(b);
    expect(lines.map((l) => [l.id, l.fromEvidence])).toEqual([
      ["L1", "E2"],
      ["L2", "E8"],
    ]);
  });

  it("renders SAN from the replayed game, never from model text", () => {
    const [line] = buildSummaryLines(bundle());
    expect(formatSummaryLine(line, 10, 11)).toBe("10. Nxb5 cxb5 11. Bxb5+ Nbd7");
    expect(formatSummaryLine(line, 17, 17)).toBe("17. Rd8#");
  });

  it("numbers moves from a set-up position where Black moves first", () => {
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 3 3";
    const chess = new Chess(fen);
    ["Nf6", "Nc3", "Bb4"].forEach((san) => chess.move(san));
    const [line] = buildSummaryLines({ evidence: [{ id: "E1", kind: "CHAPTER_PGN", moves: chess.history(), startFen: fen }] });
    expect(line.moveNumbers).toEqual([3, 4, 4]);
    expect(formatSummaryLine(line)).toBe("3... Nf6 4. Nc3 Bb4");
  });

  it("caps a line at 120 plies", () => {
    const moves = Array.from({ length: 200 }, (_, i) => (i % 4 < 2 ? ["Nf3", "Nf6"][i % 2] : ["Ng1", "Ng8"][i % 2]));
    const [line] = buildSummaryLines({ evidence: [{ id: "E1", kind: "BOARD_GAME", moves }] });
    expect(line.moves).toHaveLength(120);
  });

  it("gives Ollama a JSON Schema that carries the length and count limits", () => {
    const schema = json(classSummaryOutputJsonSchema());
    expect(schema).toContain('"maxLength":400');
    expect(schema).toContain('"maxItems":4');
    expect(schema).not.toContain('"san"'); // the model is never asked for moves
  });
});

describe("checkClassSummaryOutput", () => {
  it("accepts a grounded summary", () => {
    const check = checkClassSummaryOutput(json(goodOutput()), bundle());
    expect(check.ok && check.violations).toEqual([]);
  });

  it("rejects malformed output as a schema error", () => {
    expect(checkClassSummaryOutput("{not json", bundle()).ok).toBe(false);
    expect(checkClassSummaryOutput({ coach: goodOutput().coach }, bundle()).ok).toBe(false);
    const legacy = goodOutput() as unknown as { coach: { variations: unknown[] } };
    legacy.coach.variations = [{ comment: "x", fromEvidence: "E2", san: "1. e4 e5" }]; // v1 shape: model-written moves
    expect(checkClassSummaryOutput(legacy, bundle()).ok).toBe(false);
  });

  it("flags moves in prose that the evidence doesn't contain", () => {
    const output = goodOutput();
    output.coach.lessonOverview[0].text = "After Qh5 White wins.";
    output.student.recap[0].text = "Black should have played Nxe4.";
    const check = checkClassSummaryOutput(output, bundle());
    expect(check.ok && check.violations.map((v) => v.path)).toEqual(["coach.lessonOverview.0", "student.recap.0"]);
  });

  it("accepts moves from games, polls and chat, and squares that occur in them", () => {
    const output = goodOutput();
    output.coach.teachingObservations[0].text = "The poll favoured Nxf7, S2 asked about h6, and Bxb5+ hit the king on e8.";
    const check = checkClassSummaryOutput(output, bundle());
    expect(check.ok && check.violations).toEqual([]);
  });

  it("flags a square no piece stood on, moved to, or the evidence mentions", () => {
    const output = goodOutput();
    output.coach.lessonOverview[0].text = "The weak a5 square decided the game.";
    const check = checkClassSummaryOutput(output, bundle());
    expect(check.ok && check.violations.map((v) => v.reason)).toEqual(['"a5" is not a move or square in the evidence']);
  });

  it("flags invented engine scores and results", () => {
    const output = goodOutput();
    output.coach.lessonOverview[0].text = "White was +3.5 after move 10.";
    output.coach.nextLessonObjectives[0].text = "Explain why the game ended 0-1.";
    const check = checkClassSummaryOutput(output, bundle());
    expect(check.ok && check.violations.map((v) => v.reason)).toEqual([
      'engine score "+3.5" is not in the evidence',
      'result "0-1" is not in the evidence',
    ]);
  });

  it("flags variations on an unknown line, starting outside the game, or reversed", () => {
    const output = goodOutput();
    output.coach.variations = [
      { comment: "a", fromMove: 1, line: "L9", toMove: 2 },
      { comment: "b", fromMove: 18, line: "L1", toMove: 19 },
      { comment: "c", fromMove: 5, line: "L1", toMove: 4 },
    ];
    const check = checkClassSummaryOutput(output, bundle());
    expect(check.ok && check.violations.map((v) => v.reason)).toEqual([
      "unknown line L9",
      "move 18 is outside L1 (1–17)",
      "fromMove 5 is after toMove 4",
    ]);
  });

  it("flags unknown evidence refs, unknown puzzles and S# in the student view", () => {
    const output = goodOutput();
    output.coach.lessonOverview[0].evidence = ["E99"];
    output.coach.teachingObservations[0].text = "S1 also solved pz_9_9.";
    output.student.practiceIdeas[0].text = "S2 should practise pins.";
    const check = checkClassSummaryOutput(output, bundle());
    expect(check.ok && check.violations.map((v) => v.path)).toEqual([
      "coach.lessonOverview.0",
      "coach.teachingObservations.0",
      "student.practiceIdeas.0",
    ]);
  });

  it("with no games, any variation is unsupported", () => {
    const check = checkClassSummaryOutput(goodOutput(), bundle({ games: false }));
    expect(check.ok && check.violations.some((v) => v.reason === "unknown line L1")).toBe(true);
  });
});

describe("variation ranges are capped at six moves from the game", () => {
  const withRange = (fromMove: number, toMove: number) => {
    const output = goodOutput();
    output.coach.variations = [{ comment: "Key line.", fromMove, line: "L1", toMove }];
    return output;
  };
  const rendered = async (fromMove: number, toMove: number) => {
    const result = await generateGroundedClassSummary({ bundle: bundle(), generate: async () => json(withRange(fromMove, toMove)) });
    return { result, variation: result.summary?.coach.variations[0] };
  };

  it("keeps a six-move range as asked", async () => {
    const check = checkClassSummaryOutput(withRange(9, 14), bundle());
    expect(check.ok && [check.violations, check.adjustments]).toEqual([[], []]);
    const { variation } = await rendered(9, 14);
    expect(variation).toMatchObject({ fromMove: 9, toMove: 14 });
  });

  it("shortens a seven-move range to the first six moves of the game, in game order", async () => {
    const check = checkClassSummaryOutput(withRange(9, 15), bundle());
    expect(check.ok && check.adjustments).toEqual([{ applied: [9, 14], path: "coach.variations.0", requested: [9, 15] }]);
    const { result, variation } = await rendered(9, 15);
    expect(result).toMatchObject({ attempts: 1, removedPaths: [], status: "READY" });
    expect(variation?.san).toBe(
      "9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6",
    );
  });

  it("shortens a much longer range the same way", async () => {
    const { variation } = await rendered(1, 17);
    expect(variation).toMatchObject({ fromMove: 1, san: "1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6", toMove: 6 });
  });

  it("stops at the game's last move and never extends past it", async () => {
    const { variation } = await rendered(16, 20);
    expect(variation).toMatchObject({ san: "16. Qb8+ Nxb8 17. Rd8#", toMove: 17 });
    const [line] = buildSummaryLines(bundle());
    expect(variation?.san.split(" ").filter((t) => !/^\d+\./.test(t)).every((san) => line.moves.includes(san))).toBe(true);
  });

  it("can't repair a range on a game without moves", () => {
    const b = bundle({ games: false });
    b.evidence.push({ id: "E9", kind: "CHAPTER_PGN", moves: [], title: "Empty chapter" });
    const check = checkClassSummaryOutput(withRange(1, 10), b);
    expect(check.ok && check.violations.map((v) => v.reason)).toContain("unknown line L1");
    expect(check.ok && check.adjustments).toEqual([]);
  });
});

describe("student-view privacy", () => {
  it("finds internal identifiers in their common spellings", () => {
    expect(findStudentIdentifiers("S1 and S12 asked; S-3, s 4 and Student #5 too; student 6 agreed.")).toEqual([
      "S1",
      "S12",
      "S-3",
      "s 4",
      "Student #5",
      "student 6",
    ]);
  });

  it("does not flag chess notation, colours or ordinary words", () => {
    const clean = [
      "Bxf7+ Kxf7 then Qf3+ and Rd8#, 1-0 after 17 moves.",
      "Black's queen on d8; White castles O-O-O on move 12.",
      "The Sicilian, a S-shaped pawn chain, 5 puzzles, lesson 2, 3 students.",
      "Moves 1 to 6, bus 2, vs 3, rooks 2, the 7th rank.",
      "Sasha's 3 puzzles and the coach’s 2 hints.",
    ];
    for (const text of clean) expect(findStudentIdentifiers(text)).toEqual([]);
  });

  it("removes a student item that names a student, from prose and from concept names (headings)", () => {
    const output = goodOutput();
    output.student.recap.push({ evidence: ["E3"], text: "S1 solved the pin puzzle first." });
    output.student.keyConcepts.push({ evidence: ["E3"], name: "S2's pin" });
    const check = checkClassSummaryOutput(output, bundle());
    expect(check.ok && check.violations.map((v) => v.path)).toEqual(["student.recap.1", "student.keyConcepts.1"]);
  });

  it("keeps identifiers in the coach view, including variation comments", () => {
    const output = goodOutput();
    output.coach.variations[0].comment = "S2 asked about this line.";
    output.coach.lessonOverview[0].text = "S1 and S3 led the discussion.";
    const check = checkClassSummaryOutput(output, bundle());
    expect(check.ok && check.violations).toEqual([]);
  });

  it("scans every string of a student view, whatever its shape", () => {
    expect(
      studentViewPrivacyViolations({ heading: "Recap for S4", items: [{ comment: "Well done", text: "student 2 fixed it" }], title: "Pins" }),
    ).toEqual([
      { identifiers: ["S4"], path: "student.heading" },
      { identifiers: ["student 2"], path: "student.items.0.text" },
    ]);
  });

  it("never delivers a READY summary whose student view names a student", async () => {
    const leaky = goodOutput();
    leaky.student.recap = [{ evidence: ["E2"], text: "S1 found Rd8 mate." }];
    const result = await generateGroundedClassSummary({ bundle: bundle(), generate: async () => json(leaky) });
    expect(result).toMatchObject({ failureCode: "GROUNDING", privacyResidual: 0, status: "FAILED" });
    expect(studentViewPrivacyViolations(result.summary?.student)).toEqual([]);
  });
});

describe("assessClassSummaryUsability", () => {
  it("needs every required section and at least 75% of items kept", () => {
    const summary = { ...goodOutput(false), coach: { ...goodOutput(false).coach, variations: [] } };
    expect(assessClassSummaryUsability(summary, 6, 1).usable).toBe(true); // 83% kept
    expect(assessClassSummaryUsability(summary, 6, 2).usable).toBe(false); // 67% kept
    const empty = { ...summary, student: { ...summary.student, recap: [] } };
    expect(assessClassSummaryUsability(empty, 6, 0).reasons).toEqual(["student.recap is empty after removing unsupported items"]);
  });
});

describe("generateGroundedClassSummary", () => {
  const scripted = (...answers: Array<string | Error>) => {
    const calls: Array<{ attempt: number; problems: string[] }> = [];
    const generate = jest.fn(async (request: { attempt: 1 | 2; problems: string[] }) => {
      calls.push(request);
      const answer = answers[request.attempt - 1];
      if (answer instanceof Error) throw answer;
      return answer;
    });
    return { calls, generate };
  };

  it("is READY on the first try with variations rendered by code", async () => {
    const { generate } = scripted(json(goodOutput()));
    const result = await generateGroundedClassSummary({ bundle: bundle(), generate });
    expect(result).toMatchObject({ attempts: 1, residualViolations: 0, status: "READY" });
    expect(result.summary?.coach.variations[0]).toMatchObject({ fromEvidence: "E2", san: "10. Nxb5 cxb5 11. Bxb5+ Nbd7" });
  });

  it("retries once with the problems listed, and accepts the repaired answer", async () => {
    const bad = goodOutput();
    bad.coach.lessonOverview[0].text = "Qh5 was the key move.";
    const { calls, generate } = scripted(json(bad), json(goodOutput()));
    const result = await generateGroundedClassSummary({ bundle: bundle(), generate });
    expect(result).toMatchObject({ attempts: 2, removedPaths: [], status: "READY" });
    expect(calls[1].problems).toEqual(['coach.lessonOverview.0: "Qh5" is not a move or square in the evidence']);
  });

  it("removes a claim that is still unsupported after the retry instead of failing", async () => {
    const bad = goodOutput();
    bad.coach.teachingObservations.push({ evidence: ["E2"], text: "Black missed Qh4+." });
    const { generate } = scripted(json(bad), json(bad));
    const result = await generateGroundedClassSummary({ bundle: bundle(), generate });
    expect(result).toMatchObject({ attempts: 2, removedPaths: ["coach.teachingObservations.1"], residualViolations: 0, status: "READY" });
    expect(json(result.summary)).not.toContain("Qh4");
  });

  it("fails when removal leaves a required section empty", async () => {
    const bad = goodOutput();
    bad.student.recap = [{ evidence: ["E2"], text: "S1 won with Qh5." }];
    const { generate } = scripted(json(bad), json(bad));
    const result = await generateGroundedClassSummary({ bundle: bundle(), generate });
    expect(result).toMatchObject({ failureCode: "GROUNDING", status: "FAILED" });
    expect(result.usability?.reasons).toContain("student.recap is empty after removing unsupported items");
  });

  it("fails as SCHEMA when both answers are malformed", async () => {
    const { generate } = scripted("{oops", json({ coach: {} }));
    const result = await generateGroundedClassSummary({ bundle: bundle(), generate });
    expect(result).toMatchObject({ attempts: 2, failureCode: "SCHEMA", status: "FAILED" });
    expect(result.summary).toBeUndefined();
  });

  it("fails as RUNTIME when the model call throws, without a retry on the first call", async () => {
    const { generate } = scripted(new Error("ollama 500"));
    const result = await generateGroundedClassSummary({ bundle: bundle(), generate });
    expect(result).toMatchObject({ attempts: 1, failureCode: "RUNTIME", runtimeError: "ollama 500", status: "FAILED" });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("defers instead of retrying when beforeRetry declines (a class went live)", async () => {
    const { generate } = scripted("{oops");
    const result = await generateGroundedClassSummary({ beforeRetry: () => false, bundle: bundle(), generate });
    expect(result.status).toBe("DEFERRED");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("keeps the first answer when the retry is worse (the 2026-10-25 bench-3 regression)", async () => {
    // First answer: an invented move in a coach item, and a fine student recap.
    const first = goodOutput();
    first.coach.teachingObservations.push({ evidence: ["E2"], text: "Black missed Qh5." });
    // Repair: fixes the coach item but writes a pseudonym into the only recap item.
    const retry = goodOutput();
    retry.student.recap = [{ evidence: ["E3"], text: "Students were confused by the pin; S3 repeated the line." }];
    const { generate } = scripted(json(first), json(retry));
    const result = await generateGroundedClassSummary({ bundle: bundle(), generate });
    expect(result).toMatchObject({ attempts: 2, removedPaths: ["coach.teachingObservations.1"], selectedAttempt: 1, status: "READY" });
    expect(studentViewPrivacyViolations(result.summary?.student)).toEqual([]);
    expect(json(result.summary)).not.toContain("Qh5");
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("prefers the answer with fewer unsupported items when both are usable", async () => {
    const one = goodOutput();
    one.coach.teachingObservations.push({ evidence: ["E2"], text: "Qh5 was strong." });
    const two = goodOutput();
    two.coach.teachingObservations.push({ evidence: ["E2"], text: "Qh5 was strong." }, { evidence: ["E2"], text: "So was Qg4." });
    two.coach.lessonOverview.push(
      { evidence: ["E1"], text: "Development first." },
      { evidence: ["E1"], text: "Then pins." },
      { evidence: ["E1"], text: "Then the attack." },
    );
    const { generate } = scripted(json(one), json(two));
    const result = await generateGroundedClassSummary({ bundle: bundle(), generate });
    expect(result).toMatchObject({ selectedAttempt: 1, status: "READY" });
  });

  it("uses a good first answer when the repair call itself fails", async () => {
    const first = goodOutput();
    first.coach.teachingObservations.push({ evidence: ["E2"], text: "Black missed Qh5." });
    const { generate } = scripted(json(first), new Error("ollama 500"));
    const result = await generateGroundedClassSummary({ bundle: bundle(), generate });
    expect(result).toMatchObject({ attempts: 2, runtimeError: "ollama 500", selectedAttempt: 1, status: "READY" });
  });

  it("fails safely when neither answer is usable, and never makes a third call", async () => {
    const bad = goodOutput();
    bad.student.recap = [{ evidence: ["E2"], text: "S1 won with Qh5." }];
    const { generate } = scripted(json(bad), "{broken");
    const result = await generateGroundedClassSummary({ bundle: bundle(), generate });
    expect(result).toMatchObject({ attempts: 2, failureCode: "GROUNDING", selectedAttempt: 1, status: "FAILED" });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("selection order is fixed: READY, then fewer removals, then more kept, then the repair", () => {
    const candidate = (attempt: 1 | 2, ready: boolean, unsupportedItems: number, keptShare: number): ClassSummaryCandidate => ({
      adjustments: [],
      attempt,
      privacyResidual: 0,
      ready,
      removedPaths: [],
      residualViolations: 0,
      summary: { ...goodOutput(false), coach: { ...goodOutput(false).coach, variations: [] } },
      unsupportedItems,
      usability: { keptShare, reasons: [], usable: ready },
    });
    expect(selectClassSummaryCandidate([candidate(1, false, 0, 1), candidate(2, true, 2, 0.8)])?.attempt).toBe(2);
    expect(selectClassSummaryCandidate([candidate(1, true, 1, 0.9), candidate(2, true, 2, 0.8)])?.attempt).toBe(1);
    expect(selectClassSummaryCandidate([candidate(1, true, 1, 0.9), candidate(2, true, 1, 0.8)])?.attempt).toBe(1);
    expect(selectClassSummaryCandidate([candidate(1, true, 1, 0.9), candidate(2, true, 1, 0.9)])?.attempt).toBe(2);
    expect(selectClassSummaryCandidate([])).toBeUndefined();
  });

  it("summarises a class with no games: no lines, no variations, still READY", async () => {
    const { calls, generate } = scripted(json(goodOutput(false)));
    const b = bundle({ games: false });
    const output = goodOutput(false);
    output.coach.lessonOverview[0].evidence = ["E1"];
    output.student.keyConcepts[0].evidence = ["E3"];
    output.student.recap = [{ evidence: ["E3"], text: "We practised pins." }];
    output.student.practiceIdeas[0].text = "Solve three pin puzzles.";
    const result = await generateGroundedClassSummary({ bundle: b, generate: async (r) => (calls.push(r), json(output)) });
    expect(result).toMatchObject({ attempts: 1, lines: [], status: "READY" });
    expect(result.summary?.coach.variations).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });
});

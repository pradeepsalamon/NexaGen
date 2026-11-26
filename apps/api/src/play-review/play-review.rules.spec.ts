import {
  AI_REVIEW_CONSENT_VERSION,
  aiConsentIsCurrent,
  outsideAiAllowed,
  parsePlayItemKey,
  rankPlayFindings,
  type EngineLine,
  type Evaluation,
  type GameEngineAnalysis,
  type PlayFinding,
  type PlayItem
} from "@nexa-chess/types";
import { replayGame } from "../stockfish/game-analysis-engine.service";
import { replaySegment } from "./play-item.loader";
import { buildPlayReview, reviewableSegments } from "./play-review.rules";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6?? 4.Qxf7#
const SCHOLAR = ["e2e4", "e7e5", "d1h5", "b8c6", "f1c4", "g8f6", "h5f7"];

const cp = (v: number): Evaluation => ({ cp: v, kind: "cp" });
const mate = (winner: "white" | "black", moves: number): Evaluation => ({ kind: "mate", moves, winner });
const line = (evaluation: Evaluation, pv: string[], pvSan: string[] = []): EngineLine => ({
  bound: "exact",
  depth: 20,
  evaluation,
  pvSan,
  pvUci: pv,
  rank: 1
});

function engineGame(startFen: string, moves: string[], lines: Record<number, EngineLine>): GameEngineAnalysis {
  const replay = replayGame(startFen, moves);
  for (const p of replay.positions) {
    if (p.status === "TERMINAL") continue;
    const l = lines[p.ply];
    p.lines = l ? [l] : [];
    p.status = l ? "ANALYSED" : "FAILED";
  }
  return {
    budgetExhausted: false,
    complete: replay.positions.every((p) => p.status !== "FAILED"),
    config: { budgetMs: 1000, concurrency: 1, depth: "QUICK", maxDepth: 14, movetimeMs: 250, multiPv: 1, rootMoveSearch: false },
    conventionVersion: "white-relative-v1",
    engine: "test",
    moves: replay.moves,
    positions: replay.positions,
    startFen: replay.positions[0].fen,
    truncated: replay.truncated
  };
}

const scholarEngine = () =>
  engineGame(START, SCHOLAR, {
    0: line(cp(30), ["e2e4"]),
    1: line(cp(30), ["e7e5"]),
    2: line(cp(30), ["d1h5"]),
    3: line(cp(40), ["b8c6"]),
    4: line(cp(40), ["f1c4"]),
    // Black to move: g7g6 holds; Nf6 allows mate in one.
    5: line(cp(40), ["g7g6", "h5f3"], ["g6", "Qf3"]),
    6: line(mate("white", 1), ["h5f7"], ["Qxf7#"])
  });

function item(studentSide: "white" | "black"): PlayItem {
  const segment = replaySegment({ moves: SCHOLAR.map((uci) => ({ uci })), startFen: START, studentSide });
  return {
    batchId: null,
    classId: null,
    key: "MATCH:g1",
    playedAt: new Date(0).toISOString(),
    result: "1-0",
    review: null,
    segments: [segment],
    source: "MATCH",
    sourceId: "g1",
    studentMoveCount: segment.moves.filter((m) => m.byStudent).length,
    title: "Match"
  };
}

describe("replaySegment", () => {
  it("credits the student's side only and adds SAN", () => {
    const segment = replaySegment({ moves: SCHOLAR.map((uci) => ({ uci })), startFen: START, studentSide: "black" });
    expect(segment.moves.map((m) => m.byStudent)).toEqual([false, true, false, true, false, true, false]);
    expect(segment.moves[6]).toMatchObject({ ply: 7, san: "Qxf7#", uci: "h5f7" });
  });

  it("stops at the first move that doesn't play, never inventing a line", () => {
    const segment = replaySegment({ moves: [{ uci: "e2e4" }, { uci: "e2e4" }, { uci: "e7e5" }], startFen: START, studentSide: "white" });
    expect(segment.moves.map((m) => m.uci)).toEqual(["e2e4"]);
  });

  it("takes an explicit per-move credit over the side (class board, Storm)", () => {
    const segment = replaySegment({
      moves: [{ byStudent: false, uci: "e2e4" }, { byStudent: true, uci: "e7e5" }],
      startFen: START,
      studentSide: null
    });
    expect(segment.moves.map((m) => m.byStudent)).toEqual([false, true]);
  });
});

describe("buildPlayReview", () => {
  it("judges only the student's moves: Black's Nf6 is the blunder", () => {
    const review = buildPlayReview(item("black"), [{ engine: scholarEngine(), segment: 0 }], "stockfish-test");
    expect(review.studentMoves).toBe(3);
    expect(review.blunders).toBe(1);
    expect(review.findings[0]).toMatchObject({ bestMoveSan: "g6", kind: "BLUNDER", playedSan: "Nf6", ply: 6, segment: 0 });
    expect(review.versions).toMatchObject({ engine: "stockfish-test", rules: "play-review-v1" });
  });

  it("finds nothing against the side that played well", () => {
    const review = buildPlayReview(item("white"), [{ engine: scholarEngine(), segment: 0 }], "stockfish-test");
    expect(review.studentMoves).toBe(4);
    expect(review.blunders).toBe(0);
    expect(review.findings.filter((f) => f.kind === "BLUNDER")).toEqual([]);
  });

  it("reviews only segments with a student move", () => {
    const withOpponentOnly = item("white");
    withOpponentOnly.segments.push(
      replaySegment({ moves: [{ byStudent: false, uci: "e2e4" }], startFen: START, studentSide: null })
    );
    expect(reviewableSegments(withOpponentOnly)).toEqual([0]);
  });
});

describe("rankPlayFindings", () => {
  const f = (kind: PlayFinding["kind"], loss: number, ply = 1): PlayFinding => ({
    bestMoveSan: null,
    fenBefore: START,
    kind,
    motif: null,
    playedSan: "e4",
    ply,
    segment: 0,
    winPercentLoss: loss
  });

  it("puts blunders first, then the costliest, and caps the list", () => {
    const ranked = rankPlayFindings([f("INACCURACY", 5), f("MISTAKE", 20), f("BLUNDER", 30), f("MISTAKE", 25), ...Array(10).fill(f("INACCURACY", 1))]);
    expect(ranked.map((x) => `${x.kind}:${x.winPercentLoss}`).slice(0, 4)).toEqual(["BLUNDER:30", "MISTAKE:25", "MISTAKE:20", "INACCURACY:5"]);
    expect(ranked).toHaveLength(8);
  });
});

describe("outsideAiAllowed (the one rule)", () => {
  const on = { allowed: true, version: AI_REVIEW_CONSENT_VERSION };
  const base = { academyEnabled: true, consent: on, planIncludes: true, providerConfigured: true };

  it("needs every condition", () => {
    expect(outsideAiAllowed(base)).toBe(true);
    expect(outsideAiAllowed({ ...base, academyEnabled: false })).toBe(false);
    expect(outsideAiAllowed({ ...base, planIncludes: false })).toBe(false);
    expect(outsideAiAllowed({ ...base, providerConfigured: false })).toBe(false);
    expect(outsideAiAllowed({ ...base, consent: null })).toBe(false);
    expect(outsideAiAllowed({ ...base, consent: { ...on, allowed: false } })).toBe(false);
  });

  it("treats consent to an older wording as off", () => {
    expect(aiConsentIsCurrent({ allowed: true, version: AI_REVIEW_CONSENT_VERSION - 1 })).toBe(false);
    expect(outsideAiAllowed({ ...base, consent: { allowed: true, version: AI_REVIEW_CONSENT_VERSION + 1 } })).toBe(false);
  });
});

describe("parsePlayItemKey", () => {
  it("reads source and id, refusing anything else", () => {
    expect(parsePlayItemKey("RUSH:s-abc")).toEqual({ source: "RUSH", sourceId: "s-abc" });
    expect(parsePlayItemKey("NOPE:abc")).toBeNull();
    expect(parsePlayItemKey("PUZZLE:../etc")).toBeNull();
  });
});

import {
  decidePlayoutOutcome,
  mcqCorrectOptionIds,
  mcqConfigSchema,
  mcqFinalScore,
  mcqKeyVisible,
  mcqVerdictVisible,
  mergePlayoutMonitorEntry,
  pieceOnSquare,
  playoutConfigSchema,
  playoutGoalProgress,
  scoreMcqSelection,
  scorePlayout,
  shuffleForStudent,
  type PlayoutGoal,
  type PlayoutMonitorEntry,
  type PlayoutMonitorUpdate
} from "@nexa-chess/types";
import { playoutFacts, playoutPgn, replayPlayout, turnOfPlayout, type StoredPlayoutMove } from "./playout-position";

/** Plays UCI moves from `fen`; moves alternate from the side to move, the student being `studentColor`. */
function play(fen: string, ucis: string[], studentColor: "white" | "black" = "white") {
  const moves: StoredPlayoutMove[] = [];
  let chess = replayPlayout(fen, moves);
  for (const uci of ucis) {
    const mover = (chess.turn() === "w" ? "white" : "black") === studentColor ? "STUDENT" : "COMPUTER";
    const played = chess.move({ from: uci.slice(0, 2), promotion: uci[4], to: uci.slice(2, 4) });
    moves.push({ by: mover, ply: moves.length, san: played.san, uci: `${played.from}${played.to}${played.promotion ?? ""}` });
    // Replay every time, as the service does, so history-based draws are real.
    chess = replayPlayout(fen, moves);
  }
  return { chess, facts: playoutFacts(chess, studentColor, moves), moves };
}

const CHECKMATE: PlayoutGoal = { type: "CHECKMATE" };

describe("Playout goal rules", () => {
  it("counts only a real mate given by the student as a checkmate goal", () => {
    const { facts } = play("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", ["a1a8"]);
    expect(facts.isCheckmate).toBe(true);
    expect(decidePlayoutOutcome(CHECKMATE, facts)).toEqual({ endReason: "GOAL_ACHIEVED", goalAchieved: true, result: "WIN" });
  });

  it("does not count being mated, whatever the goal", () => {
    // Back-rank mate delivered BY the computer (Black) against the student (White).
    const { facts } = play("r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1", ["a8a1"]);
    expect(facts.lastMover).toBe("COMPUTER");
    expect(decidePlayoutOutcome(CHECKMATE, facts)).toEqual({ endReason: "CHECKMATE", goalAchieved: false, result: "LOSS" });
    expect(decidePlayoutOutcome({ points: 1, type: "MATERIAL_ADVANTAGE" }, { ...facts, placement: "8/8/8/8/8/8/QQQQ4/k6K" })?.goalAchieved).toBe(false);
  });

  it("does not treat stalemate as reaching a checkmate goal", () => {
    // Qg6 stalemates the king on h8 (K+Q v K).
    const { facts } = play("7k/5K2/8/8/8/8/8/6Q1 w - - 0 1", ["g1g6"]);
    expect(facts.isStalemate).toBe(true);
    expect(decidePlayoutOutcome(CHECKMATE, facts)).toEqual({ endReason: "STALEMATE", goalAchieved: false, result: "DRAW" });
    expect(decidePlayoutOutcome({ type: "DRAW" }, facts)).toEqual({ endReason: "GOAL_ACHIEVED", goalAchieved: true, result: "DRAW" });
  });

  it("detects insufficient material and threefold repetition as draws", () => {
    const bare = play("7k/8/8/8/8/8/6r1/6K1 w - - 0 1", ["g1g2"]);
    expect(bare.facts.isOtherDraw).toBe(true);
    expect(decidePlayoutOutcome(CHECKMATE, bare.facts)?.result).toBe("DRAW");

    const start = "4k3/8/8/8/8/8/R7/4K3 w - - 0 1";
    const shuffle = ["a2a3", "e8e7", "a3a2", "e7e8", "a2a3", "e8e7", "a3a2", "e7e8"];
    const repeated = play(start, shuffle);
    expect(repeated.facts.isOtherDraw).toBe(true);
    expect(decidePlayoutOutcome(CHECKMATE, repeated.facts)).toMatchObject({ endReason: "DRAW", goalAchieved: false });
    // One repetition short: the game goes on.
    expect(decidePlayoutOutcome(CHECKMATE, play(start, shuffle.slice(0, 6)).facts)).toBeNull();
  });

  it("detects the fifty-move rule from the position's clock", () => {
    const { facts } = play("4k3/8/8/8/8/8/R7/4K3 w - - 99 80", ["a2a3"]);
    expect(facts.isOtherDraw).toBe(true);
  });

  it("promotion goals follow the student's own promotions, by piece when asked", () => {
    const { facts } = play("8/P6k/8/8/8/8/8/K7 w - - 0 1", ["a7a8r"]);
    expect(facts.promotions).toEqual(["r"]);
    expect(decidePlayoutOutcome({ type: "PROMOTE" }, facts)).toMatchObject({ endReason: "GOAL_ACHIEVED", goalAchieved: true, result: "NONE" });
    expect(decidePlayoutOutcome({ piece: "r", type: "PROMOTE" }, facts)?.goalAchieved).toBe(true);
    expect(decidePlayoutOutcome({ piece: "q", type: "PROMOTE" }, facts)).toBeNull();
    expect(playoutGoalProgress({ type: "PROMOTE" }, facts)).toBe("Promoted to rook");
  });

  it("does not credit the computer's promotion to the student", () => {
    const { facts } = play("K7/8/8/8/8/8/p6k/8 b - - 0 1", ["a2a1q"]);
    expect(facts.promotions).toEqual([]);
    expect(decidePlayoutOutcome({ type: "PROMOTE" }, facts)).toBeNull();
  });

  it("material goals measure the student's lead, for either colour", () => {
    const white = play("4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1", ["e4d5"]);
    expect(decidePlayoutOutcome({ points: 1, type: "MATERIAL_ADVANTAGE" }, white.facts)?.goalAchieved).toBe(true);
    expect(playoutGoalProgress({ points: 3, type: "MATERIAL_ADVANTAGE" }, white.facts)).toBe("Material +1 of +3");
    expect(decidePlayoutOutcome({ points: 3, type: "MATERIAL_ADVANTAGE" }, white.facts)).toBeNull();

    const black = play("4k3/8/8/3Q4/4p3/8/8/4K3 b - - 0 1", ["e4e3", "d5a2"], "black");
    expect(decidePlayoutOutcome({ points: 1, type: "MATERIAL_ADVANTAGE" }, black.facts)).toBeNull();
  });

  it("reach-position and pieces-on-squares goals read the board, never a move count", () => {
    const { facts } = play("8/8/4k3/8/4K3/4P3/8/8 w - - 0 1", ["e4d4", "e6d6", "d4e4"]);
    expect(decidePlayoutOutcome({ placement: "8/8/3k4/8/4K3/4P3/8/8", type: "REACH_POSITION" }, facts)?.goalAchieved).toBe(true);
    expect(decidePlayoutOutcome({ placement: "8/8/3k4/8/4K3/4P3/8/8", sideToMove: "white", type: "REACH_POSITION" }, facts)).toBeNull();
    expect(decidePlayoutOutcome({ placement: "8/8/8/8/4K3/4P3/8/3k4", type: "REACH_POSITION" }, facts)).toBeNull();

    const opposition = play("4k3/8/8/4K3/8/4P3/8/8 w - - 0 1", ["e5e6"]);
    const goal: PlayoutGoal = {
      placements: [
        { piece: "K", square: "e6" },
        { piece: "k", square: "e8" }
      ],
      sideToMove: "black",
      type: "PIECES_ON_SQUARES"
    };
    expect(decidePlayoutOutcome(goal, opposition.facts)?.goalAchieved).toBe(true);
    expect(playoutGoalProgress({ ...goal, placements: [{ piece: "K", square: "e6" }, { piece: "k", square: "d8" }] }, opposition.facts)).toBe("1 of 2 in place");
    expect(pieceOnSquare(opposition.facts.placement, "e6")).toBe("K");
    expect(pieceOnSquare(opposition.facts.placement, "a1")).toBeNull();
  });

  it("keeps full chess rules in a replay: castling and en passant", () => {
    const castled = play("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", ["e1g1"]);
    expect(castled.moves[0].san).toBe("O-O");
    const ep = play("4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1", ["d7d5", "e5d6"], "white");
    expect(ep.moves[1].san).toBe("exd6");
    expect(pieceOnSquare(ep.facts.placement, "d5")).toBeNull();
  });

  it("writes a PGN that starts from the set-up position and names no student", () => {
    const { chess } = play("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", ["a1a8"]);
    const pgn = playoutPgn(chess, "white", "Casual (level 5)");
    expect(pgn).toContain('[FEN "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1"]');
    expect(pgn).toContain('[White "Student"]');
    expect(pgn).toContain('[Black "Computer (Casual (level 5))"]');
    expect(pgn).toContain("Ra8#");
  });

  it("knows whose turn it is from the position", () => {
    expect(turnOfPlayout("8/8/8/8/8/8/8/K6k w - - 0 1", "white")).toBe("STUDENT");
    expect(turnOfPlayout("8/8/8/8/8/8/8/K6k b - - 0 1", "white")).toBe("COMPUTER");
    expect(turnOfPlayout("8/8/8/8/8/8/8/K6k b - - 0 1", "black")).toBe("STUDENT");
  });
});

describe("Playout scoring", () => {
  const scoring = playoutConfigSchema.parse({
    goal: { type: "CHECKMATE" },
    scoring: { drawPoints: 3, goalPoints: 10, hintPenalty: 2, parBonus: 5, parMoves: 4, retryPenalty: 1 },
    startFen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",
    studentColor: "white"
  }).scoring;
  const game = { attemptNumber: 1, goalAchieved: true, hintsUsed: 0, result: "WIN" as const, studentMoves: 4 };

  it("awards the goal, the par bonus, and takes off hints and retries", () => {
    expect(scorePlayout(scoring, game)).toBe(15);
    expect(scorePlayout(scoring, { ...game, studentMoves: 5 })).toBe(10);
    expect(scorePlayout(scoring, { ...game, hintsUsed: 2, studentMoves: 5 })).toBe(6);
    expect(scorePlayout(scoring, { ...game, attemptNumber: 3, studentMoves: 5 })).toBe(8);
    expect(scorePlayout(scoring, { ...game, hintsUsed: 100, studentMoves: 5 })).toBe(0);
  });

  it("gives nothing for a missed goal except the configured draw points", () => {
    expect(scorePlayout(scoring, { ...game, goalAchieved: false, result: "LOSS" })).toBe(0);
    expect(scorePlayout(scoring, { ...game, goalAchieved: false, result: "NONE" })).toBe(0);
    expect(scorePlayout(scoring, { ...game, goalAchieved: false, result: "DRAW" })).toBe(3);
  });
});

describe("MCQ rules", () => {
  const option = (id: string, isCorrect = false) => ({ id, isCorrect, text: id });

  it("needs a key that fits the question type", () => {
    const base = { question: { text: "Q?" } };
    expect(mcqConfigSchema.safeParse({ ...base, options: [option("a"), option("b")] }).success).toBe(false);
    expect(mcqConfigSchema.safeParse({ ...base, options: [option("a", true), option("b", true)] }).success).toBe(false);
    expect(mcqConfigSchema.safeParse({ ...base, allowMultiple: true, options: [option("a", true), option("b", true)] }).success).toBe(true);
    expect(mcqConfigSchema.safeParse({ ...base, options: [option("a", true)] }).success).toBe(false);
    expect(mcqConfigSchema.safeParse({ ...base, options: Array.from({ length: 7 }, (_, i) => option(String(i), i === 0)) }).success).toBe(false);
    expect(mcqConfigSchema.safeParse({ ...base, options: [option("a", true), option("a")] }).success).toBe(false);
    expect(mcqConfigSchema.safeParse({ options: [option("a", true), option("b")], question: {} }).success).toBe(false);
    expect(mcqConfigSchema.safeParse({ ...base, options: [{ id: "a", isCorrect: true }, option("b")] }).success).toBe(false);
  });

  it("lets every option mix text, an image and a position on its own", () => {
    const parsed = mcqConfigSchema.safeParse({
      options: [
        { id: "a", isCorrect: true, text: "Nf3" },
        { id: "b", imageUrl: "https://res.cloudinary.com/x/image/upload/nexa_chess/activities/b.png", isCorrect: false },
        { fen: "8/8/8/8/8/8/8/K6k w - - 0 1", id: "c", isCorrect: false, text: "This one" }
      ],
      question: { imageUrl: "https://res.cloudinary.com/x/image/upload/nexa_chess/activities/q.png" }
    });
    expect(parsed.success).toBe(true);
  });

  it("marks a multi-answer question all or nothing", () => {
    const config = { marks: 4, options: [option("a", true), option("b", true), option("c")], wrongPenalty: 1 };
    expect(mcqCorrectOptionIds(config)).toEqual(["a", "b"]);
    expect(scoreMcqSelection(config, ["a", "b"])).toMatchObject({ correct: true, score: 4 });
    expect(scoreMcqSelection(config, ["b", "a"])).toMatchObject({ correct: true });
    expect(scoreMcqSelection(config, ["a"])).toMatchObject({ correct: false, score: 0 });
    expect(scoreMcqSelection(config, ["a", "b", "c"])).toMatchObject({ correct: false, score: 0 });
  });

  it("never lets the final score go negative, and keeps the best try", () => {
    const config = { marks: 4, wrongPenalty: 1 };
    expect(mcqFinalScore(config, [])).toBe(0);
    expect(mcqFinalScore(config, [{ correct: false, score: 0 }])).toBe(0);
    expect(mcqFinalScore(config, [{ correct: false, score: 0 }, { correct: true, score: 4 }, { correct: false, score: 0 }])).toBe(4);
  });

  it("keeps the key back until the configured reveal", () => {
    expect(mcqKeyVisible("ON_SUBMIT", { revealedAt: null }, false)).toBe(false);
    expect(mcqKeyVisible("ON_SUBMIT", { revealedAt: null }, true)).toBe(true);
    expect(mcqKeyVisible("ON_ACTIVITY_END", { revealedAt: null }, true)).toBe(false);
    expect(mcqKeyVisible("COACH", { revealedAt: null }, true)).toBe(false);
    expect(mcqKeyVisible("COACH", { revealedAt: new Date() }, false)).toBe(true);
    expect(mcqVerdictVisible("ON_SUBMIT", { revealedAt: null })).toBe(true);
    expect(mcqVerdictVisible("COACH", { revealedAt: null })).toBe(false);
  });

  it("shuffles the same way every time for one student, differently across students", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    expect(shuffleForStudent(ids, "run:1")).toEqual(shuffleForStudent(ids, "run:1"));
    expect([...shuffleForStudent(ids, "run:1")].sort()).toEqual(ids);
    const orders = new Set(Array.from({ length: 12 }, (_, i) => shuffleForStudent(ids, `run:${i}`).join("")));
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe("Merging monitor packets", () => {
  const entry: PlayoutMonitorEntry = {
    attemptNumber: 1,
    endReason: null,
    endsAt: null,
    fen: "f4",
    finishedAt: null,
    gameId: "g1",
    goalAchieved: false,
    lastMoveSan: null,
    lastMoveUci: null,
    ply: 4,
    progress: null,
    result: null,
    score: null,
    startedAt: "t",
    status: "IN_PROGRESS",
    studentId: "s",
    studentMoves: 2,
    studentName: "Asha",
    turn: "STUDENT"
  };
  const update = (over: Partial<PlayoutMonitorUpdate>): PlayoutMonitorUpdate => ({
    attemptNumber: 1,
    endReason: null,
    endsAt: null,
    fen: "f5",
    finishedAt: null,
    gameId: "g1",
    goalAchieved: false,
    lastMoveSan: "Kd2",
    lastMoveUci: "e1d2",
    ply: 5,
    progress: null,
    result: null,
    score: null,
    startedAt: "t",
    status: "IN_PROGRESS",
    studentId: "s",
    studentMoves: 3,
    turn: "COMPUTER",
    ...over
  });

  it("takes newer positions and ignores late packets", () => {
    expect(mergePlayoutMonitorEntry(entry, update({})).fen).toBe("f5");
    expect(mergePlayoutMonitorEntry(entry, update({ fen: "old", ply: 3 })).fen).toBe("f4");
  });

  it("a new try replaces a finished one, but a late packet can't reopen a game", () => {
    const done = { ...entry, status: "COMPLETED" as const };
    expect(mergePlayoutMonitorEntry(done, update({ ply: 4 })).status).toBe("COMPLETED");
    const next = mergePlayoutMonitorEntry(done, update({ attemptNumber: 2, fen: "start", gameId: "g2", ply: 0 }));
    expect(next).toMatchObject({ attemptNumber: 2, fen: "start", status: "IN_PROGRESS" });
    expect(mergePlayoutMonitorEntry({ ...entry, attemptNumber: 2 }, update({ attemptNumber: 1, ply: 9 })).attemptNumber).toBe(2);
  });
});

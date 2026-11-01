import { Logger } from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config/api";
import { decidePlayoutOutcome, type PlayoutColor } from "@nexa-chess/types";
import { Chess } from "../common/chess/chess";
import { StockfishService } from "../stockfish/stockfish.service";
import { playoutFacts, replayPlayout, type StoredPlayoutMove } from "./playout-position";

// Real Stockfish, as the Playout service calls it: one pool, each search handed
// only its own game's position and settings. Opt-in, like the other real-engine
// spec: STOCKFISH_TEST_PATH=/usr/games/stockfish npx jest playout-engine.real

jest.mock("@nexa-chess/config/api", () => ({ getApiEnv: jest.fn() }));

const enginePath = process.env.STOCKFISH_TEST_PATH;
const describeEngine = enginePath ? describe : describe.skip;

const KRK = "8/8/8/4k3/8/8/8/R3K3 w - - 0 1";
const CLASS_SIZE = 30;

/** The student's side, played by the first legal move: this spec is about the engine's replies. */
function studentMove(chess: Chess) {
  const moves = chess.moves({ verbose: true });
  return moves[Math.floor(moves.length / 2)];
}

describeEngine("Playout against the real engine", () => {
  let stockfish: StockfishService;

  beforeAll(() => {
    Logger.overrideLogger(false);
    jest.mocked(getApiEnv).mockReturnValue({
      STOCKFISH_HASH_MB: 16,
      STOCKFISH_IDLE_TIMEOUT_S: 0,
      STOCKFISH_MAX_DEPTH: 16,
      STOCKFISH_MIN_ENGINES: 1,
      STOCKFISH_MOVE_MAX_DEPTH: 16,
      STOCKFISH_MOVE_MOVETIME: 300,
      STOCKFISH_MOVETIME: 300,
      STOCKFISH_PATH: enginePath,
      STOCKFISH_POOL_SIZE: 4
    } as never);
    stockfish = new StockfishService();
    stockfish.onModuleInit();
  });
  afterAll(() => stockfish.onModuleDestroy());

  it("answers a whole class at once, each game only from its own position", async () => {
    // Every game takes a different first move, so every position differs.
    const games = Array.from({ length: CLASS_SIZE }, (_, i) => {
      const chess = new Chess(KRK);
      const legal = chess.moves({ verbose: true });
      const first = legal[i % legal.length];
      return { first, moves: [{ by: "STUDENT" as const, ply: 0, san: first.san, uci: `${first.from}${first.to}` }] as StoredPlayoutMove[] };
    });

    const started = Date.now();
    const replies = await Promise.all(
      games.map((game) => stockfish.getBestMove(replayPlayout(KRK, game.moves).fen(), { movetimeMs: 500, skillLevel: 5 }))
    );
    const elapsed = Date.now() - started;

    replies.forEach((reply, index) => {
      expect(reply).not.toBeNull();
      // Legal in that game's own position: the reply really is about this board.
      const chess = replayPlayout(KRK, games[index].moves);
      expect(() => chess.move({ from: reply!.uci.slice(0, 2), to: reply!.uci.slice(2, 4) })).not.toThrow();
    });
    console.log(`${CLASS_SIZE} simultaneous replies at skill 5 in ${elapsed} ms`);
    expect(elapsed).toBeLessThan(15_000);
  }, 30_000);

  it("the computer defends: the rook is not given away, and the game plays out legally", async () => {
    const color: PlayoutColor = "white";
    const moves: StoredPlayoutMove[] = [];
    let chess = replayPlayout(KRK, moves);
    for (let ply = 0; ply < 24 && !chess.isGameOver(); ply += 1) {
      if (chess.turn() === "w") {
        const move = studentMove(chess);
        moves.push({ by: "STUDENT", ply: moves.length, san: move.san, uci: `${move.from}${move.to}${move.promotion ?? ""}` });
      } else {
        const best = await stockfish.getBestMove(chess.fen(), { movetimeMs: 200, skillLevel: 20 });
        expect(best).not.toBeNull();
        const played = chess.move({ from: best!.uci.slice(0, 2), promotion: best!.uci[4], to: best!.uci.slice(2, 4) });
        moves.push({ by: "COMPUTER", ply: moves.length, san: played.san, uci: best!.uci });
      }
      chess = replayPlayout(KRK, moves);
      const outcome = decidePlayoutOutcome({ type: "CHECKMATE" }, playoutFacts(chess, color, moves));
      // A careless student can't be mated by a lone king; nothing here is a win they didn't earn.
      if (outcome) expect(outcome.goalAchieved).toBe(chess.isCheckmate() && moves[moves.length - 1].by === "STUDENT");
    }
    expect(moves.filter((m) => m.by === "COMPUTER").length).toBeGreaterThan(5);
  }, 60_000);

  it("plays different moves across attempts at a low level, so a game can't be memorised", async () => {
    const fen = "8/8/8/4k3/8/8/R7/4K3 b - - 0 1";
    const seen = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const best = await stockfish.getBestMove(fen, { movetimeMs: 100, skillLevel: 0 });
      seen.add(best!.uci);
    }
    expect(seen.size).toBeGreaterThan(1);
  }, 30_000);
});

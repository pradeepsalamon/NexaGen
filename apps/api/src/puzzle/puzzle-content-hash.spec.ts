import { puzzleContentKey } from "@nexa-chess/types";
import { puzzleContentHash } from "./puzzle-content-hash";

const FEN = "7k/6pp/8/8/8/8/1R6/R5K1 w - - 0 1";

describe("puzzleContentHash", () => {
  it("keys on the first four FEN fields and the lowercased line", () => {
    expect(puzzleContentKey(FEN, ["A1A8"])).toBe("7k/6pp/8/8/8/8/1R6/R5K1 w - -|a1a8");
  });

  it("is 16 hex chars and ignores the move counters", () => {
    const hash = puzzleContentHash(FEN, [{ uci: "a1a8" }]);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(puzzleContentHash("7k/6pp/8/8/8/8/1R6/R5K1 w - - 9 30", [{ uci: "a1a8" }])).toBe(hash);
  });

  it("differs when the side to move or the line differs", () => {
    const hash = puzzleContentHash(FEN, [{ uci: "a1a8" }]);
    expect(puzzleContentHash(FEN.replace(" w ", " b "), [{ uci: "a1a8" }])).not.toBe(hash);
    expect(puzzleContentHash(FEN, [{ uci: "b2b8" }])).not.toBe(hash);
  });
});

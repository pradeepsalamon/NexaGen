import { createHash } from "node:crypto";
import { Chess } from "../../common/chess/chess";
import { AssignmentEvaluationService, assertValidFen } from "../../assignment/assignment-evaluation.service";
import type { StockfishService } from "../../stockfish/stockfish.service";
import { puzzleContentHash } from "../puzzle-content-hash";
import {
  CATALOGUE_TSV_COLUMNS,
  LICHESS_ID_SPACE,
  TSV_SORT_KEYS,
  lichessIdOrdinal,
  lichessRandKey,
  passesSourceQuality,
  pgTextArray,
  prepareLine,
  ratingBandOf,
  toCatalogueTsv,
  type PrepareResult
} from "./lichess-prepare.core";

// Real lines from the 2026-10 dump.
const PLAIN =
  "0000D,5rk1/1p3ppp/pq3b2/8/8/1P1Q1N2/P4PPP/3R2K1 w - - 2 27,d3d6 f8d8 d6d8 f6d8,1529,74,96,37506,advantage endgame short,https://lichess.org/F8M8OS71#53,,";
const MATE_WITH_OPENING =
  "0000H,r4rk1/pp3ppp/8/2bqp2b/3N4/P2Bn2P/1PPN1P2/R1BQ1RK1 w - - 1 15,d1h5 d5g2,1554,223,100,11,mate mateIn1 middlegame oneMove,https://lichess.org/EwHRkfas#29,French_Defense French_Defense_Tarrasch_Variation,";
const PROMOTION_MATE =
  "001w5,1rb2rk1/q5P1/4p2p/3p3p/3P1P2/2P5/2QK3P/3R2R1 b - - 0 29,f8f7 c2h7 g8h7 g7g8q,1034,83,85,220,advancedPawn attraction mate mateIn2 middlegame promotion short,https://lichess.org/0e1vxAEn/black#58,,";

/** Replace one 0-based CSV column of a line. */
function withColumn(line: string, index: number, value: string): string {
  const cols = line.split(",");
  cols[index] = value;
  return cols.join(",");
}

function rejectReason(result: PrepareResult): string | null {
  return result.ok ? null : result.reason;
}

describe("lichess-prepare.core", () => {
  describe("prepareLine — valid rows", () => {
    it("keeps the source fields verbatim and derives band, key and quality", () => {
      const result = prepareLine(PLAIN);
      if (!result.ok) throw new Error(result.reason);
      expect(result.row).toMatchObject({
        fen: "5rk1/1p3ppp/pq3b2/8/8/1P1Q1N2/P4PPP/3R2K1 w - - 2 27",
        gameUrl: "https://lichess.org/F8M8OS71#53",
        id: "0000D",
        moves: "d3d6 f8d8 d6d8 f6d8",
        nbPlays: 37506,
        openingTags: [],
        passesSourceQuality: true,
        popularity: 96,
        rating: 1529,
        ratingBand: 30,
        ratingDeviation: 74,
        themes: ["advantage", "endgame", "short"]
      });
      expect(result.row.randKey).toBe(lichessRandKey("0000D"));
      expect(result.flags).toEqual({ badGameUrl: false, badOpeningTags: false, unknownThemes: [] });
    });

    it("hashes exactly what materialisation will store (post-setup FEN + normalised moves[1..])", () => {
      const evaluation = new AssignmentEvaluationService({} as StockfishService);
      for (const line of [PLAIN, MATE_WITH_OPENING, PROMOTION_MATE]) {
        const result = prepareLine(line);
        if (!result.ok) throw new Error(`${line}: ${result.reason}`);
        const [setup, ...rest] = result.row.moves.split(" ");
        const chess = new Chess(assertValidFen(result.row.fen));
        chess.move({ from: setup.slice(0, 2), to: setup.slice(2, 4), promotion: setup.slice(4) || undefined });
        const solution = evaluation.normalizeSolution(chess.fen(), rest.map((uci) => ({ san: "", uci })));
        expect(result.row.contentHash).toBe(puzzleContentHash(chess.fen(), solution));
      }
    });

    it("accepts a mate line that ends in checkmate, including a promotion", () => {
      expect(prepareLine(MATE_WITH_OPENING).ok).toBe(true);
      expect(prepareLine(PROMOTION_MATE).ok).toBe(true);
    });

    it("applies the source-quality thresholds", () => {
      const result = prepareLine(MATE_WITH_OPENING);
      if (!result.ok) throw new Error(result.reason);
      expect(result.row.passesSourceQuality).toBe(false); // RD 223, 11 plays
      expect(result.row.openingTags).toEqual(["French_Defense", "French_Defense_Tarrasch_Variation"]);
    });

    it("flags, but keeps, unknown themes, odd opening tags and foreign game URLs", () => {
      let line = withColumn(PLAIN, 7, "advantage endgame brandNewTheme");
      line = withColumn(line, 8, "https://example.com/x");
      line = withColumn(line, 9, "Bad;Tag");
      const result = prepareLine(line);
      if (!result.ok) throw new Error(result.reason);
      expect(result.flags).toEqual({ badGameUrl: true, badOpeningTags: true, unknownThemes: ["brandNewTheme"] });
    });
  });

  describe("prepareLine — rejects", () => {
    it.each([
      ["COLUMN_COUNT", PLAIN.slice(0, PLAIN.lastIndexOf(","))],
      ["BAD_ID", withColumn(PLAIN, 0, "00-0D")],
      ["BAD_ID", withColumn(PLAIN, 0, "000D")],
      ["BAD_FEN", withColumn(PLAIN, 1, "not a fen")],
      ["MOVE_COUNT", withColumn(PLAIN, 2, "d3d6 f8d8 d6d8")],
      ["MOVE_COUNT", withColumn(PLAIN, 2, "")],
      ["BAD_MOVE_TOKEN", withColumn(PLAIN, 2, "d3d6 f8d8 d6d8 f6d9")],
      ["BAD_MOVE_TOKEN", withColumn(PLAIN, 2, "D3D6 f8d8")],
      ["ILLEGAL_MOVE", withColumn(PLAIN, 2, "d3d6 f8d8 d6d8 a1a8")],
      ["MATE_NOT_CHECKMATE", withColumn(PLAIN, 7, "mate endgame")],
      ["BAD_RATING", withColumn(PLAIN, 3, "99")],
      ["BAD_RATING", withColumn(PLAIN, 3, "15.5")],
      ["BAD_RATING_DEVIATION", withColumn(PLAIN, 4, "-1")],
      ["BAD_POPULARITY", withColumn(PLAIN, 5, "101")],
      ["BAD_NB_PLAYS", withColumn(PLAIN, 6, "")],
      ["NO_THEMES", withColumn(PLAIN, 7, "")]
    ])("%s", (reason, line) => {
      expect(rejectReason(prepareLine(line))).toBe(reason);
    });
  });

  describe("derived columns", () => {
    it("randKey is the first 31 bits of sha1(id)", () => {
      const expected = parseInt(createHash("sha1").update("0000D").digest("hex").slice(0, 8), 16) & 0x7fffffff;
      expect(lichessRandKey("0000D")).toBe(expected);
      expect(lichessRandKey("zzzzz")).toBeLessThanOrEqual(0x7fffffff);
    });

    it("ratingBand is floor(rating / 50)", () => {
      expect([399, 400, 449, 450, 3323].map(ratingBandOf)).toEqual([7, 8, 8, 9, 66]);
    });

    it("quality gate boundaries are inclusive", () => {
      expect(passesSourceQuality({ nbPlays: 100, popularity: 50, ratingDeviation: 90 })).toBe(true);
      expect(passesSourceQuality({ nbPlays: 99, popularity: 50, ratingDeviation: 90 })).toBe(false);
      expect(passesSourceQuality({ nbPlays: 100, popularity: 49, ratingDeviation: 90 })).toBe(false);
      expect(passesSourceQuality({ nbPlays: 100, popularity: 50, ratingDeviation: 91 })).toBe(false);
    });

    it("id ordinals are dense, distinct and in range", () => {
      expect(lichessIdOrdinal("00000")).toBe(0);
      expect(lichessIdOrdinal("zzzzz")).toBe(LICHESS_ID_SPACE - 1);
      expect(lichessIdOrdinal("0000a")).not.toBe(lichessIdOrdinal("0000A"));
    });
  });

  describe("TSV encoding", () => {
    it("writes one COPY-ready column per CATALOGUE_TSV_COLUMNS entry", () => {
      const result = prepareLine(MATE_WITH_OPENING);
      if (!result.ok) throw new Error(result.reason);
      const cols = toCatalogueTsv(result.row, false).split("\t");
      expect(cols).toHaveLength(CATALOGUE_TSV_COLUMNS.length);
      expect(cols[0]).toBe("0000H");
      expect(cols[TSV_SORT_KEYS.ratingBand - 1]).toBe("31");
      expect(cols[TSV_SORT_KEYS.contentHash - 1]).toBe(result.row.contentHash);
      expect(cols[TSV_SORT_KEYS.passesQualityGate - 1]).toBe("f");
      expect(cols[CATALOGUE_TSV_COLUMNS.indexOf("themes")]).toBe("{mate,mateIn1,middlegame,oneMove}");
      expect(cols[CATALOGUE_TSV_COLUMNS.indexOf("openingTags")]).toBe("{French_Defense,French_Defense_Tarrasch_Variation}");
    });

    it("quotes array elements PostgreSQL would misread, and escapes for COPY", () => {
      expect(pgTextArray([])).toBe("{}");
      expect(pgTextArray(["King's_Pawn", "a-b"])).toBe("{King's_Pawn,a-b}");
      expect(pgTextArray(["null", 'a"b', "c,d", "e\\f"])).toBe('{"null","a\\"b","c,d","e\\\\f"}');
    });
  });
});

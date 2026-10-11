import { Chess as BaseChess } from "chess.js";
import { sanitizeCastlingRights } from "@nexa-chess/types";

/**
 * chess.js with castling rights checked against the position on every load.
 *
 * chess.js trusts a FEN's castling field and castles from wherever the king
 * stands, so a stale `KQkq` on a set-up position offers "O-O" from e4. The
 * constructor, `reset` and `loadPgn` (its `[FEN]` header) all go through
 * `load`, so overriding it here covers every way a position gets in. Import
 * `Chess` from here, never from "chess.js" directly.
 */
export class Chess extends BaseChess {
  override load(fen: string, options?: Parameters<BaseChess["load"]>[1]): void {
    super.load(sanitizeCastlingRights(fen), options);
  }
}

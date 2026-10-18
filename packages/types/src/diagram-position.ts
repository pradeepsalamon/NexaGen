// Validation and provenance for a position imported from a PDF diagram.
//
// A diagram shows where the pieces stand and nothing else: side to move,
// castling rights, the en-passant square and both move counters are not in the
// picture. validateDiagramPosition separates hard errors (the position cannot
// be loaded or cannot exist on a board) from warnings a coach should judge
// (legal to load, unlikely in a real game). Chess.js stays out of this package:
// callers pass a probe built on their own castling-safe Chess wrapper.

export type DiagramIssue = {
  code: string;
  message: string;
};

export type DiagramValidation = {
  errors: DiagramIssue[];
  warnings: DiagramIssue[];
};

/** What the caller's chess library says about a FEN. */
export type DiagramChessProbe = (
  fen: string,
) => { ok: true; inCheck: boolean; legalMoves: number } | { ok: false; error: string };

/** needs-review → (invalid | valid) → confirmed (only by an explicit coach action). */
export type DiagramCandidateStatus = "needs-review" | "invalid" | "valid" | "confirmed";

export const DIAGRAM_CANDIDATE_STATUS_LABELS: Record<DiagramCandidateStatus, string> = {
  "needs-review": "Needs review",
  invalid: "Invalid position",
  valid: "Valid candidate",
  confirmed: "Confirmed by coach",
};

const FILES = "abcdefgh";

/** square ("e4") → FEN letter, for a placement field. Null when malformed. */
export function diagramPlacementSquares(placement: string): Map<string, string> | null {
  const ranks = placement.split("/");
  if (ranks.length !== 8) return null;
  const squares = new Map<string, string>();
  for (let i = 0; i < 8; i += 1) {
    let file = 0;
    for (const ch of ranks[i]) {
      if (/^[1-8]$/.test(ch)) file += Number(ch);
      else if (/^[pnbrqkPNBRQK]$/.test(ch)) {
        if (file < 8) squares.set(`${FILES[file]}${8 - i}`, ch);
        file += 1;
      } else return null;
    }
    if (file !== 8) return null;
  }
  return squares;
}

function placementErrors(placement: string): DiagramIssue[] {
  const ranks = placement.split("/");
  if (ranks.length !== 8) {
    return [{ code: "rank-count", message: `The board needs 8 ranks; this one has ${ranks.length}.` }];
  }
  const errors: DiagramIssue[] = [];
  ranks.forEach((text, i) => {
    let squares = 0;
    for (const ch of text) {
      if (/^[1-8]$/.test(ch)) squares += Number(ch);
      else if (/^[pnbrqkPNBRQK]$/.test(ch)) squares += 1;
      else {
        errors.push({ code: "bad-symbol", message: `Rank ${8 - i} contains "${ch}", which is not a piece.` });
        return;
      }
    }
    if (squares !== 8) {
      errors.push({ code: "rank-length", message: `Rank ${8 - i} has ${squares} squares instead of 8.` });
    }
  });
  return errors;
}

/**
 * Checks a full FEN built from a diagram. Errors block loading; warnings need
 * the coach's judgement. Passing says the position is well-formed and
 * loadable — never that it was reached in a real game.
 */
export function validateDiagramPosition(fen: string, probe?: DiagramChessProbe): DiagramValidation {
  const errors: DiagramIssue[] = [];
  const warnings: DiagramIssue[] = [];
  const fields = fen.trim().split(/\s+/);
  if (fields.length !== 6) {
    return {
      errors: [{ code: "field-count", message: `A FEN has 6 fields; this one has ${fields.length}.` }],
      warnings,
    };
  }
  const [placement, turn, castling, ep, half, full] = fields;
  errors.push(...placementErrors(placement));
  if (turn !== "w" && turn !== "b") errors.push({ code: "turn", message: "Side to move must be White (w) or Black (b)." });
  if (!/^(-|K?Q?k?q?)$/.test(castling) || castling === "") {
    errors.push({ code: "castling-syntax", message: `"${castling}" is not a castling field (use KQkq letters or -).` });
  }
  if (!/^(-|[a-h][36])$/.test(ep)) errors.push({ code: "ep-syntax", message: `"${ep}" is not an en-passant square.` });
  if (!/^\d+$/.test(half)) errors.push({ code: "halfmove", message: "The halfmove clock must be a whole number." });
  if (!/^[1-9]\d*$/.test(full)) errors.push({ code: "fullmove", message: "The move number must be 1 or more." });

  const squares = diagramPlacementSquares(placement);
  if (!squares) return { errors, warnings };

  const count = (p: string) => [...squares.values()].filter((v) => v === p).length;
  for (const [side, king] of [["White", "K"], ["Black", "k"]] as const) {
    const n = count(king);
    if (n === 0) errors.push({ code: "missing-king", message: `${side} has no king.` });
    if (n > 1) errors.push({ code: "extra-king", message: `${side} has ${n} kings.` });
  }
  const backRankPawns = [...squares.entries()]
    .filter(([sq, p]) => (p === "P" || p === "p") && (sq[1] === "1" || sq[1] === "8"))
    .map(([sq]) => sq);
  if (backRankPawns.length) {
    errors.push({
      code: "pawn-back-rank",
      message: `A pawn can't stand on the first or last rank (${backRankPawns.join(", ")}).`,
    });
  }
  const kingSq = (k: string) => [...squares.entries()].find(([, p]) => p === k)?.[0];
  const wk = kingSq("K");
  const bk = kingSq("k");
  if (wk && bk) {
    const df = Math.abs(FILES.indexOf(wk[0]) - FILES.indexOf(bk[0]));
    const dr = Math.abs(Number(wk[1]) - Number(bk[1]));
    if (df <= 1 && dr <= 1) errors.push({ code: "kings-adjacent", message: `The kings stand next to each other (${wk}, ${bk}).` });
  }

  const castlingNeeds: Record<string, [string, string, string, string, string]> = {
    K: ["e1", "K", "h1", "R", "White kingside"],
    Q: ["e1", "K", "a1", "R", "White queenside"],
    k: ["e8", "k", "h8", "r", "Black kingside"],
    q: ["e8", "k", "a8", "r", "Black queenside"],
  };
  if (castling !== "-") {
    for (const flag of castling) {
      const need = castlingNeeds[flag];
      if (!need) continue;
      const [kSq, k, rSq, r, label] = need;
      if (squares.get(kSq) !== k || squares.get(rSq) !== r) {
        errors.push({
          code: "castling-placement",
          message: `${label} castling needs the king on ${kSq} and a rook on ${rSq}.`,
        });
      }
    }
  }

  if (ep !== "-" && /^[a-h][36]$/.test(ep) && (turn === "w" || turn === "b")) {
    const file = ep[0];
    const expectedRank = turn === "w" ? "6" : "3";
    const pawnSq = `${file}${turn === "w" ? "5" : "4"}`;
    const fromSq = `${file}${turn === "w" ? "7" : "2"}`;
    const pawn = turn === "w" ? "p" : "P";
    if (ep[1] !== expectedRank || squares.get(pawnSq) !== pawn || squares.has(ep) || squares.has(fromSq)) {
      errors.push({
        code: "ep-inconsistent",
        message: `En passant on ${ep} needs a pawn that has just moved two squares past it — the position doesn't show one.`,
      });
    }
  }

  for (const [side, pawn, pieces] of [
    ["White", "P", "PNBRQK"],
    ["Black", "p", "pnbrqk"],
  ] as const) {
    const pawns = count(pawn);
    const total = [...pieces].reduce((s, p) => s + count(p), 0);
    if (pawns > 8) warnings.push({ code: "too-many-pawns", message: `${side} has ${pawns} pawns — a side starts with 8.` });
    if (total > 16) warnings.push({ code: "too-many-pieces", message: `${side} has ${total} pieces — a side starts with 16.` });
    const [n, b, r, q] = [pieces[1], pieces[2], pieces[3], pieces[4]].map(count);
    const promoted = Math.max(0, q - 1) + Math.max(0, r - 2) + Math.max(0, b - 2) + Math.max(0, n - 2);
    if (promoted > 0 && promoted > 8 - pawns) {
      warnings.push({
        code: "promotions",
        message: `${side}'s extra pieces need ${promoted} promotion${promoted === 1 ? "" : "s"}, but only ${Math.max(0, 8 - pawns)} pawn${8 - pawns === 1 ? " is" : "s are"} missing.`,
      });
    }
  }

  if (errors.length === 0 && probe) {
    const result = probe(fen);
    if (!result.ok) {
      errors.push({ code: "engine", message: result.error });
    } else {
      // The side that is NOT to move can never be in check: its king could be taken.
      const other = probe([placement, turn === "w" ? "b" : "w", "-", "-", "0", "1"].join(" "));
      if (other.ok && other.inCheck) {
        const waiting = turn === "w" ? "Black" : "White";
        const mover = turn === "w" ? "White" : "Black";
        errors.push({
          code: "opponent-in-check",
          message: `${waiting} is in check but it is ${mover}'s turn — check the side to move.`,
        });
      } else if (result.legalMoves === 0) {
        warnings.push({
          code: "game-over",
          message: result.inCheck
            ? "The side to move is already checkmated."
            : "The side to move has no legal move (stalemate).",
        });
      }
    }
  }
  return { errors, warnings };
}

/** A coach-facing source line for the library and analysis board. */
export type DiagramProvenance = {
  fileName: string;
  page: number;
  /** 1-based number of the diagram on its page. */
  diagram: number;
  corrected: boolean;
};

/** A file name safe to show and store: no path, no control characters, bounded. */
export function sanitizeDiagramFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f<>"`]/g, "").replace(/\s+/g, " ").trim();
  return (clean || "document.pdf").slice(0, 80);
}

export function describeDiagramSource(p: DiagramProvenance): string {
  return `Imported from "${sanitizeDiagramFileName(p.fileName)}", page ${p.page}, diagram ${p.diagram}${p.corrected ? " (corrected by coach)" : ""}.`;
}

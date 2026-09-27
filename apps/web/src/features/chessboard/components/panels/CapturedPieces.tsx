import { useMemo } from "react";
import { useBoardStore } from "../../context/BoardProvider";
import { PieceSymbol } from "chess.js";

interface CapturedPiecesProps {
  color: "white" | "black";
}

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0
};

const PIECE_SYMBOLS: Record<PieceSymbol, string> = {
  p: "♟",
  n: "♞",
  b: "♝",
  r: "♜",
  q: "♛",
  k: "♚"
};

export function CapturedPieces({ color }: CapturedPiecesProps) {
  const { fen } = useBoardStore();

  const { captured, scoreDifference } = useMemo(() => {
    // A simple material counter based on FEN
    // This is run whenever FEN changes.
    // It's not fully historically accurate if pieces are promoted, but sufficient for standard material counts.
    // A robust engine would track actual captures.
    
    // Default counts in standard starting position
    const startingCounts: Record<string, number> = {
      p: 8, n: 2, b: 2, r: 2, q: 1,
      P: 8, N: 2, B: 2, R: 2, Q: 1
    };

    const currentCounts: Record<string, number> = {
      p: 0, n: 0, b: 0, r: 0, q: 0,
      P: 0, N: 0, B: 0, R: 0, Q: 0
    };

    const boardPart = fen.split(" ")[0];
    for (const char of boardPart) {
      if (currentCounts[char] !== undefined) {
        currentCounts[char]++;
      }
    }

    // If we are looking for pieces captured BY white, we look at black pieces missing.
    const sides = color === "white" ? ["p", "n", "b", "r", "q"] : ["P", "N", "B", "R", "Q"];

    const capturedList: string[] = [];
    let myMaterial = 0;
    let enemyMaterial = 0;

    // Calculate captured pieces
    for (const piece of sides) {
      const missing = startingCounts[piece] - currentCounts[piece];
      for (let i = 0; i < missing; i++) {
        capturedList.push(piece.toLowerCase());
      }
    }

    // Calculate score difference
    const allPieces = ["p", "n", "b", "r", "q", "P", "N", "B", "R", "Q"];
    for (const piece of allPieces) {
      const isWhite = piece === piece.toUpperCase();
      const val = PIECE_VALUES[piece.toLowerCase() as PieceSymbol];
      if (isWhite) {
         if (color === "white") myMaterial += currentCounts[piece] * val;
         else enemyMaterial += currentCounts[piece] * val;
      } else {
         if (color === "black") myMaterial += currentCounts[piece] * val;
         else enemyMaterial += currentCounts[piece] * val;
      }
    }

    return { 
      captured: capturedList, 
      scoreDifference: myMaterial - enemyMaterial
    };
  }, [fen, color]);

  // Order of display: Pawns, Knights, Bishops, Rooks, Queens
  const order = ['p', 'n', 'b', 'r', 'q'];
  captured.sort((a, b) => order.indexOf(a) - order.indexOf(b));

  return (
    <div className="flex items-center gap-2 h-6 text-app-muted font-medium">
      <div className="flex gap-0.5 text-xl">
        {captured.map((p, i) => (
          <span key={i} className={color === "white" ? "text-app-muted" : "text-app-text"}>
             {PIECE_SYMBOLS[p as PieceSymbol]}
          </span>
        ))}
      </div>
      {scoreDifference > 0 && (
        <span className="text-sm text-green-500 ml-2">+{scoreDifference}</span>
      )}
    </div>
  );
}

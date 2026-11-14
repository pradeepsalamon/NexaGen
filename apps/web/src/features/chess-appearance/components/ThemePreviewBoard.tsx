import type { BoardThemeId, PieceSetId } from "@nexa-chess/types";

const BACK_RANK = ["R", "N", "B", "Q", "K", "B", "N", "R"] as const;

interface PreviewPiece {
  code: (typeof BACK_RANK)[number] | "P";
  color: "w" | "b";
}

function pieceForSquare(file: number, rank: number): PreviewPiece | null {
  if (rank === 8) return { code: BACK_RANK[file], color: "b" };
  if (rank === 7) return { code: "P", color: "b" };
  if (rank === 2) return { code: "P", color: "w" };
  if (rank === 1) return { code: BACK_RANK[file], color: "w" };
  return null;
}

interface ThemePreviewBoardProps {
  boardThemeId: BoardThemeId;
  pieceSetId: PieceSetId;
  className?: string;
}

/**
 * A static, non-interactive 8x8 preview — not a real chessground instance —
 * for theme/piece-set picker grids (spec §8 "small board previews", §24
 * perf: a picker with several boards shouldn't mount several live engines).
 */
export function ThemePreviewBoard({ boardThemeId, pieceSetId, className }: ThemePreviewBoardProps) {
  const squares = [];
  for (let rank = 8; rank >= 1; rank--) {
    for (let file = 0; file < 8; file++) {
      const isLight = (file + rank) % 2 === 0;
      const piece = pieceForSquare(file, rank);
      squares.push(
        <div
          key={`${file}-${rank}`}
          className={`nexa-preview-square ${isLight ? "nexa-preview-square--light" : "nexa-preview-square--dark"}`}
        >
          {piece && (
            <img
              alt=""
              className="nexa-preview-piece"
              src={`/chess/pieces/${pieceSetId}/${piece.color}${piece.code}.svg`}
            />
          )}
        </div>,
      );
    }
  }

  return (
    <div
      data-nexa-board-theme={boardThemeId}
      className={`nexa-preview-board ${className ?? ""}`}
      aria-hidden="true"
    >
      {squares}
    </div>
  );
}

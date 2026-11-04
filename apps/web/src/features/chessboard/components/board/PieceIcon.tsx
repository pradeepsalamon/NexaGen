"use client";

import { createElement } from "react";
import { useChessAppearance } from "@/features/chess-appearance/context/ChessAppearanceProvider";
import { cn } from "@/lib/utils";

export type PieceRole = "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";

const PIECE_STYLE = {
  position: "static",
  display: "block",
  width: "100%",
  height: "100%",
  backgroundSize: "contain",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "center",
  pointerEvents: "none",
} as const;

/**
 * One piece drawn in the user's piece set (and custom colours). A `.cg-wrap`
 * ancestor plus a real `<piece>` element is what the `pieces.css`
 * `[data-nexa-piece-set] piece.<role>.<color>` rules match; the inline styles
 * undo chessground's absolute 12.5% sizing. Decorative: label the control.
 */
export function PieceIcon({
  role,
  color,
  className,
}: {
  role: PieceRole;
  color: "white" | "black";
  className?: string;
}) {
  const { currentPieceSet, hasCustomPieceColors } = useChessAppearance();
  return (
    <span
      aria-hidden="true"
      className={cn("cg-wrap block", className)}
      data-nexa-piece-set={currentPieceSet}
      data-nexa-piece-recolor={hasCustomPieceColors ? "on" : undefined}
    >
      {createElement("piece", { className: `${role} ${color}`, style: PIECE_STYLE })}
    </span>
  );
}

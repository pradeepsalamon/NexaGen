"use client";

import { useLayoutEffect, useRef } from "react";
import { useChessAppearance } from "@/features/chess-appearance/context/ChessAppearanceProvider";
import { cn } from "@/lib/utils";

export type PieceRole = "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";

/**
 * One piece drawn in the user's piece set (and custom colours). The
 * `pieces.css` rules match `[data-nexa-piece-set] piece.<role>.<color>` under a
 * `.cg-wrap`, so this needs a real `<piece>` element — created here by hand,
 * because React warns about (and may not hydrate) an unknown lowercase tag.
 * The inline styles undo chessground's absolute 12.5% sizing. Decorative:
 * label the control that holds it.
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
  const hostRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const piece = document.createElement("piece");
    piece.className = `${role} ${color}`;
    Object.assign(piece.style, {
      position: "static",
      display: "block",
      width: "100%",
      height: "100%",
      backgroundSize: "contain",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      pointerEvents: "none",
    });
    host.replaceChildren(piece);
    return () => {
      host.replaceChildren();
    };
  }, [role, color]);

  return (
    <span
      ref={hostRef}
      aria-hidden="true"
      className={cn("cg-wrap block", className)}
      data-nexa-piece-set={currentPieceSet}
      data-nexa-piece-recolor={hasCustomPieceColors ? "on" : undefined}
    />
  );
}

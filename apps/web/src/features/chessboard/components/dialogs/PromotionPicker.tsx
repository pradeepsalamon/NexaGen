"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { PieceIcon, type PieceRole } from "../board/PieceIcon";

export type PromotionPiece = "q" | "r" | "b" | "n";

const CHOICES: { piece: PromotionPiece; role: PieceRole; label: string }[] = [
  { piece: "q", role: "queen", label: "Queen" },
  { piece: "r", role: "rook", label: "Rook" },
  { piece: "b", role: "bishop", label: "Bishop" },
  { piece: "n", role: "knight", label: "Knight" },
];

/**
 * The one promotion picker, drawn over the board it belongs to (the parent
 * is `relative`). Real pieces in the user's set, 56px targets, Escape or
 * Cancel puts the pawn back. Focus starts on the queen.
 */
export function PromotionPicker({
  color,
  onSelect,
  onCancel,
  className,
}: {
  color: "white" | "black";
  onSelect: (piece: PromotionPiece) => void;
  onCancel: () => void;
  className?: string;
}) {
  const firstRef = useRef<HTMLButtonElement>(null);
  // Callers pass an inline onCancel: read it through a ref, so a parent
  // re-render neither pulls focus back to the queen nor re-binds the listener.
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);
  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancelRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className={cn("absolute inset-0 z-50 flex items-center justify-center bg-scrim/60 backdrop-blur-sm", className)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="promotion-picker-title"
        className="rounded-panel border border-app-border bg-app-surface p-4 shadow-lift"
      >
        <h3 id="promotion-picker-title" className="mb-3 text-center text-sm font-semibold text-app-text">
          Promote to
        </h3>
        <div className="flex gap-2">
          {CHOICES.map((choice, index) => (
            <button
              key={choice.piece}
              ref={index === 0 ? firstRef : undefined}
              type="button"
              aria-label={choice.label}
              onClick={() => onSelect(choice.piece)}
              className="flex size-14 items-center justify-center rounded-control border border-app-border bg-app-soft p-1.5 transition-colors hover:border-primary/50 hover:bg-primary-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
            >
              <PieceIcon role={choice.role} color={color} className="size-full" />
            </button>
          ))}
        </div>
        <Button className="mt-3" fullWidth onClick={onCancel} size="sm" type="button" variant="neutral">
          Cancel
        </Button>
      </div>
    </div>
  );
}

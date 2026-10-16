"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Color, MouchEvent, Role } from "chessground/types";
import { possibleCastlingFlags, type PieceSetId } from "@nexa-chess/types";
import { RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  composeFen,
  EMPTY_PLACEMENT,
  isPlacementWellFormed,
  parseFen,
  START_FEN,
  type FenParts,
} from "../../lib/fen";
import { useChessAppearance } from "@/features/chess-appearance/context/ChessAppearanceProvider";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";

export interface PositionEditorProps {
  /** Full FEN string. Controlled — the editor never holds its own copy. */
  value: string;
  onChange: (fen: string) => void;
  orientation?: Color;
  className?: string;
  /**
   * false = the board and spare pieces only. For callers that own the other
   * FEN fields themselves — the PDF diagram import, where "not known yet" must
   * not be shown as a ticked default.
   */
  showDetails?: boolean;
}

const ROLES: { role: Role; label: string }[] = [
  { role: "king", label: "King" },
  { role: "queen", label: "Queen" },
  { role: "rook", label: "Rook" },
  { role: "bishop", label: "Bishop" },
  { role: "knight", label: "Knight" },
  { role: "pawn", label: "Pawn" },
];

// Reusable controlled position editor. Single source of truth: the `value` FEN
// string. No dependency on LiveKit, the board store, or any consumer.
export function PositionEditor({
  value,
  onChange,
  orientation = "white",
  className,
  showDetails = true,
}: PositionEditorProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const { currentBoardTheme, currentPieceSet, showCoordinates, hasCustomPieceColors } = useChessAppearance();
  // Latest parts, readable inside the chessground change callback without
  // re-instantiating the board.
  const partsRef = useRef<FenParts>(parseFen(value));
  partsRef.current = parseFen(value);
  const parts = partsRef.current;
  // A flag only counts while its king and rook stand on their home squares.
  const canCastle = possibleCastlingFlags(parts.placement);

  const emit = useCallback(
    (next: Partial<FenParts>) => {
      onChange(composeFen({ ...partsRef.current, ...next }));
    },
    [onChange],
  );

  // Mount chessground once. FEN changes are pushed via the effect below.
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;

    const cg = Chessground(el, {
      fen: partsRef.current.placement,
      orientation,
      coordinates: showCoordinates,
      autoCastle: false,
      movable: { free: true, color: "both", showDests: false },
      draggable: { deleteOnDropOff: true, showGhost: true },
      selectable: { enabled: false },
      drawable: { enabled: false },
      animation: { enabled: false },
      events: {
        change: () => {
          const placement = cg.getFen();
          if (placement !== partsRef.current.placement) {
            emit({ placement });
          }
        },
      },
    });
    apiRef.current = cg;

    return () => {
      cg.destroy();
      apiRef.current = null;
      // destroy() unbinds listeners but leaves the rendered board in the DOM.
      while (el.firstChild) el.removeChild(el.firstChild);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push external / control-driven placement changes to the board.
  useEffect(() => {
    const cg = apiRef.current;
    if (!cg) return;
    if (isPlacementWellFormed(parts.placement) && parts.placement !== cg.getFen()) {
      cg.set({ fen: parts.placement });
    }
  }, [parts.placement]);

  useEffect(() => {
    apiRef.current?.set({ orientation });
  }, [orientation]);

  // chessground caches the board's screen position and only re-reads it on
  // scroll/resize. Content above the board that changes height after mount (a
  // dialog's tabs, an alert, an image loading) would make every drag land on
  // the wrong square — so re-read it as each drag starts.
  const refreshBounds = () => apiRef.current?.state.dom.bounds.clear();

  const spawnPiece = (e: React.MouseEvent | React.TouchEvent, role: Role, color: Color) => {
    e.preventDefault();
    const cg = apiRef.current;
    if (!cg) return;
    refreshBounds();
    cg.dragNewPiece({ role, color }, e.nativeEvent as MouchEvent, true);
  };

  const setCastling = (key: keyof FenParts["castling"], checked: boolean) => {
    emit({ castling: { ...partsRef.current.castling, [key]: checked } });
  };

  return (
    <div className={cn("flex flex-col gap-5 md:flex-row md:items-start md:gap-6", className)}>
      {/* Board + spare pieces. Capped by the visible height too, so on a
          landscape tablet the board, both trays and the dialog's buttons fit
          without scrolling (never narrower than a 6-piece tray). */}
      <div className="w-full max-w-[min(420px,max(284px,calc(100dvh-19rem)))] shrink-0">
        <SpareRow
          color="black"
          pieceSetId={currentPieceSet}
          hasCustomPieceColors={hasCustomPieceColors}
          onSpawn={spawnPiece}
        />
        <div
          ref={boardRef}
          data-testid="position-editor-board"
          onMouseDownCapture={refreshBounds}
          onTouchStartCapture={refreshBounds}
          data-nexa-board-theme={currentBoardTheme}
          data-nexa-piece-set={currentPieceSet}
          data-nexa-piece-recolor={hasCustomPieceColors ? "on" : undefined}
          className="cg-wrap my-2 aspect-square w-full"
        />
        <SpareRow
          color="white"
          pieceSetId={currentPieceSet}
          hasCustomPieceColors={hasCustomPieceColors}
          onSpawn={spawnPiece}
        />
        <p className="mt-2 flex items-center gap-1.5 text-xs text-app-muted">
          <Trash2 className="size-3.5" strokeWidth={2.5} />
          Drag a piece off the board to remove it.
        </p>
      </div>

      {/* Metadata controls */}
      {showDetails ? (
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-app-text">Side to move</legend>
          <div className="flex gap-4 text-sm text-app-text">
            {(["w", "b"] as const).map((side) => (
              <label key={side} className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="position-editor-turn"
                  className="size-4 accent-primary"
                  checked={parts.turn === side}
                  onChange={() => emit({ turn: side })}
                />
                {side === "w" ? "White" : "Black"}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-app-text">Castling</legend>
          <div className="grid grid-cols-2 gap-2 text-sm text-app-text">
            <CastlingBox label="White kingside (O-O)" possible={canCastle.K} checked={parts.castling.K} onChange={(c) => setCastling("K", c)} />
            <CastlingBox label="White queenside (O-O-O)" possible={canCastle.Q} checked={parts.castling.Q} onChange={(c) => setCastling("Q", c)} />
            <CastlingBox label="Black kingside (O-O)" possible={canCastle.k} checked={parts.castling.k} onChange={(c) => setCastling("k", c)} />
            <CastlingBox label="Black queenside (O-O-O)" possible={canCastle.q} checked={parts.castling.q} onChange={(c) => setCastling("q", c)} />
          </div>
          {!(canCastle.K && canCastle.Q && canCastle.k && canCastle.q) && (
            <p className="text-xs text-app-muted">
              Castling needs the king on e1/e8 and that rook on its corner square.
            </p>
          )}
        </fieldset>

        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-sm font-semibold text-app-text">
            En passant
            <Input
              type="text"
              inputMode="text"
              maxLength={2}
              className="min-h-9 w-20 px-3 font-mono font-normal"
              value={parts.enPassant}
              onChange={(e) => emit({ enPassant: e.target.value.trim() || "-" })}
              aria-label="En passant target square"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-app-text">
            Move number
            <Input
              type="number"
              min={1}
              className="min-h-9 w-24 px-3 font-normal"
              value={parts.fullMove}
              onChange={(e) => emit({ fullMove: String(Math.max(1, parseInt(e.target.value, 10) || 1)) })}
              aria-label="Full move number"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onChange(START_FEN)} size="sm" type="button" variant="outline">
            <RotateCcw className="size-3.5" strokeWidth={2.5} />
            Starting position
          </Button>
          <Button onClick={() => emit({ placement: EMPTY_PLACEMENT })} size="sm" type="button" variant="outline">
            <Trash2 className="size-3.5" strokeWidth={2.5} />
            Clear board
          </Button>
        </div>

        <label className="flex flex-col gap-1 text-sm font-semibold text-app-text">
          FEN
          <Input
            className="min-h-9 font-mono font-normal"
            value={value}
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      </div>
      ) : null}
    </div>
  );
}

function SpareRow({
  color,
  pieceSetId,
  hasCustomPieceColors,
  onSpawn,
}: {
  color: Color;
  pieceSetId: PieceSetId;
  hasCustomPieceColors: boolean;
  onSpawn: (e: React.MouseEvent | React.TouchEvent, role: Role, color: Color) => void;
}) {
  return (
    <div className="flex justify-center gap-1">
      {ROLES.map(({ role, label }) => (
        <div
          key={role}
          data-spare-piece={`${color}-${role}`}
          role="button"
          tabIndex={0}
          aria-label={`Add ${color} ${label}`}
          title={`${color === "white" ? "White" : "Black"} ${label}`}
          className="size-11 cursor-grab rounded-control border border-transparent bg-app-soft p-1 transition-colors hover:border-app-border"
          onMouseDown={(e) => onSpawn(e, role, color)}
          onTouchStart={(e) => onSpawn(e, role, color)}
        >
          {/* `.cg-wrap` ancestor + real <piece> element so the pieces.css
              `[data-nexa-piece-set] piece.<role>.<color>` rules apply; inline
              styles undo chessground's absolute 12.5% board sizing. */}
          <span
            className="cg-wrap block size-full"
            data-nexa-piece-set={pieceSetId}
            data-nexa-piece-recolor={hasCustomPieceColors ? "on" : undefined}
          >
            {React.createElement("piece", {
              className: `${role} ${color}`,
              style: {
                position: "static",
                display: "block",
                width: "100%",
                height: "100%",
                backgroundSize: "contain",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
                pointerEvents: "none",
              },
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

function CastlingBox({
  label,
  possible,
  checked,
  onChange,
}: {
  label: string;
  /** False while the king or rook is off its home square: shown unticked and locked. */
  possible: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Checkbox
      checked={possible && checked}
      disabled={!possible}
      id={`castling-${label.replace(/\W+/g, "-").toLowerCase()}`}
      label={label}
      onCheckedChange={(next) => onChange(next === true)}
    />
  );
}

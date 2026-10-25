"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Color, Key, MouchEvent, Role } from "chessground/types";
import { possibleCastlingFlags, type PieceSetId } from "@nexa-chess/types";
import { Eraser, Hand, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  composeFen,
  EMPTY_PLACEMENT,
  inspectFen,
  isPlacementWellFormed,
  parseFen,
  setPlacementSquare,
  START_FEN,
  type FenParts,
} from "../../lib/fen";
import { useChessAppearance } from "@/features/chess-appearance/context/ChessAppearanceProvider";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { SimpleTooltip } from "@/components/ui/Tooltip";

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
  /**
   * Fill the parent's box: the editor becomes that box's one scroller and
   * sizes the board to what is left after the trays and tools, so the whole
   * board — both trays included — fits on screen. The details sit beside the
   * board when there is room, else below it. For the in-place Setup Position
   * workspace; dialogs keep the compact default.
   */
  fill?: boolean;
  /** With `fill`: hide the details so the board takes the whole width. Their values are kept. */
  detailsCollapsed?: boolean;
}

/** Narrowest board: a tray of six 44px pieces. */
const MIN_BOARD_PX = 284;
const GAP_PX = 24;
/** Fill layout: the details column's width, and the board width below which the details go under the board. */
const detailsWidthFor = (width: number) => (width >= 1000 ? 288 : 248);
const SIDE_BY_SIDE_MIN_BOARD_PX = 300;
/** Move / Remove beside the board (left) when the column is wide enough: the board gets their height. */
const TOOL_RAIL_PX = 104;
const TOOL_RAIL_GAP_PX = 12;

type FillLayout = {
  side: boolean;
  toolsBeside: boolean;
  boardPx: number;
  height: number | undefined;
  detailsWidth: number;
};

/**
 * Where the fill layout puts things in a `width` × `height` box when the
 * board column's other rows (trays; tools when below) take `chrome` px.
 */
function fillLayout(width: number, height: number, chrome: number, detailsCollapsed: boolean): FillLayout {
  const detailsWidth = detailsWidthFor(width);
  const side = !detailsCollapsed && width - detailsWidth - GAP_PX >= SIDE_BY_SIDE_MIN_BOARD_PX;
  const column = side ? width - detailsWidth - GAP_PX : width;
  const toolsBeside = column - TOOL_RAIL_PX - TOOL_RAIL_GAP_PX >= MIN_BOARD_PX;
  const boardColumn = toolsBeside ? column - TOOL_RAIL_PX - TOOL_RAIL_GAP_PX : column;
  // Never wider than its column; never shorter than a tray unless the column is.
  const boardPx = Math.floor(Math.min(boardColumn, Math.max(MIN_BOARD_PX, height - chrome)));
  // Side by side, the row is the box's height (the details scroll on their
  // own) — taller only when even the smallest board can't fit, and then the
  // whole editor scrolls. Stacked, the details follow below the board.
  return { side, toolsBeside, boardPx, height: side ? Math.max(height, boardPx + chrome) : undefined, detailsWidth };
}

/**
 * What a tap or press on the board does: "move" = drag pieces as usual,
 * "erase" = remove, `${color}-${role}` = put that piece there.
 */
type EditorTool = "move" | "erase" | `${Color}-${Role}`;

const FEN_LETTER: Record<Role, string> = { king: "k", queen: "q", rook: "r", bishop: "b", knight: "n", pawn: "p" };

function pieceLetter(tool: EditorTool): string | null {
  if (tool === "move" || tool === "erase") return null;
  const [color, role] = tool.split("-") as [Color, Role];
  const letter = FEN_LETTER[role];
  return color === "white" ? letter.toUpperCase() : letter;
}

function pointOf(e: MouseEvent | TouchEvent): [number, number] | null {
  if ("touches" in e) {
    const t = e.touches[0] ?? e.changedTouches[0];
    return t ? [t.clientX, t.clientY] : null;
  }
  return [e.clientX, e.clientY];
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
  fill = false,
  detailsCollapsed = false,
}: PositionEditorProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const boardColumnRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ width: number; height: number; chrome: number } | null>(null);
  const apiRef = useRef<Api | null>(null);
  const [tool, setTool] = useState<EditorTool>("move");
  const toolRef = useRef(tool);
  toolRef.current = tool;
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
      const fen = composeFen({ ...partsRef.current, ...next });
      // Taps can land faster than the parent re-renders: the next one must
      // build on this placement, not on the last rendered `value`.
      partsRef.current = parseFen(fen);
      onChange(fen);
    },
    [onChange],
  );

  // Tap-to-place: with a piece or the eraser selected, a press on the board
  // sets that square (and dragging paints every square crossed) instead of
  // starting chessground's drag. Native capture listeners, so chessground
  // never sees the press; touchstart is non-passive so it can't scroll.
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    let lastKey: Key | undefined;

    const paint = (point: [number, number] | null) => {
      const cg = apiRef.current;
      if (!cg || !point) return;
      const key = cg.getKeyAtDomPos(point);
      if (!key || key === lastKey) return;
      lastKey = key;
      const placement = setPlacementSquare(partsRef.current.placement, key, pieceLetter(toolRef.current));
      if (placement !== partsRef.current.placement) emit({ placement });
    };

    const onDown = (e: MouseEvent | TouchEvent) => {
      if (toolRef.current === "move") return;
      if ("button" in e && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      apiRef.current?.state.dom.bounds.clear();
      lastKey = undefined;
      paint(pointOf(e));

      const touch = e.type === "touchstart";
      const onMove = (ev: MouseEvent | TouchEvent) => {
        if (ev.cancelable) ev.preventDefault();
        paint(pointOf(ev));
      };
      const onUp = () => {
        document.removeEventListener(touch ? "touchmove" : "mousemove", onMove as EventListener);
        document.removeEventListener(touch ? "touchend" : "mouseup", onUp);
        document.removeEventListener("touchcancel", onUp);
      };
      document.addEventListener(touch ? "touchmove" : "mousemove", onMove as EventListener, { passive: false });
      document.addEventListener(touch ? "touchend" : "mouseup", onUp);
      if (touch) document.addEventListener("touchcancel", onUp);
    };

    el.addEventListener("mousedown", onDown as EventListener, { capture: true });
    el.addEventListener("touchstart", onDown as EventListener, { capture: true, passive: false });
    return () => {
      el.removeEventListener("mousedown", onDown as EventListener, { capture: true });
      el.removeEventListener("touchstart", onDown as EventListener, { capture: true });
    };
  }, [emit]);

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

  // Fill layout: measure the scroller's content box and the board column's
  // non-board height (trays, plus tools and hint when they sit below) and
  // size the board to what's left.
  useEffect(() => {
    if (!fill) return;
    const scroller = scrollerRef.current;
    const block = boardColumnRef.current;
    const boardEl = boardRef.current;
    if (!scroller || !block || !boardEl) return;
    const measure = () => {
      const style = getComputedStyle(scroller);
      const width = scroller.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height = scroller.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const chrome = Math.ceil(block.offsetHeight - boardEl.offsetHeight);
      setBox((prev) =>
        prev && prev.width === width && prev.height === height && prev.chrome === chrome
          ? prev
          : { width, height, chrome },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    observer.observe(block);
    measure();
    return () => observer.disconnect();
  }, [fill]);
  const layout = fill && box ? fillLayout(box.width, box.height, box.chrome, detailsCollapsed || !showDetails) : null;

  // chessground caches the board's screen position and only re-reads it on
  // scroll/resize. Content above the board that changes height after mount (a
  // dialog's tabs, an alert, an image loading) would make every drag land on
  // the wrong square — so re-read it as each drag starts.
  const refreshBounds = () => apiRef.current?.state.dom.bounds.clear();

  // Pressing a spare piece starts chessground's drag-new-piece (drop it on a
  // square); a tap without dragging selects it as the tool instead.
  const spawnPiece = (e: React.PointerEvent, role: Role, color: Color) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const cg = apiRef.current;
    if (!cg) return;
    refreshBounds();
    cg.dragNewPiece({ role, color }, e.nativeEvent as unknown as MouchEvent, true);
  };

  const toggleTool = (next: EditorTool) => setTool((current) => (current === next ? "move" : next));

  const fenStatus = inspectFen(value);

  const setCastling = (key: keyof FenParts["castling"], checked: boolean) => {
    emit({ castling: { ...partsRef.current.castling, [key]: checked } });
  };

  // One line at the narrowest board (284px): the fill layout budgets for exactly one.
  const toolHint =
    tool === "move"
      ? "Tap a piece, then squares — or drag."
      : tool === "erase"
        ? "Tap or drag over pieces to remove them."
        : "Tap or drag over squares to place it.";

  const toolsBeside = layout?.toolsBeside ?? false;
  const tools = (
    <div className={cn(toolsBeside ? "flex flex-col gap-2" : "mt-2")} style={toolsBeside ? { width: TOOL_RAIL_PX } : undefined}>
      <div className={cn("flex gap-2", toolsBeside ? "flex-col" : "flex-wrap items-center")} role="group" aria-label="Board tool">
        <ToolButton active={tool === "move"} icon={<Hand className="size-3.5" strokeWidth={2.5} />} onClick={() => setTool("move")}>
          Move
        </ToolButton>
        <ToolButton active={tool === "erase"} icon={<Eraser className="size-3.5" strokeWidth={2.5} />} onClick={() => toggleTool("erase")}>
          Remove
        </ToolButton>
      </div>
      <p className={cn("text-xs text-app-muted", toolsBeside ? "" : "mt-1 truncate")} aria-live="polite">
        {toolHint}
      </p>
    </div>
  );

  const boardAndTrays = (
    <div
      ref={boardColumnRef}
      className={cn(
        "shrink-0",
        fill
          ? "w-full max-w-[420px]"
          : "w-full max-w-[min(420px,max(284px,calc(100dvh-19rem)))]",
      )}
      style={layout ? { width: layout.boardPx, maxWidth: "none" } : undefined}
    >
      <SpareRow
        color="black"
        tool={tool}
        pieceSetId={currentPieceSet}
        hasCustomPieceColors={hasCustomPieceColors}
        onSpawn={spawnPiece}
        onSelect={toggleTool}
      />
      <div
        ref={boardRef}
        data-testid="position-editor-board"
        data-editor-tool={tool}
        onMouseDownCapture={refreshBounds}
        onTouchStartCapture={refreshBounds}
        data-nexa-board-theme={currentBoardTheme}
        data-nexa-piece-set={currentPieceSet}
        data-nexa-piece-recolor={hasCustomPieceColors ? "on" : undefined}
        className={cn(
          "cg-wrap my-2 aspect-square w-full touch-none",
          tool === "erase" && "[&_*]:!cursor-crosshair",
          tool !== "move" && tool !== "erase" && "[&_*]:!cursor-copy",
        )}
      />
      <SpareRow
        color="white"
        tool={tool}
        pieceSetId={currentPieceSet}
        hasCustomPieceColors={hasCustomPieceColors}
        onSpawn={spawnPiece}
        onSelect={toggleTool}
      />
      {toolsBeside ? null : tools}
    </div>
  );

  const board = fill ? (
    // Auto margins centre it and, unlike align-items: center, never push an
    // oversized board above the scroller's reachable top.
    <div
      data-testid="position-editor-board-block"
      className="m-auto flex shrink-0 items-center"
      style={{ gap: toolsBeside ? TOOL_RAIL_GAP_PX : undefined }}
    >
      {toolsBeside ? tools : null}
      {boardAndTrays}
    </div>
  ) : (
    boardAndTrays
  );

  // Escape drops the selected piece first (a surrounding workspace closes on the next one).
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && toolRef.current !== "move") {
      e.preventDefault();
      setTool("move");
    }
  };

  const details = showDetails ? (
      <div
        data-testid="position-editor-details"
        className={cn(
          "flex min-w-0 flex-col gap-4",
          !fill && "flex-1",
          fill && detailsCollapsed && "hidden",
          // Beside the board: its own scroll, and only when it is taller than the row.
          layout?.side && "min-h-0 shrink-0 overflow-y-auto overscroll-contain pr-1",
          fill && !layout?.side && "w-full",
        )}
        style={layout?.side ? { width: layout.detailsWidth } : undefined}
      >
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
          <div className={cn("grid gap-2 text-sm text-app-text", !fill ? "grid-cols-2" : layout?.side ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
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
            aria-invalid={!fenStatus.ok}
            aria-describedby="position-editor-fen-status"
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
        <p id="position-editor-fen-status" className="-mt-2 text-xs" aria-live="polite">
          {!fenStatus.ok ? (
            <span className="text-app-danger-ink">Can&apos;t read this FEN: {fenStatus.error}.</span>
          ) : fenStatus.issues.length > 0 ? (
            <span className="text-warning-ink">
              Set-up position ({fenStatus.issues.join(", ")}). It loads as shown; moves and the engine stay off
              until it is a legal position.
            </span>
          ) : (
            <span className="text-app-muted">Legal position — ready to play from.</span>
          )}
        </p>
      </div>
  ) : null;

  if (fill) {
    return (
      // The one scroller of the workspace: nothing inside clips the board.
      <div
        ref={scrollerRef}
        data-testid="position-editor-scroller"
        className={cn("h-full min-h-0 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4", className)}
        onKeyDown={onKeyDown}
      >
        <div
          className={cn("flex", layout?.side ? "flex-row" : "flex-col gap-5")}
          style={layout ? { height: layout.height, gap: layout.side ? GAP_PX : undefined } : undefined}
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{board}</div>
          {details}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-5 md:flex-row md:items-start md:gap-6", className)} onKeyDown={onKeyDown}>
      {board}
      {details}
    </div>
  );
}

function ToolButton({
  active,
  icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      aria-pressed={active}
      className={cn(active && "border-primary bg-primary/10 text-primary-ink hover:bg-primary/15")}
      onClick={onClick}
      size="sm"
      type="button"
      variant="outline"
    >
      {icon}
      {children}
    </Button>
  );
}

function SpareRow({
  color,
  tool,
  pieceSetId,
  hasCustomPieceColors,
  onSpawn,
  onSelect,
}: {
  color: Color;
  tool: EditorTool;
  pieceSetId: PieceSetId;
  hasCustomPieceColors: boolean;
  onSpawn: (e: React.PointerEvent, role: Role, color: Color) => void;
  onSelect: (tool: EditorTool) => void;
}) {
  // A tap is a press and release on the same spare piece without moving. It
  // can't rely on `click`: chessground's drag ends by cancelling `touchend`,
  // which suppresses the click on touch screens.
  const press = useRef<{ id: string; pointerId: number; x: number; y: number } | null>(null);
  const lastTap = useRef(0);
  const TAP_SLOP_PX = 10;

  return (
    <div className="flex justify-center gap-1" data-spare-tray={color}>
      {ROLES.map(({ role, label }) => {
        const id = `${color}-${role}` as const;
        const selected = tool === id;
        return (
        <SimpleTooltip key={role} label={`${color === "white" ? "White" : "Black"} ${label} — tap to select, or drag`}>
          <div
            data-spare-piece={id}
            data-selected={selected ? "true" : undefined}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            aria-label={`${color === "white" ? "White" : "Black"} ${label}`}
            className={cn(
              // touch-none: a drag from the tray must move the piece, not scroll the page.
              "size-11 cursor-grab touch-none select-none rounded-control border-2 bg-app-soft p-0.5 transition-colors",
              selected ? "border-primary bg-primary/15 shadow-card" : "border-transparent hover:border-app-border",
            )}
            onPointerDown={(e) => {
              press.current = { id, pointerId: e.pointerId, x: e.clientX, y: e.clientY };
              onSpawn(e, role, color);
            }}
            onPointerUp={(e) => {
              const start = press.current;
              press.current = null;
              if (!start || start.id !== id || start.pointerId !== e.pointerId) return;
              if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP_PX) return;
              lastTap.current = Date.now();
              onSelect(id);
            }}
            onPointerCancel={() => {
              press.current = null;
            }}
            // Assistive tech activates with a bare click (no pointer events);
            // a mouse tap's own click is ignored, it was handled on pointerup.
            onClick={() => {
              if (Date.now() - lastTap.current < 500) return;
              onSelect(id);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              onSelect(id);
            }}
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
        </SimpleTooltip>
        );
      })}
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

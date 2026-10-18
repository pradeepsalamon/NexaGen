"use client";

import { useContext, useEffect, useState } from "react";
import { Minus, Plus, RotateCcw, Scale } from "lucide-react";
import {
  materialValue,
  PIECE_VALUES,
  type ValuedPiece,
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { BoardContext } from "@/features/chessboard/context/BoardProvider";
import { cn } from "@/lib/utils";
import {
  readLocal,
  SectionTitle,
  useSharedToolView,
  writeLocal,
} from "../shared";

type Side = "white" | "black";
type Counts = Record<ValuedPiece, number>;
type Pans = Record<Side, Counts>;

const PIECES: ValuedPiece[] = ["q", "r", "b", "n", "p"];
const NAMES: Record<ValuedPiece, string> = {
  b: "Bishop",
  n: "Knight",
  p: "Pawn",
  q: "Queen",
  r: "Rook",
};
const GLYPHS: Record<Side, Record<ValuedPiece, string>> = {
  black: { b: "♝", n: "♞", p: "♟", q: "♛", r: "♜" },
  white: { b: "♗", n: "♘", p: "♙", q: "♕", r: "♖" },
};
const MAX: Counts = { b: 10, n: 10, p: 8, q: 9, r: 10 };
const EMPTY: Counts = { b: 0, n: 0, p: 0, q: 0, r: 0 };
const START: Counts = { b: 2, n: 2, p: 8, q: 1, r: 2 };
const STORAGE_KEY = "nexa-interactives-balance";

/** Piece counts from a FEN's placement field. */
function countsFromFen(fen: string): Pans {
  const scale: Pans = { black: { ...EMPTY }, white: { ...EMPTY } };
  for (const ch of fen.split(" ")[0] ?? "") {
    const piece = ch.toLowerCase() as ValuedPiece;
    if (!(piece in PIECE_VALUES)) continue;
    scale[ch === piece ? "black" : "white"][piece] += 1;
  }
  return scale;
}

/** The coach's presented scale, or null when it isn't a well-formed one. */
function parsePans(raw: unknown): Pans | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Pans = { black: { ...EMPTY }, white: { ...EMPTY } };
  for (const side of ["white", "black"] as Side[]) {
    const counts = (raw as Record<string, unknown>)[side];
    if (!counts || typeof counts !== "object") return null;
    for (const p of PIECES) {
      const n = (counts as Record<string, unknown>)[p];
      if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > MAX[p])
        return null;
      out[side][p] = n;
    }
  }
  return out;
}

function describeEdge(diff: number): string {
  const n = Math.abs(diff);
  if (n === 0) return "Material is level.";
  const side = diff > 0 ? "White" : "Black";
  const hint =
    n === 1
      ? "a pawn"
      : n === 2
        ? "two pawns"
        : n === 3
          ? "a minor piece"
          : n === 5
            ? "a rook"
            : n === 9
              ? "a queen"
              : `${n} pawns' worth`;
  return `${side} is up ${n} point${n === 1 ? "" : "s"} — about ${hint}.`;
}

export function ChessBalanceTool() {
  const board = useContext(BoardContext);
  const [scale, setScale] = useState<Pans>(() =>
    readLocal<Pans>(STORAGE_KEY, { black: { ...START }, white: { ...START } }),
  );
  useEffect(() => writeLocal(STORAGE_KEY, scale), [scale]);
  // A watching student sees the coach's scale, without the controls.
  const { shown, watching } = useSharedToolView(scale, parsePans);

  const white = materialValue(shown.white);
  const black = materialValue(shown.black);
  const diff = white - black;
  // Heavier side sinks; capped so a huge edge still reads as a scale.
  const tilt = Math.max(-14, Math.min(14, diff * 1.5));

  const change = (side: Side, piece: ValuedPiece, delta: number) =>
    setScale((s) => ({
      ...s,
      [side]: {
        ...s[side],
        [piece]: Math.max(0, Math.min(MAX[piece], s[side][piece] + delta)),
      },
    }));

  const pan = (side: Side) => (
    <div className="flex min-h-[3.5rem] w-full flex-wrap content-end justify-center gap-0.5 rounded-b-app border-x-2 border-b-2 border-app-border bg-app-soft px-1 pb-1 text-2xl leading-none">
      {PIECES.flatMap((p) =>
        Array.from({ length: shown[side][p] }, (_, i) => (
          <span key={`${p}${i}`}>{GLYPHS[side][p]}</span>
        )),
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* The scale */}
      <div aria-live="polite" className="space-y-2">
        <div className="relative mx-auto h-44 w-full max-w-sm">
          <div
            className="absolute inset-x-4 top-6 transition-transform duration-500 motion-reduce:transition-none"
            style={{ transform: `rotate(${-tilt}deg)` }}
          >
            <div className="h-1.5 rounded-full bg-app-text" />
            <div className="flex justify-between">
              <div
                className="w-[44%]"
                style={{
                  transform: `rotate(${tilt}deg)`,
                  transformOrigin: "top center",
                }}
              >
                <div className="mx-auto h-5 w-px bg-app-muted" />
                {pan("white")}
              </div>
              <div
                className="w-[44%]"
                style={{
                  transform: `rotate(${tilt}deg)`,
                  transformOrigin: "top center",
                }}
              >
                <div className="mx-auto h-5 w-px bg-app-muted" />
                {pan("black")}
              </div>
            </div>
          </div>
          <div className="absolute bottom-0 left-1/2 h-36 w-2 -translate-x-1/2 rounded-t-full bg-app-text" />
          <div className="absolute bottom-0 left-1/2 h-2 w-24 -translate-x-1/2 rounded-full bg-app-text" />
        </div>
        <div className="grid grid-cols-3 items-center text-center">
          <p>
            <span className="block text-xs font-bold uppercase text-app-muted">
              White
            </span>
            <span className="text-2xl font-extrabold text-app-text">
              {white}
            </span>
          </p>
          <p className="flex items-center justify-center text-app-muted">
            <Scale aria-hidden="true" className="size-6" strokeWidth={2.25} />
          </p>
          <p>
            <span className="block text-xs font-bold uppercase text-app-muted">
              Black
            </span>
            <span className="text-2xl font-extrabold text-app-text">
              {black}
            </span>
          </p>
        </div>
        <p
          className={cn(
            "text-center text-sm font-bold",
            diff === 0 ? "text-app-muted" : "text-primary-ink",
          )}
        >
          {describeEdge(diff)}
        </p>
      </div>

      {watching ? null : (
        <>
          {/* Piece controls */}
          <div className="grid grid-cols-2 gap-3">
            {(["white", "black"] as Side[]).map((side) => (
              <div className="space-y-1.5" key={side}>
                <SectionTitle>
                  {side === "white" ? "White" : "Black"}
                </SectionTitle>
                {PIECES.map((p) => (
                  <div
                    className="flex items-center justify-between gap-1"
                    key={p}
                  >
                    <span className="flex items-center gap-1 text-sm">
                      <span aria-hidden="true" className="text-xl leading-none">
                        {GLYPHS[side][p]}
                      </span>
                      <span className="hidden text-app-muted sm:inline">
                        {PIECE_VALUES[p]}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      <SimpleTooltip
                        label={`Remove a ${side} ${NAMES[p].toLowerCase()}`}
                      >
                        <button
                          aria-label={`Remove a ${side} ${NAMES[p].toLowerCase()}`}
                          className="flex size-8 items-center justify-center rounded-full border border-app-border text-app-muted transition-colors hover:bg-app-soft disabled:opacity-40"
                          disabled={scale[side][p] === 0}
                          onClick={() => change(side, p, -1)}
                          type="button"
                        >
                          <Minus
                            aria-hidden="true"
                            className="size-3.5"
                            strokeWidth={2.5}
                          />
                        </button>
                      </SimpleTooltip>
                      <span className="w-5 text-center text-sm font-bold tabular-nums">
                        {scale[side][p]}
                      </span>
                      <SimpleTooltip
                        label={`Add a ${side} ${NAMES[p].toLowerCase()}`}
                      >
                        <button
                          aria-label={`Add a ${side} ${NAMES[p].toLowerCase()}`}
                          className="flex size-8 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary/85 disabled:opacity-40"
                          disabled={scale[side][p] >= MAX[p]}
                          onClick={() => change(side, p, 1)}
                          type="button"
                        >
                          <Plus
                            aria-hidden="true"
                            className="size-3.5"
                            strokeWidth={2.5}
                          />
                        </button>
                      </SimpleTooltip>
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <p className="text-xs text-app-muted">
            Standard values: pawn 1, knight 3, bishop 3, rook 5, queen 9. Kings
            are priceless, so they aren&apos;t weighed.
          </p>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              onClick={() =>
                setScale({ black: { ...EMPTY }, white: { ...EMPTY } })
              }
              variant="outline"
            >
              <RotateCcw
                aria-hidden="true"
                className="size-4"
                strokeWidth={2.5}
              />
              Empty
            </Button>
            <Button
              onClick={() =>
                setScale({ black: { ...START }, white: { ...START } })
              }
              variant="outline"
            >
              Starting set
            </Button>
            {board ? (
              <Button
                onClick={() => setScale(countsFromFen(board.getState().fen))}
              >
                Weigh the class board
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

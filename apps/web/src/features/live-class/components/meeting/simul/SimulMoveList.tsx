"use client";

import { useEffect, useRef } from "react";
import type { SimulMove } from "@nexa-chess/types";
import { cn } from "@/lib/utils";

type ListMove = Pick<SimulMove, "san" | "uci" | "engine">;

/** Numbered SAN pairs; `blackStarts` when the start position had Black to move. */
export function SimulMoveList({
  moves,
  blackStarts = false,
  showEngine = false,
  className
}: {
  moves: ListMove[];
  blackStarts?: boolean;
  /** Coach only: mark moves the engine played. */
  showEngine?: boolean;
  className?: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [moves.length]);

  const cells: (ListMove | null)[] = blackStarts ? [null, ...moves] : moves;
  const rows: { no: number; white: ListMove | null; black: ListMove | null }[] = [];
  for (let i = 0; i < cells.length; i += 2) {
    rows.push({ no: i / 2 + 1, white: cells[i] ?? null, black: cells[i + 1] ?? null });
  }

  const cell = (move: ListMove | null) =>
    move ? (
      <span className={cn("font-medium text-app-text", showEngine && move.engine && "text-info-ink")}>
        {move.san}
        {showEngine && move.engine ? <sup className="ml-0.5 text-[0.6rem]">E</sup> : null}
      </span>
    ) : (
      <span className="text-app-muted">…</span>
    );

  if (moves.length === 0) {
    return <p className={cn("text-sm text-app-muted", className)}>No moves yet.</p>;
  }

  return (
    <div className={cn("overflow-y-auto text-sm", className)}>
      <ol className="grid grid-cols-[2.25rem_1fr_1fr] gap-x-2 gap-y-0.5">
        {rows.map((row) => (
          <li key={row.no} className="contents">
            <span className="text-app-muted">{row.no}.</span>
            {cell(row.white)}
            {row.black ? cell(row.black) : <span />}
          </li>
        ))}
      </ol>
      <div ref={endRef} />
    </div>
  );
}

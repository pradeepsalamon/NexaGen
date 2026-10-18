"use client";

import { useEffect, useRef, useState } from "react";
import { matchClockRemaining, type LiveMatchGame, type MatchColor } from "@nexa-chess/types";
import { cn } from "@/lib/utils";
import { matchNow } from "../../../hooks/useLiveMatch";

function format(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (ms < 10_000) return `${minutes}:${String(seconds).padStart(2, "0")}.${Math.floor((ms % 1000) / 100)}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Ticks while this side's clock runs; calls `onFlag` once when it reaches zero. */
export function MatchClock({
  game,
  color,
  onFlag,
  compact = false
}: {
  game: LiveMatchGame;
  color: MatchColor;
  onFlag?: () => void;
  compact?: boolean;
}) {
  const running = game.status === "ONGOING" && game.turn === color;
  const [now, setNow] = useState(matchNow);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(matchNow()), 200);
    return () => window.clearInterval(id);
  }, [running]);

  const remaining = matchClockRemaining(game, color, running ? now : matchNow());
  const flaggedFor = useRef<string | null>(null);
  useEffect(() => {
    const key = `${game.id}:${game.ply}`;
    if (!onFlag || !running || remaining === null || remaining > 0 || flaggedFor.current === key) return;
    flaggedFor.current = key;
    onFlag();
  }, [onFlag, running, remaining, game.id, game.ply]);

  if (remaining === null) return null;
  return (
    <span
      className={cn(
        "rounded-control font-mono font-semibold tabular-nums",
        compact ? "px-1.5 py-0.5 text-xs" : "px-2.5 py-1 text-base",
        running
          ? remaining < 20_000
            ? "bg-app-danger/15 text-app-danger-ink"
            : "bg-primary/15 text-primary-ink"
          : "bg-app-soft text-app-muted"
      )}
      aria-label={`${color === "white" ? "White" : "Black"} clock`}
    >
      {format(remaining)}
    </span>
  );
}

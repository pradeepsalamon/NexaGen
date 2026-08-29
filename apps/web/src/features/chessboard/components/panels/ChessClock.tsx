"use client";

import { memo, useEffect, useState } from "react";
import { Timer, Play, Pause, RotateCcw } from "lucide-react";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { cn } from "@/lib/utils";
import { useBoardStore } from "../../context/BoardProvider";
import type { BoardColor } from "../../types/sync";
import { formatClock, remainingMs } from "../../lib/clock";

function useClockTick(active: boolean) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => force((n) => (n + 1) % 1_000_000), 100);
    return () => clearInterval(id);
  }, [active]);
}

const TimeChip = memo(function TimeChip({
  color,
  ms,
  active,
}: {
  color: BoardColor;
  ms: number;
  active: boolean;
}) {
  const low = ms <= 20_000;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border px-3 py-1.5 tabular-nums transition-colors",
        active
          ? "border-primary bg-primary/10 text-app-text"
          : "border-app-border bg-app-surface/70 text-app-muted",
        low && active && "border-red-500 bg-red-500/10 text-red-500",
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide">
        <span
          className={cn(
            "size-2 rounded-full",
            color === "white" ? "bg-white ring-1 ring-app-border" : "bg-neutral-800",
          )}
        />
        {color}
      </span>
      <span className={cn("font-mono text-sm font-semibold", low && "text-red-500")}>
        {formatClock(ms)}
      </span>
    </div>
  );
});

function CoachClockControls() {
  const { clock, configureClock, startClock, pauseClock, resetClock } = useBoardStore();
  const [minutes, setMinutes] = useState(String(Math.round(clock.initialMs / 60000) || 5));
  const [increment, setIncrement] = useState(String(Math.round(clock.incrementMs / 1000)));

  const apply = () => {
    const initialMs = Math.max(1, Number(minutes) || 5) * 60_000;
    const incrementMs = Math.max(0, Number(increment) || 0) * 1000;
    configureClock({ initialMs, incrementMs });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Clock settings"
          title="Clock settings"
          className="flex size-8 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-app-soft hover:text-app-text"
        >
          <Timer className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <p className="text-xs font-semibold text-app-text">Chess clock</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="clock-minutes" className="text-[11px]">Minutes</Label>
            <Input
              id="clock-minutes"
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="clock-increment" className="text-[11px]">Increment (s)</Label>
            <Input
              id="clock-increment"
              inputMode="numeric"
              value={increment}
              onChange={(e) => setIncrement(e.target.value)}
            />
          </div>
        </div>
        <Button size="sm" variant="secondary" className="w-full" onClick={apply}>
          Set {minutes || 5}+{increment || 0}
        </Button>
        <div className="flex gap-2">
          {clock.running ? (
            <Button size="sm" variant="outline" className="flex-1" onClick={pauseClock}>
              <Pause className="size-3.5" /> Pause
            </Button>
          ) : (
            <Button size="sm" variant="primary" className="flex-1" onClick={() => startClock()}>
              <Play className="size-3.5" /> Start
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={resetClock} aria-label="Reset clock">
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Shared chess clock display. Coaches also get a settings/start/pause control.
 * Time is derived from the store's `clock` slice on every frame while running.
 */
export function ChessClock({ className }: { className?: string }) {
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const { clock, orientation } = useBoardStore();

  useClockTick(clock.running !== null);

  if (!clock.enabled) {
    return isCoach ? (
      <div className={cn("flex items-center justify-center", className)}>
        <CoachClockControls />
      </div>
    ) : null;
  }

  const now = Date.now();
  const top: BoardColor = orientation === "white" ? "black" : "white";
  const bottom: BoardColor = orientation === "white" ? "white" : "black";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex flex-col gap-1">
        <TimeChip color={top} ms={remainingMs(clock, top, now)} active={clock.running === top} />
        <TimeChip color={bottom} ms={remainingMs(clock, bottom, now)} active={clock.running === bottom} />
      </div>
      {isCoach && <CoachClockControls />}
    </div>
  );
}

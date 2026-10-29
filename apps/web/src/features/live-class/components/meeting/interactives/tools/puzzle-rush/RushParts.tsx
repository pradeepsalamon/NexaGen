"use client";

import { useEffect, useState } from "react";
import { Car, Check, Flag, X } from "lucide-react";
import {
  comboLevel,
  comboPercent,
  PUZZLE_RACER_CONFIG,
  PUZZLE_STORM_CONFIG,
  type PuzzleRushMode,
  type PuzzleRushStanding,
} from "@nexa-chess/types";
import { cn } from "@/lib/utils";
import { formatRushClock } from "../../../../../hooks/usePuzzleRush";
import { rushAccuracy, type RushFeedback, type RushResult } from "../../../../../lib/puzzleRushRun";
import { SectionTitle } from "../../shared";

export const RUSH_LABEL: Record<PuzzleRushMode, string> = { RACER: "Puzzle Racer", STORM: "Puzzle Storm" };

/** The rules, as Lichess states them. */
export function RushRules({ mode }: { mode: PuzzleRushMode }) {
  const items =
    mode === "STORM"
      ? [
          `Solve as many puzzles as you can in ${PUZZLE_STORM_CONFIG.initialSeconds / 60} minutes. The clock starts with your first move.`,
          "Puzzles get harder as you go.",
          `A wrong move costs ${PUZZLE_STORM_CONFIG.malusSeconds} seconds and moves on to the next puzzle.`,
          "Correct moves in a row build a combo: 5, 12, 20 and 30 add 3, 5, 7 and 10 seconds.",
        ]
      : [
          `Race the whole class through the same puzzles for ${PUZZLE_RACER_CONFIG.durationSeconds} seconds.`,
          "Every correct move is a point. Puzzles get harder as you go.",
          "A wrong move skips the puzzle and breaks your combo.",
          "Combos of 5, 12, 20 and 30 add 1, 2, 3 and 4 bonus points. You may skip one move per race.",
        ];
  return (
    <ul className="space-y-1.5 text-sm text-app-muted">
      {items.map((item) => (
        <li className="flex gap-2" key={item}>
          <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Lichess' combo bar: progress to the next level, and the level badges. */
export function ComboBar({ mode, combo }: { mode: PuzzleRushMode; combo: number }) {
  const levels = mode === "STORM" ? PUZZLE_STORM_CONFIG.combo : PUZZLE_RACER_CONFIG.combo;
  const level = comboLevel(levels, combo);
  const percent = comboPercent(levels, combo);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-app-muted">Combo</span>
        <span className="text-lg font-extrabold tabular-nums text-app-text">{combo}</span>
      </div>
      <div
        aria-label={`Combo ${combo}`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(percent)}
        className="h-2.5 overflow-hidden rounded-full bg-app-soft"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex gap-1">
        {levels.slice(1).map(([threshold, bonus], i) => (
          <span
            className={cn(
              "flex-1 rounded-control px-1 py-0.5 text-center text-[0.6875rem] font-bold tabular-nums",
              level > i ? "bg-primary text-on-primary" : "bg-app-soft text-app-muted",
            )}
            key={threshold}
            title={`${threshold} in a row`}
          >
            {mode === "STORM" ? `${bonus}s` : `+${bonus}`}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The "+3s" / "-10s" / "✓" pop beside the clock. */
export function FeedbackPop({ feedback }: { feedback: RushFeedback | null }) {
  const [shown, setShown] = useState<RushFeedback | null>(null);
  useEffect(() => {
    if (!feedback) return;
    setShown(feedback);
    const id = window.setTimeout(() => setShown(null), 900);
    return () => window.clearTimeout(id);
  }, [feedback]);
  if (!shown) return <span aria-hidden="true" className="inline-block w-12" />;
  return (
    <span
      aria-live="polite"
      className={cn(
        "inline-block w-12 animate-in fade-in slide-in-from-bottom-2 text-center text-sm font-extrabold duration-200",
        shown.kind === "bad" ? "text-app-danger-ink" : shown.kind === "bonus" ? "text-primary-ink" : "text-success-ink",
      )}
      key={shown.id}
    >
      {shown.text}
    </span>
  );
}

/** Lichess Racer's track: one lane per player, the car as far along as their score. */
export function RaceTrack({
  meId,
  standings,
}: {
  meId: string | null | undefined;
  standings: PuzzleRushStanding[];
}) {
  const leader = standings.reduce((max, s) => Math.max(max, s.score), 0);
  const goal = Math.max(30, leader);
  if (standings.length === 0) {
    return <p className="rounded-control bg-app-soft px-3 py-2 text-sm text-app-muted">Waiting for racers…</p>;
  }
  return (
    <ol aria-label="Race track" className="space-y-1.5">
      {standings.map((s) => {
        const mine = s.studentId === meId;
        const pct = Math.min(100, (s.score / goal) * 100);
        return (
          <li
            className={cn(
              "rounded-control border px-2 py-1.5",
              mine ? "border-primary bg-primary/10" : "border-app-border bg-app-surface",
            )}
            key={s.studentId}
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className={cn("truncate font-semibold", mine ? "text-primary-ink" : "text-app-text")}>
                {s.rank}. {s.name}
                {s.isCoach ? " · coach" : ""}
                {mine ? " (you)" : ""}
              </span>
              <span className="font-extrabold tabular-nums text-app-text">{s.score}</span>
            </div>
            <div className="relative mt-1 h-5 rounded-full bg-app-soft">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary/20 transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${pct}%` }}
              />
              <Car
                aria-hidden="true"
                className={cn(
                  "absolute top-1/2 size-4 -translate-y-1/2 transition-[left] duration-500 motion-reduce:transition-none",
                  mine ? "text-primary-ink" : "text-app-muted",
                )}
                strokeWidth={2.5}
                style={{ left: `calc(${pct}% - ${pct > 4 ? "1rem" : "0rem"})` }}
              />
              <Flag
                aria-hidden="true"
                className="absolute right-1 top-1/2 size-3.5 -translate-y-1/2 text-app-muted"
                strokeWidth={2.5}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Ranked class standings for a round. */
export function RushStandings({
  meId,
  mode,
  standings,
}: {
  meId?: string | null;
  mode: PuzzleRushMode;
  standings: PuzzleRushStanding[];
}) {
  if (standings.length === 0) {
    return <p className="rounded-control bg-app-soft px-3 py-2 text-sm text-app-muted">Nobody has played yet.</p>;
  }
  return (
    <div className="overflow-hidden rounded-control border border-app-border">
      <table className="w-full text-sm">
        <thead className="bg-app-soft text-left text-[0.6875rem] font-bold uppercase tracking-wide text-app-muted">
          <tr>
            <th className="px-2 py-1.5" scope="col">#</th>
            <th className="px-2 py-1.5" scope="col">Player</th>
            <th className="px-2 py-1.5 text-right" scope="col">{mode === "STORM" ? "Solved" : "Score"}</th>
            <th className="px-2 py-1.5 text-right" scope="col">Accuracy</th>
            <th className="px-2 py-1.5 text-right" scope="col">Combo</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr
              className={cn("border-t border-app-border", s.studentId === meId && "bg-primary/10")}
              key={s.studentId}
            >
              <td className="px-2 py-1.5 font-bold tabular-nums">{s.rank}</td>
              <td className="max-w-[9rem] truncate px-2 py-1.5">
                {s.name}
                {s.isCoach ? <span className="ml-1 text-[0.6875rem] text-app-muted">· coach</span> : null}
                {s.finishedAt ? (
                  <span className="ml-1 text-[0.6875rem] text-app-muted">· done</span>
                ) : s.startedAt ? (
                  <span className="ml-1 text-[0.6875rem] text-primary-ink">· playing</span>
                ) : null}
              </td>
              <td className="px-2 py-1.5 text-right font-extrabold tabular-nums">{s.score}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{rushAccuracy(s.moves, s.errors)}%</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{s.bestCombo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Lichess' end-of-run screen. */
export function RushSummary({
  durationMs,
  mode,
  results,
  standing,
}: {
  durationMs: number | null;
  mode: PuzzleRushMode;
  results: RushResult[];
  standing: Pick<PuzzleRushStanding, "score" | "moves" | "errors" | "bestCombo" | "highestRating" | "rank"> | null;
}) {
  if (!standing) return null;
  const stats: [string, string][] = [
    ["Moves", String(standing.moves)],
    ["Accuracy", `${rushAccuracy(standing.moves, standing.errors)}%`],
    ["Combo", String(standing.bestCombo)],
    ["Time", durationMs !== null ? formatRushClock(durationMs) : "—"],
    [
      "Time per move",
      durationMs !== null && standing.moves > 0 ? `${(durationMs / 1000 / standing.moves).toFixed(1)}s` : "—",
    ],
    ["Highest solved", standing.highestRating !== null ? String(standing.highestRating) : "—"],
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-app bg-primary/10 px-4 py-4 text-center">
        <p className="text-5xl font-extrabold tabular-nums text-primary-ink">{standing.score}</p>
        <p className="mt-1 text-sm font-semibold text-app-text">
          {mode === "STORM" ? "puzzles solved" : "points"}
          {standing.rank > 0 ? ` · #${standing.rank} in class` : ""}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {stats.map(([label, value]) => (
          <div className="rounded-control border border-app-border px-3 py-2" key={label}>
            <dt className="text-[0.6875rem] font-bold uppercase tracking-wide text-app-muted">{label}</dt>
            <dd className="text-base font-extrabold tabular-nums text-app-text">{value}</dd>
          </div>
        ))}
      </dl>
      {results.length > 0 ? (
        <div className="space-y-2">
          <SectionTitle>Puzzles played</SectionTitle>
          <ul className="flex flex-wrap gap-1.5">
            {results.map((r, i) => (
              <li
                className={cn(
                  "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
                  r.solved ? "bg-success/15 text-success-ink" : "bg-app-danger/15 text-app-danger-ink",
                )}
                key={`${r.puzzleId}-${i}`}
              >
                {r.solved ? (
                  <Check aria-label="Solved" className="size-3" strokeWidth={3} />
                ) : (
                  <X aria-label="Missed" className="size-3" strokeWidth={3} />
                )}
                {r.rating}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

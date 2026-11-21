"use client";

import { useState } from "react";
import { Award, Flame, Swords, Trophy, Users } from "lucide-react";
import type { PuzzleRushMode, SoloRushPeriod } from "@nexa-chess/types";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { WidgetError } from "@/components/ui/WidgetError";
import { RUSH_LABEL } from "@/features/live-class/components/meeting/interactives/tools/puzzle-rush/RushParts";
import { cn } from "@/lib/utils";
import { useSoloRushBattles } from "../hooks/useSoloRush";

const MODES: PuzzleRushMode[] = ["STORM", "RACER"];
const PERIODS: { label: string; value: SoloRushPeriod }[] = [
  { label: "This week", value: "WEEK" },
  { label: "All time", value: "ALL" }
];

export function BatchBattlesLeaderboard({
  mode,
  onModeChange
}: {
  mode: PuzzleRushMode;
  onModeChange: (mode: PuzzleRushMode) => void;
}) {
  const [period, setPeriod] = useState<SoloRushPeriod>("WEEK");
  const battles = useSoloRushBattles(mode, period);

  const data = battles.data;
  const topBatch = data?.rows[0];

  return (
    <Card className="space-y-4 p-4">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-control bg-accent-base/15 text-accent-ink">
            <Swords aria-hidden="true" className="size-5" strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-app-text">Batch Battles</h2>
            <p className="text-xs text-app-muted">Academy clan cup — team up with your batch cohort</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Mode"
            onChange={onModeChange}
            options={MODES.map((m) => ({ label: RUSH_LABEL[m], value: m }))}
            value={mode}
          />
          <Segmented label="Period" onChange={setPeriod} options={PERIODS} value={period} />
        </div>
      </div>

      {battles.isError ? (
        <WidgetError message="We couldn't load the batch battles leaderboard." onRetry={() => void battles.refetch()} />
      ) : !data ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          {/* My Batch Standing Banner */}
          {data.myBatches.length > 0 ? (
            <div className="space-y-2">
              {data.myBatches.map((mb) => {
                const isLeader = mb.rank === 1;
                const pointsBehind = topBatch && !isLeader ? topBatch.totalScore - mb.totalScore : 0;
                const pct =
                  mb.totalScore > 0 ? Math.round((mb.myContribution / mb.totalScore) * 100) : 0;

                return (
                  <div
                    className={cn(
                      "flex flex-col gap-3 rounded-card border p-4 sm:flex-row sm:items-center sm:justify-between",
                      isLeader
                        ? "border-accent-base/40 bg-accent-base/10"
                        : "border-app-border bg-app-card"
                    )}
                    key={mb.batchId}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-full font-black text-sm",
                          isLeader
                            ? "bg-accent-base text-accent-ink shadow-sm"
                            : "bg-primary/20 text-primary-ink"
                        )}
                      >
                        #{mb.rank}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-app-text">{mb.batchName}</h3>
                          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary-ink">
                            My Batch
                          </span>
                        </div>
                        <p className="text-xs text-app-muted">
                          {isLeader ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-accent-ink">
                              <Trophy aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                              Leading the Academy Cup!
                            </span>
                          ) : pointsBehind > 0 ? (
                            <span>
                              {pointsBehind} {pointsBehind === 1 ? "pt" : "pts"} behind #1 {topBatch?.batchName}
                            </span>
                          ) : (
                            "Tied for the lead!"
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm sm:text-right">
                      <div>
                        <p className="text-xs text-app-muted">Batch Score</p>
                        <p className="font-extrabold tabular-nums text-app-text">{mb.totalScore} pts</p>
                      </div>
                      <div className="h-8 w-px bg-app-border" />
                      <div>
                        <p className="text-xs text-app-muted">Your Contribution</p>
                        <p className="font-extrabold tabular-nums text-app-text">
                          {mb.myContribution} pts{" "}
                          <span className="text-xs font-normal text-app-muted">({pct}%)</span>
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-card border border-dashed border-app-border p-3 text-center text-xs text-app-muted">
              Play a solo run above to contribute your points to your batch!
            </div>
          )}

          {/* Academy Clan Leaderboard Table */}
          {data.rows.length === 0 ? (
            <Alert variant="info">
              No batch scores recorded yet {period === "WEEK" ? "this week" : ""} — play a run to put your batch on the board!
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">#</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead className="text-right">{mode === "STORM" ? "Solved" : "Points"}</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Active Solvers</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Avg / Solver</TableHead>
                  <TableHead className="hidden text-right md:table-cell">MVP Solver</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow
                    className={cn(row.isMyBatch && "bg-primary/10")}
                    key={row.batchId}
                  >
                      <TableCell className="font-bold tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          {row.rank === 1 ? (
                            <Trophy aria-hidden="true" className="size-4 text-accent-ink" strokeWidth={2.5} />
                          ) : row.rank === 2 ? (
                            <MedalIcon rank={2} />
                          ) : row.rank === 3 ? (
                            <MedalIcon rank={3} />
                          ) : null}
                          {row.rank}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={cn("font-medium", row.isMyBatch && "font-bold text-app-text")}>
                            {row.batchName}
                          </span>
                          {row.isMyBatch ? (
                            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary-ink">
                              My Batch
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-extrabold tabular-nums text-app-text">
                        {row.totalScore}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums text-app-muted sm:table-cell">
                        <span className="inline-flex items-center justify-end gap-1">
                          <Users aria-hidden="true" className="size-3.5 text-app-muted" strokeWidth={2} />
                          {row.activeStudents}
                        </span>
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums text-app-muted sm:table-cell">
                        {row.avgScore.toFixed(1)}
                      </TableCell>
                      <TableCell className="hidden text-right text-app-muted md:table-cell">
                        {row.topStudentName ? (
                          <span className="inline-flex items-center justify-end gap-1 font-medium text-app-text">
                            <Flame aria-hidden="true" className="size-3.5 text-accent-ink" strokeWidth={2.5} />
                            {row.topStudentName}
                            <span className="text-xs font-normal text-app-muted">
                              ({row.topStudentScore} pts)
                            </span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </Card>
  );
}

function MedalIcon({ rank }: { rank: 2 | 3 }) {
  return (
    <Award
      aria-hidden="true"
      className={cn("size-4", rank === 2 ? "text-app-muted" : "text-warning-ink")}
      strokeWidth={2.5}
    />
  );
}

function Segmented<T extends string>({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (value: T) => void;
  options: { label: string; value: T }[];
  value: T;
}) {
  return (
    <div aria-label={label} className="inline-flex rounded-control border border-app-border p-0.5" role="group">
      {options.map((option) => (
        <button
          aria-pressed={option.value === value}
          className={cn(
            "rounded-[6px] px-3 py-1 text-xs font-bold",
            option.value === value ? "bg-primary text-on-primary" : "text-app-muted hover:text-app-text"
          )}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

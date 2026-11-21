"use client";

import { useState } from "react";
import { Trophy, Zap } from "lucide-react";
import type { PuzzleRushMode, SoloRushPeriod, SoloRushRun } from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { WidgetError } from "@/components/ui/WidgetError";
import { RUSH_LABEL, RushRules } from "@/features/live-class/components/meeting/interactives/tools/puzzle-rush/RushParts";
import { formatDateTime } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useRefreshSoloRush, useSoloRushLeaderboard, useSoloRushOverview, useStartSoloRush } from "../hooks/useSoloRush";
import { BatchBattlesLeaderboard } from "./BatchBattlesLeaderboard";
import { SoloRushPlayer } from "./SoloRushPlayer";

const MODES: PuzzleRushMode[] = ["STORM", "RACER"];
const PERIODS: { label: string; value: SoloRushPeriod }[] = [
  { label: "This week", value: "WEEK" },
  { label: "All time", value: "ALL" }
];

/**
 * Puzzle Storm and Puzzle Racer on your own, from the practice area, with a
 * leaderboard for each batch you are in (docs/PUZZLE_RUSH_SOLO.md).
 */
export function SoloRushClient() {
  const overview = useSoloRushOverview();
  const start = useStartSoloRush();
  const refresh = useRefreshSoloRush();
  const [run, setRun] = useState<SoloRushRun | null>(null);
  const [mode, setMode] = useState<PuzzleRushMode>("STORM");
  const [view, setView] = useState<"individual" | "battles">("individual");

  if (run) {
    return (
      <div className="space-y-4">
        <PageHeader title={RUSH_LABEL[run.mode]} />
        <SoloRushPlayer key={run.id} onFinished={refresh} onLeave={() => setRun(null)} run={run} />
      </div>
    );
  }

  const data = overview.data;
  return (
    <div className="space-y-6">
      <PageHeader
        description="The same timed puzzle modes as in class, on your own. Your best score goes on your batch's leaderboard."
        title="Storm and Racer"
      />
      {overview.isError ? (
        <WidgetError message="We couldn't load this page." onRetry={() => void overview.refetch()} />
      ) : !data ? (
        <Skeleton className="h-48 w-full" />
      ) : !data.enabled ? (
        <EmptyState
          description="Puzzle training isn't switched on for your batch yet — ask your coach."
          icon={Zap}
          title="Not available yet"
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {MODES.map((m) => {
              const best = data.bests.find((b) => b.mode === m);
              return (
                <Card className="space-y-3 p-4" key={m}>
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-lg font-bold text-app-text">{RUSH_LABEL[m]}</h2>
                    <p className="text-sm text-app-muted">
                      Your best: <span className="font-extrabold tabular-nums text-app-text">{best?.score ?? "—"}</span>
                    </p>
                  </div>
                  <RushRules mode={m} solo />
                  <Button
                    disabled={start.isPending}
                    onClick={() => start.mutate(m, { onSuccess: setRun })}
                    type="button"
                  >
                    <Zap aria-hidden="true" className="size-4" strokeWidth={2.5} />
                    Play {RUSH_LABEL[m]}
                  </Button>
                </Card>
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <Segmented
              label="Leaderboard View"
              onChange={setView}
              options={[
                { label: "Individual Leaderboard", value: "individual" },
                { label: "Batch Battles ⚔️", value: "battles" }
              ]}
              value={view}
            />
          </div>

          {view === "individual" ? (
            <Leaderboard
              batches={data.batches}
              mode={mode}
              onModeChange={setMode}
            />
          ) : (
            <BatchBattlesLeaderboard
              mode={mode}
              onModeChange={setMode}
            />
          )}
        </>
      )}
    </div>
  );
}

function Leaderboard({
  batches,
  mode,
  onModeChange
}: {
  batches: { id: string; name: string }[];
  mode: PuzzleRushMode;
  onModeChange: (mode: PuzzleRushMode) => void;
}) {
  const userId = useAuthStore((s) => s.user?.id);
  const timeZone = useUserTimeZone();
  const [batchId, setBatchId] = useState<string>(batches[0]?.id ?? "");
  const [period, setPeriod] = useState<SoloRushPeriod>("WEEK");
  const board = useSoloRushLeaderboard(batchId || null, mode, period);

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-app-text">
          <Trophy aria-hidden="true" className="size-5 text-accent-ink" strokeWidth={2.5} />
          Leaderboard
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {batches.length > 1 ? (
            <Select
              aria-label="Batch"
              className="w-auto"
              density="compact"
              onChange={(event) => setBatchId(event.target.value)}
              options={batches.map((b) => ({ label: b.name, value: b.id }))}
              value={batchId}
            />
          ) : null}
          <Segmented
            label="Mode"
            onChange={onModeChange}
            options={MODES.map((m) => ({ label: RUSH_LABEL[m], value: m }))}
            value={mode}
          />
          <Segmented label="Period" onChange={setPeriod} options={PERIODS} value={period} />
        </div>
      </div>

      {board.isError ? (
        <WidgetError message="We couldn't load the leaderboard." onRetry={() => void board.refetch()} />
      ) : !board.data ? (
        <Skeleton className="h-32 w-full" />
      ) : board.data.rows.length === 0 ? (
        <Alert variant="info">No scores yet {period === "WEEK" ? "this week" : ""} — play a run to get on the board.</Alert>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Student</TableHead>
              <TableHead className="text-right">{mode === "STORM" ? "Solved" : "Points"}</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Best combo</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Played</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {board.data.rows.map((row) => (
              <TableRow className={cn(row.studentId === userId && "bg-primary/10")} key={row.studentId}>
                <TableCell className="font-bold tabular-nums">{row.rank}</TableCell>
                <TableCell>
                  {row.name}
                  {row.studentId === userId ? <span className="ml-1 text-xs text-app-muted">(you)</span> : null}
                </TableCell>
                <TableCell className="text-right font-extrabold tabular-nums">{row.score}</TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">{row.bestCombo}</TableCell>
                <TableCell className="hidden text-right text-app-muted sm:table-cell">
                  {formatDateTime(row.achievedAt, timeZone)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
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

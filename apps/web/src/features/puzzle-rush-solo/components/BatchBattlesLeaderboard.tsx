"use client";

import type { ReactNode } from "react";
import { Award, Flame, Swords, Trophy, Users } from "lucide-react";
import type {
  PuzzleRushMode,
  SoloRushBatchBattleRow,
  SoloRushMyBattleBatch,
  SoloRushPeriod
} from "@nexa-chess/types";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { WidgetError } from "@/components/ui/WidgetError";
import { cn } from "@/lib/utils";
import { useSoloRushBattles } from "../hooks/useSoloRush";

/**
 * Batch Battles (docs/PUZZLE_RUSH_SOLO.md § "Batch Battles"): the academy's
 * competing batches ranked by their players' average best score, with the
 * student's own batches on top. The mode and period pickers are the page's.
 */
export function BatchBattlesLeaderboard({
  controls,
  mode,
  period
}: {
  controls: ReactNode;
  mode: PuzzleRushMode;
  period: SoloRushPeriod;
}) {
  const battles = useSoloRushBattles(mode, period);
  const data = battles.data;
  const leader = data?.rows.find((row) => row.rank === 1) ?? null;
  const leaders = data?.rows.filter((row) => row.rank === 1).length ?? 0;
  const when = period === "WEEK" ? " this week" : "";

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Swords aria-hidden="true" className="size-5 text-accent-ink" strokeWidth={2.5} />
          <div>
            <h2 className="text-lg font-bold text-app-text">Batch Battles</h2>
            <p className="text-xs text-app-muted">
              {data
                ? `Batches ranked by their players' average best score. ${data.minPlayers}+ players to get a rank.`
                : "Batches ranked by their players' average best score."}
            </p>
          </div>
        </div>
        {controls}
      </div>

      {battles.isError ? (
        <WidgetError message="We couldn't load Batch Battles." onRetry={() => void battles.refetch()} />
      ) : !data ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          {data.myBatches.some((mine) => mine.takesPart) ? (
            <div className="space-y-2">
              {data.myBatches
                .filter((mine) => mine.takesPart)
                .map((mine) => (
                  <MyBatchBanner
                    key={mine.batchId}
                    leader={leader}
                    mine={mine}
                    minPlayers={data.minPlayers}
                    myBest={data.myBest}
                    sharedLead={leaders > 1}
                    when={when}
                  />
                ))}
            </div>
          ) : null}
          {data.myBatches.some((mine) => !mine.takesPart) ? (
            <p className="text-xs text-app-muted">
              Not in Batch Battles:{" "}
              {data.myBatches
                .filter((mine) => !mine.takesPart)
                .map((mine) => mine.batchName)
                .join(", ")}
              . One-to-one and small batches stay out unless your coach turns them on.
            </p>
          ) : null}

          {data.rows.length === 0 ? (
            <Alert variant="info">No batch has played{when} yet. Play a run to put your batch on the board.</Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">#</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead className="text-right">Average</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Players</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Top player</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <BattleRow key={row.batchId} row={row} />
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </Card>
  );
}

function MyBatchBanner({
  leader,
  mine,
  minPlayers,
  myBest,
  sharedLead,
  when
}: {
  leader: SoloRushBatchBattleRow | null;
  mine: SoloRushMyBattleBatch;
  minPlayers: number;
  myBest: number | null;
  sharedLead: boolean;
  when: string;
}) {
  const leading = mine.rank === 1;
  let status: string;
  if (mine.rank === null) {
    const short = minPlayers - mine.players;
    status = `Needs ${short} more ${short === 1 ? "player" : "players"}${when} to get a rank.`;
  } else if (leading) {
    status = sharedLead ? "Tied for first place!" : "Leading the academy!";
  } else if (leader) {
    const gap = (leader.avgScore - (mine.avgScore ?? 0)).toFixed(1);
    status = `${gap} behind #1 ${leader.batchName} on average.`;
  } else {
    status = "";
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-card border p-4 sm:flex-row sm:items-center sm:justify-between",
        leading ? "border-accent-base/40 bg-accent-base/10" : "border-app-border bg-app-card"
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-black tabular-nums",
            leading ? "bg-accent-base text-accent-ink" : "bg-primary/20 text-primary-ink"
          )}
        >
          {mine.rank === null ? "–" : `#${mine.rank}`}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-app-text">{mine.batchName}</h3>
            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary-ink">My batch</span>
          </div>
          <p className={cn("text-xs", leading ? "font-semibold text-accent-ink" : "text-app-muted")}>{status}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm sm:text-right">
        <Stat label="Batch average" value={mine.avgScore === null ? "–" : mine.avgScore.toFixed(1)} />
        <div className="h-8 w-px bg-app-border" />
        <Stat label="Players" value={String(mine.players)} />
        <div className="h-8 w-px bg-app-border" />
        <Stat label="Your best" value={myBest === null ? "–" : String(myBest)} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-app-muted">{label}</p>
      <p className="font-extrabold tabular-nums text-app-text">{value}</p>
    </div>
  );
}

function BattleRow({ row }: { row: SoloRushBatchBattleRow }) {
  return (
    <TableRow className={cn(row.isMyBatch && "bg-primary/10")}>
      <TableCell className="font-bold tabular-nums">
        {row.rank === null ? (
          <span className="text-app-muted">–</span>
        ) : (
          <span className="inline-flex items-center gap-1">
            {row.rank === 1 ? (
              <Trophy aria-hidden="true" className="size-4 text-accent-ink" strokeWidth={2.5} />
            ) : row.rank <= 3 ? (
              <Award
                aria-hidden="true"
                className={cn("size-4", row.rank === 2 ? "text-app-muted" : "text-warning-ink")}
                strokeWidth={2.5}
              />
            ) : null}
            {row.rank}
          </span>
        )}
      </TableCell>
      <TableCell>
        <span className={cn("font-medium", row.isMyBatch && "font-bold text-app-text")}>{row.batchName}</span>
        {row.isMyBatch ? <span className="ml-1 text-xs text-app-muted">(yours)</span> : null}
        {row.rank === null ? <span className="ml-1 text-xs text-app-muted">· not ranked yet</span> : null}
      </TableCell>
      <TableCell className="text-right font-extrabold tabular-nums text-app-text">{row.avgScore.toFixed(1)}</TableCell>
      <TableCell className="hidden text-right tabular-nums text-app-muted sm:table-cell">
        <span className="inline-flex items-center justify-end gap-1">
          <Users aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
          {row.players}
        </span>
      </TableCell>
      <TableCell className="hidden text-right text-app-muted md:table-cell">
        {row.topPlayerScore === null ? (
          "–"
        ) : (
          <span className="inline-flex items-center justify-end gap-1">
            <Flame aria-hidden="true" className="size-3.5 text-accent-ink" strokeWidth={2.5} />
            {row.topPlayerName ? <span className="font-medium text-app-text">{row.topPlayerName}</span> : null}
            <span className="tabular-nums">{row.topPlayerScore}</span>
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

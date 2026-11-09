"use client";

import { Flame } from "lucide-react";
import type { TournamentTiebreak } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { cn } from "@/lib/utils";
import { points } from "../lib/format";

export type StandingRow = {
  key: string;
  rank: number | null;
  filteredRank: number | null;
  name: string;
  rating: number | null;
  status: string;
  ageGroup: string | null;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  onFire: boolean;
  tiebreaks: Partial<Record<TournamentTiebreak, number>>;
  performance?: number | null;
  highlight?: boolean;
};

const TIEBREAK_SHORT: Record<TournamentTiebreak, string> = {
  BUCHHOLZ: "Buch",
  BUCHHOLZ_CUT1: "BC1",
  DIRECT_ENCOUNTER: "DE",
  MEDIAN_BUCHHOLZ: "MBuch",
  PROGRESSIVE: "Prog",
  SONNEBORN_BERGER: "SB",
  PERFORMANCE: "TPR",
  WINS: "Wins"
};

/** Tiebreaks kept in half-points render as points; counts and ratings stay whole numbers. */
function tiebreakValue(tb: TournamentTiebreak, value: number | undefined): string {
  if (value === undefined) return "–";
  if (tb === "WINS" || tb === "PERFORMANCE") return String(value);
  return String(Number((value / 2).toFixed(2)));
}

export function StandingsTable({
  rows,
  pointsUnit,
  tiebreaks,
  filtered = false,
  compact = false,
  showPerformance = false
}: {
  rows: StandingRow[];
  pointsUnit: "half-points" | "arena-points";
  tiebreaks: TournamentTiebreak[];
  filtered?: boolean;
  compact?: boolean;
  showPerformance?: boolean;
}) {
  if (rows.length === 0) return <EmptyState description="Standings appear once games are played." title="No standings yet" variant="inline" />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>Player</TableHead>
          <TableHead className="text-right">{pointsUnit === "arena-points" ? "Score" : "Pts"}</TableHead>
          {compact ? null : (
            <>
              <TableHead className="hidden text-right sm:table-cell">Games</TableHead>
              <TableHead className="hidden text-right md:table-cell">+ = −</TableHead>
              {tiebreaks.map((tb) => (
                <TableHead className="hidden text-right lg:table-cell" key={tb}>
                  {TIEBREAK_SHORT[tb] ?? tb}
                </TableHead>
              ))}
              {showPerformance ? <TableHead className="hidden text-right lg:table-cell">Perf</TableHead> : null}
            </>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const out = row.status === "WITHDRAWN" || row.status === "DISQUALIFIED";
          return (
            <TableRow className={cn(row.highlight && "bg-primary-soft", out && "text-app-muted")} key={row.key}>
              <TableCell className="font-semibold tabular-nums">{(filtered ? row.filteredRank : row.rank) ?? "–"}</TableCell>
              <TableCell className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={cn("truncate font-medium", out && "line-through")}>{row.name}</span>
                  {row.rating ? <span className="shrink-0 text-xs text-app-muted">{row.rating}</span> : null}
                  {row.onFire ? <Flame aria-label="On a winning streak" className="size-4 shrink-0 text-accent-ink" /> : null}
                  {row.ageGroup && !compact ? (
                    <Badge className="hidden sm:inline-flex" variant="outline">
                      {row.ageGroup}
                    </Badge>
                  ) : null}
                  {out ? <Badge variant="secondary">{row.status === "WITHDRAWN" ? "Withdrawn" : "Disqualified"}</Badge> : null}
                </div>
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{points(row.points, pointsUnit)}</TableCell>
              {compact ? null : (
                <>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{row.played}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {row.wins} {row.draws} {row.losses}
                  </TableCell>
                  {tiebreaks.map((tb) => (
                    <TableCell className="hidden text-right tabular-nums lg:table-cell" key={tb}>
                      {tiebreakValue(tb, row.tiebreaks[tb])}
                    </TableCell>
                  ))}
                  {showPerformance ? <TableCell className="hidden text-right tabular-nums lg:table-cell">{row.performance ?? "–"}</TableCell> : null}
                </>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

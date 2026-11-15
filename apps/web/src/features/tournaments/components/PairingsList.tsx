"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
import type { TournamentGameResult } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { cn } from "@/lib/utils";
import { resultText } from "../lib/format";

export type PairingRow = {
  id: string;
  board: number;
  roundNumber: number;
  white: { name: string; rating: number | null };
  black: { name: string; rating: number | null } | null;
  byeKind: "FULL" | "HALF" | "ZERO" | null;
  status: "ONGOING" | "FINISHED";
  result: TournamentGameResult | null;
  ply: number;
  highlight?: boolean;
};

function Side({ side, winner }: { side: { name: string; rating: number | null }; winner: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className={cn("truncate", winner && "font-semibold")}>{side.name}</span>
      {side.rating ? <span className="shrink-0 text-xs text-app-muted">{side.rating}</span> : null}
    </span>
  );
}

/** The pairings of one round (or any game list): board, white, result, black. */
export function PairingsList({ rows, gameHref, showRound = false }: { rows: PairingRow[]; gameHref: (id: string) => string; showRound?: boolean }) {
  if (rows.length === 0) return <EmptyState description="Nothing has been paired here yet." title="No games" variant="inline" />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">{showRound ? "Rd" : "Bd"}</TableHead>
          <TableHead>White</TableHead>
          <TableHead className="w-20 text-center">Result</TableHead>
          <TableHead>Black</TableHead>
          <TableHead pin="end">
            <span className="sr-only">Open</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const bye = row.black === null;
          return (
            <TableRow className={cn(row.highlight && "bg-primary-soft")} key={row.id}>
              <TableCell className="tabular-nums text-app-muted">{showRound ? row.roundNumber : row.board}</TableCell>
              <TableCell className="max-w-[9rem] sm:max-w-none">
                <Side side={row.white} winner={row.result === "WHITE_WON"} />
              </TableCell>
              <TableCell className="text-center">
                {row.status === "ONGOING" ? (
                  <Badge variant="live">Live</Badge>
                ) : (
                  <span className="font-mono font-semibold tabular-nums">{resultText(row.result, bye)}</span>
                )}
              </TableCell>
              <TableCell className="max-w-[9rem] sm:max-w-none">
                {row.black ? <Side side={row.black} winner={row.result === "BLACK_WON"} /> : <span className="text-app-muted">{byeLabel(row.byeKind)}</span>}
              </TableCell>
              <TableCell pin="end">
                {bye ? null : (
                  <Link
                    aria-label={`Open board ${row.board}`}
                    className="inline-flex size-8 items-center justify-center rounded-control text-app-muted hover:bg-app-soft hover:text-app-text"
                    href={gameHref(row.id)}
                  >
                    <Eye className="size-4" strokeWidth={2.5} />
                  </Link>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function byeLabel(kind: PairingRow["byeKind"]): string {
  if (kind === "HALF") return "Half-point bye";
  if (kind === "ZERO") return "Not paired";
  return "Bye";
}

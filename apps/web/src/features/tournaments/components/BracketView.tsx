"use client";

import Link from "next/link";
import type { TournamentBracketResponse, TournamentKnockoutMatchDto } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { points } from "../lib/format";

function roundName(round: number, total: number): string {
  const left = total - round;
  if (left === 0) return "Final";
  if (left === 1) return "Semi-finals";
  if (left === 2) return "Quarter-finals";
  return `Round ${round}`;
}

function Slot({ side, score, winner, decided }: { side: TournamentKnockoutMatchDto["a"]; score: number; winner: boolean; decided: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-2 px-3 py-1.5 text-sm", winner && "font-semibold text-app-text", decided && !winner && "text-app-muted")}>
      <span className="min-w-0 truncate">{side ? side.name : "—"}</span>
      <span className="shrink-0 tabular-nums">{side ? points(score) : ""}</span>
    </div>
  );
}

/** Knockout bracket: one column per round, scrolling sideways inside its card on small screens. */
export function BracketView({ bracket, gameHref }: { bracket: TournamentBracketResponse; gameHref: (id: string) => string }) {
  if (bracket.matches.length === 0) return <EmptyState description="The bracket is drawn when the tournament starts." title="No bracket yet" variant="inline" />;
  const rounds = Array.from({ length: bracket.rounds }, (_, i) => i + 1);
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-4">
        {rounds.map((round) => (
          <div className="flex w-56 flex-col justify-around gap-3" key={round}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-app-muted">{roundName(round, bracket.rounds)}</h4>
            {bracket.matches
              .filter((m) => m.bracketRound === round)
              .sort((a, b) => a.slot - b.slot)
              .map((match) => {
                const decided = match.status === "DECIDED";
                const card = (
                  <div className="overflow-hidden rounded-control border border-app-border bg-app-surface">
                    <Slot decided={decided} score={match.score.a} side={match.a} winner={decided && !!match.a && match.winnerPlayerId === match.a.playerId} />
                    <div className="border-t border-app-border" />
                    <Slot decided={decided} score={match.score.b} side={match.b} winner={decided && !!match.b && match.winnerPlayerId === match.b.playerId} />
                    {match.status === "ONGOING" || match.decidedBy === "SEED" || match.decidedBy === "FORFEIT" ? (
                      <div className="border-t border-app-border px-3 py-1">
                        {match.status === "ONGOING" ? <Badge variant="live">Live</Badge> : <span className="text-xs text-app-muted">{match.decidedBy === "SEED" ? "Higher seed advances" : "Forfeit"}</span>}
                      </div>
                    ) : null}
                  </div>
                );
                const lastGame = match.gameIds.at(-1);
                return lastGame ? (
                  <Link className="block rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" href={gameHref(lastGame)} key={match.id}>
                    {card}
                  </Link>
                ) : (
                  <div key={match.id}>{card}</div>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}

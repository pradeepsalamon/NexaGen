"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { PracticeBoard } from "@/features/chessboard/components/board/PracticeBoard";
import { useGame, useStandings, useTournament, useTournamentLive } from "../hooks/useTournaments";
import { useTournamentRealtime } from "../hooks/useTournamentRealtime";
import { clockText } from "../lib/format";
import { useLiveClock } from "./GameBoardPanel";

function MiniBoard({ tournamentId, gameId, realtime }: { tournamentId: string; gameId: string; realtime: boolean }) {
  const game = useGame(tournamentId, gameId, { live: false, realtime, slow: true });
  const clocks = useLiveClock(game.data?.game);
  const g = game.data?.game;
  if (!g) return <Skeleton className="aspect-square w-full" />;
  const last = g.moves.at(-1)?.uci;
  return (
    <Link className="flex min-w-0 flex-col gap-1 rounded-control border border-app-border bg-app-surface p-2 hover:border-primary" href={`/tournaments/${tournamentId}/games/${gameId}`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-medium text-app-text">{g.black?.name}</span>
        <span className="font-mono tabular-nums text-app-muted">{clockText(clocks.black)}</span>
      </div>
      <div className="pointer-events-none">
        <PracticeBoard className="max-w-none" fen={g.fen} interactive={false} lastMove={last ? [last.slice(0, 2), last.slice(2, 4)] : null} />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-medium text-app-text">{g.white.name}</span>
        <span className="font-mono tabular-nums text-app-muted">{clockText(clocks.white)}</span>
      </div>
      <span className="text-xs text-app-muted">Board {g.board}</span>
    </Link>
  );
}

/** Every game in progress as a small board; "follow" keeps one player's game first. */
export function BoardsClient({ tournamentId }: { tournamentId: string }) {
  const tournament = useTournament(tournamentId);
  const { connected } = useTournamentRealtime(tournamentId);
  const live = useTournamentLive(tournamentId, { realtime: connected });
  const standings = useStandings(tournamentId, {}, { realtime: connected });
  const [follow, setFollow] = useState("");

  if (tournament.isError) return <Alert variant="error">This tournament isn&apos;t available.</Alert>;
  if (!tournament.data || !live.data) return <Skeleton className="h-96 w-full" />;
  const t = tournament.data.tournament;
  const games = live.data.ongoingGames
    .slice()
    .sort((a, b) => {
      const af = a.white.playerId === follow || a.black?.playerId === follow ? 0 : 1;
      const bf = b.white.playerId === follow || b.black?.playerId === follow ? 0 : 1;
      return af - bf || a.board - b.board;
    })
    .slice(0, 24);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        actions={
          <Select
            aria-label="Follow a player"
            className="w-56"
            onChange={(e) => setFollow(e.target.value)}
            options={[{ label: "Follow a player…", value: "" }, ...(standings.data?.standings ?? []).map((s) => ({ label: s.player.name, value: s.playerId }))]}
            value={follow}
          />
        }
        breadcrumbs={[{ href: "/tournaments", label: "Tournaments" }, { href: `/tournaments/${t.id}`, label: t.name }, { label: "Boards" }]}
        description={live.data.tournament.spectatorDelaySec > 0 ? `Moves are shown ${live.data.tournament.spectatorDelaySec} seconds late.` : undefined}
        title="Live boards"
      />
      {games.length === 0 ? (
        <EmptyState description="Boards appear here while games are being played." title="No games in progress" />
      ) : (
        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {games.map((g) => (
            <MiniBoard gameId={g.id} key={g.id} realtime={connected} tournamentId={tournamentId} />
          ))}
        </div>
      )}
    </div>
  );
}

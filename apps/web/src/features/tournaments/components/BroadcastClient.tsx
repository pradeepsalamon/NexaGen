"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { InfiniteScrollTrigger } from "@/components/ui/InfiniteScrollTrigger";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCommentary, useGame, useTournament, useTournamentLive } from "../hooks/useTournaments";
import { useTournamentRealtime } from "../hooks/useTournamentRealtime";
import { formatLine } from "../lib/format";
import { BroadcastView } from "./BroadcastView";
import { toPairing } from "./TournamentPageClient";
import { PhaseBadge } from "./TournamentBits";

export function BroadcastClient({ tournamentId }: { tournamentId: string }) {
  const tournament = useTournament(tournamentId);
  const { connected } = useTournamentRealtime(tournamentId);
  const live = useTournamentLive(tournamentId, { realtime: connected });
  const feed = useCommentary(tournamentId, connected);
  const featuredId = feed.data?.pages[0]?.featured.gameId ?? live.data?.ongoingGames[0]?.id ?? "";
  const game = useGame(tournamentId, featuredId, { live: false, realtime: connected });

  if (tournament.isError) return <Alert variant="error">This tournament isn&apos;t available.</Alert>;
  if (!tournament.data || !live.data) return <Skeleton className="h-96 w-full" />;
  const t = tournament.data.tournament;
  const arena = t.format === "ARENA";
  return (
    <BroadcastView
      delaySec={live.data.tournament.spectatorDelaySec}
      feed={feed.data?.pages.flatMap((p) => p.items) ?? []}
      feedFooter={<InfiniteScrollTrigger query={feed} />}
      featured={game.data?.game ?? null}
      featuredPending={!!featuredId && game.isLoading}
      gameHref={(id) => `/tournaments/${t.id}/games/${id}`}
      header={
        <PageHeader
          breadcrumbs={[{ href: "/tournaments", label: "Tournaments" }, { href: `/tournaments/${t.id}`, label: t.name }, { label: "Broadcast" }]}
          description={formatLine(t)}
          title={
            <span className="flex flex-wrap items-center gap-2">
              {t.name}
              <PhaseBadge phase={t.phase} />
            </span>
          }
        />
      }
      leaders={live.data.leaders.map((s) => ({ ...s, key: s.playerId, name: s.player.name, rating: s.player.rating }))}
      ongoing={live.data.ongoingGames.map((g) => toPairing(g))}
      pinned={feed.data?.pages[0]?.pinned ?? []}
      pointsUnit={arena ? "arena-points" : "half-points"}
    />
  );
}

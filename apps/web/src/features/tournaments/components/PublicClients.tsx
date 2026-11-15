"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BadgeCheck, ShieldAlert, Trophy } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { useBrandName } from "@/features/branding/context/TenantBrandProvider";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatLongDate } from "@/lib/datetime";
import { useCertificateCheck, usePublicCommentary, usePublicGame, usePublicList, usePublicLive, usePublicStandings } from "../hooks/usePublicTournaments";
import { useTournamentRealtime } from "../hooks/useTournamentRealtime";
import { formatLine } from "../lib/format";
import { BroadcastView } from "./BroadcastView";
import { GameBoardPanel } from "./GameBoardPanel";
import { StandingsTable } from "./StandingsTable";
import { PhaseBadge, TournamentCard } from "./TournamentBits";
import { toPairing } from "./TournamentPageClient";

/** The frame of every public tournament page: no sign-in, no account data. */
export function PublicFrame({ children }: { children: ReactNode }) {
  const brand = useBrandName();
  return (
    <div className="min-h-dvh bg-app-background text-app-text">
      <header className="border-b border-app-border bg-app-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <Link className="flex min-w-0 items-center gap-2 font-semibold text-app-text" href="/watch">
            <Trophy aria-hidden className="size-5 shrink-0 text-accent-ink" />
            <span className="truncate">{brand} tournaments</span>
          </Link>
          <Button asChild size="sm" variant="outline">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl overflow-x-clip p-4 md:p-6">{children}</main>
    </div>
  );
}

export function PublicListClient() {
  const list = usePublicList();
  return (
    <PublicFrame>
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold text-app-text">Watch tournaments</h1>
          <p className="text-sm text-app-muted">Public events of the academy. Moves are shown with a short delay.</p>
        </div>
        {list.isError ? (
          <Alert variant="error">Public tournaments aren&apos;t available here.</Alert>
        ) : !list.data ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton className="h-48" key={i} />
            ))}
          </div>
        ) : list.data.items.length === 0 ? (
          <EmptyState description="Nothing public is scheduled right now." icon={Trophy} title="No public tournaments" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.data.items.map((t) => (
              <TournamentCard href={`/watch/${t.id}`} key={t.id} tournament={t} />
            ))}
          </div>
        )}
      </div>
    </PublicFrame>
  );
}

export function WatchClient({ tournamentId }: { tournamentId: string }) {
  const { connected } = useTournamentRealtime(tournamentId, { publicView: true });
  const live = usePublicLive(tournamentId, connected);
  const feed = usePublicCommentary(tournamentId, connected);
  const standings = usePublicStandings(tournamentId, connected);
  const featuredId = live.data?.featuredGameId ?? live.data?.ongoingGames[0]?.id ?? "";
  const game = usePublicGame(tournamentId, featuredId, connected);

  if (live.isError) {
    return (
      <PublicFrame>
        <Alert title="This tournament can't be watched publicly" variant="error">
          It may be private, or the academy turned off public spectating. Sign in to see academy tournaments.
        </Alert>
      </PublicFrame>
    );
  }
  if (!live.data) {
    return (
      <PublicFrame>
        <Skeleton className="h-96 w-full" />
      </PublicFrame>
    );
  }
  const t = live.data.tournament;
  const rows = (list: typeof live.data.leaders) =>
    list.map((s, i) => ({ ...s, key: `${s.player.number ?? i}-${s.player.name}`, name: s.player.name, rating: s.player.rating }));
  return (
    <PublicFrame>
      <div className="flex flex-col gap-5">
        <BroadcastView
          delaySec={t.spectatorDelaySec}
          feed={feed.data?.items ?? []}
          featured={game.data?.game ?? null}
          featuredPending={!!featuredId && game.isLoading}
          gameHref={(id) => `/watch/${t.id}/games/${id}`}
          header={
            <div className="flex flex-col gap-1">
              <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold text-app-text">
                {t.name}
                <PhaseBadge phase={t.phase} />
              </h1>
              <p className="text-sm text-app-muted">
                {formatLine(t)}
                {live.data.totalRounds ? ` · Round ${live.data.currentRound} of ${live.data.totalRounds}` : ""}
              </p>
            </div>
          }
          leaders={rows(live.data.leaders)}
          ongoing={live.data.ongoingGames.map((g) => toPairing(g))}
          pinned={feed.data?.pinned ?? []}
          pointsUnit={t.format === "ARENA" ? "arena-points" : "half-points"}
        />
        {standings.data && standings.data.standings.length > 0 ? (
          <SectionCard title="Standings">
            <StandingsTable pointsUnit={standings.data.pointsUnit} rows={rows(standings.data.standings)} tiebreaks={[]} />
          </SectionCard>
        ) : null}
      </div>
    </PublicFrame>
  );
}

export function PublicGameClient({ tournamentId, gameId }: { tournamentId: string; gameId: string }) {
  const { connected } = useTournamentRealtime(tournamentId, { publicView: true });
  const game = usePublicGame(tournamentId, gameId, connected);
  return (
    <PublicFrame>
      <div className="flex flex-col gap-4">
        <Link className="text-sm font-medium text-primary-ink hover:underline" href={`/watch/${tournamentId}`}>
          ← Back to the tournament
        </Link>
        {game.isError ? (
          <Alert variant="error">This game can&apos;t be watched publicly.</Alert>
        ) : !game.data ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <>
            <h1 className="text-xl font-semibold text-app-text">
              {game.data.game.white.name} vs {game.data.game.black?.name ?? "bye"}
            </h1>
            <GameBoardPanel game={game.data.game} />
          </>
        )}
      </div>
    </PublicFrame>
  );
}

export function CertificateCheckClient({ code }: { code: string }) {
  const check = useCertificateCheck(code);
  const timeZone = useUserTimeZone();
  const data = check.data;
  return (
    <PublicFrame>
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <h1 className="text-2xl font-semibold text-app-text">Certificate check</h1>
        {check.isLoading ? (
          <Skeleton className="h-40" />
        ) : !data || !data.valid ? (
          <Alert title="Not a valid certificate" variant="error">
            No certificate has the code <span className="font-mono">{code}</span>. Check it was typed exactly as printed.
          </Alert>
        ) : (
          <SectionCard title={data.revoked ? "Revoked certificate" : "Genuine certificate"}>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                {data.revoked ? <ShieldAlert aria-hidden className="size-6 text-app-danger-ink" /> : <BadgeCheck aria-hidden className="size-6 text-success-ink" />}
                <span className={data.revoked ? "font-semibold text-app-danger-ink" : "font-semibold text-success-ink"}>
                  {data.revoked ? "This certificate was revoked by the academy." : "Issued by the academy and still valid."}
                </span>
              </div>
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-app-muted">Awarded to</dt>
                  <dd className="font-medium">{data.name}</dd>
                </div>
                <div>
                  <dt className="text-app-muted">For</dt>
                  <dd className="font-medium">
                    {data.placement} · {data.tournamentName}
                  </dd>
                </div>
                <div>
                  <dt className="text-app-muted">Academy</dt>
                  <dd className="font-medium">{data.academyName}</dd>
                </div>
                <div>
                  <dt className="text-app-muted">Issued</dt>
                  <dd className="font-medium">{formatLongDate(data.issuedAt, timeZone)}</dd>
                </div>
              </dl>
            </div>
          </SectionCard>
        )}
      </div>
    </PublicFrame>
  );
}

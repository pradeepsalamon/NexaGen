"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Megaphone, Star } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { CommentaryFeed, highlightShapes, type FeedItem } from "./CommentaryFeed";
import { GameBoardPanel, type BoardGame } from "./GameBoardPanel";
import { PairingsList, type PairingRow } from "./PairingsList";
import { StandingsTable, type StandingRow } from "./StandingsTable";

/**
 * The dedicated broadcast layout (signed-in and public): the featured game
 * large, the commentary beside it, the leaders and the other boards below.
 * Spectators get every move after the tournament's delay (server-enforced).
 */
export function BroadcastView({
  header,
  featured,
  featuredPending,
  feed,
  pinned,
  feedFooter,
  leaders,
  pointsUnit,
  ongoing,
  gameHref,
  delaySec
}: {
  header: ReactNode;
  featured: BoardGame | null;
  featuredPending: boolean;
  feed: FeedItem[];
  pinned: FeedItem[];
  feedFooter?: ReactNode;
  leaders: StandingRow[];
  pointsUnit: "half-points" | "arena-points";
  ongoing: PairingRow[];
  gameHref: (id: string) => string;
  delaySec: number;
}) {
  const banner = [...pinned, ...feed].find((item) => item.type === "EMERGENCY" || item.type === "ANNOUNCEMENT");
  // The latest move commentary on the featured game draws its highlight on the board.
  const moveNote = featured ? feed.find((item) => item.type === "MOVE" && item.game?.id === featured.id && item.highlight && item.ply === featured.ply) : undefined;
  return (
    <div className="flex flex-col gap-5">
      {header}
      {banner ? (
        <Alert title={banner.type === "EMERGENCY" ? "Important" : "Announcement"} variant={banner.type === "EMERGENCY" ? "error" : "warning"}>
          <span className="inline-flex items-start gap-2">
            <Megaphone aria-hidden className="mt-0.5 size-4 shrink-0" />
            {banner.body}
          </span>
        </Alert>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <SectionCard
          actions={
            <span className="flex items-center gap-2">
              {featured ? (
                <Badge variant="accent">
                  <Star aria-hidden className="size-3" />
                  Featured
                </Badge>
              ) : null}
              {delaySec > 0 ? <Badge variant="outline">{delaySec}s delay</Badge> : null}
            </span>
          }
          title="Featured game"
        >
          {featured ? (
            <div className="flex flex-col gap-2">
              <GameBoardPanel game={featured} shapes={highlightShapes(moveNote?.highlight)} />
              <Link className="self-start text-sm font-medium text-primary-ink hover:underline" href={gameHref(featured.id)}>
                Open this game
              </Link>
            </div>
          ) : featuredPending ? (
            <Skeleton className="h-96" />
          ) : (
            <p className="text-sm text-app-muted">No game is being played right now.</p>
          )}
        </SectionCard>
        <SectionCard title="Commentary">
          <div className="max-h-[70dvh] overflow-y-auto pr-1">
            <CommentaryFeed footer={feedFooter} items={feed} pinned={pinned} />
          </div>
        </SectionCard>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Leaders">
          <StandingsTable compact pointsUnit={pointsUnit} rows={leaders} tiebreaks={[]} />
        </SectionCard>
        <SectionCard title="Other boards">
          <PairingsList gameHref={gameHref} rows={ongoing.filter((g) => g.id !== featured?.id)} />
        </SectionCard>
      </div>
    </div>
  );
}

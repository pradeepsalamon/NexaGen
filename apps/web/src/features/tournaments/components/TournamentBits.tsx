"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, Clock, Trophy, Users } from "lucide-react";
import type { TournamentPhase, TournamentSummaryDto } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { formatLine, phaseLabel, phaseTone } from "../lib/format";

export function PhaseBadge({ phase }: { phase: TournamentPhase }) {
  return <Badge variant={phaseTone(phase)}>{phase === "LIVE" ? <span aria-hidden className="size-1.5 rounded-full bg-app-danger" /> : null}{phaseLabel(phase)}</Badge>;
}

/** Re-renders every `intervalMs` (countdowns, running clocks). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Server time minus browser time, so countdowns follow the server's clock. */
export function useServerOffset(serverNow: string | undefined): number {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (serverNow) setOffset(Date.parse(serverNow) - Date.now());
  }, [serverNow]);
  return offset;
}

type CardTournament = Pick<
  TournamentSummaryDto,
  "id" | "name" | "format" | "phase" | "startsAt" | "timeControl" | "rounds" | "arenaDurationMin" | "bannerUrl" | "playerCount" | "maxPlayers"
> & { host?: TournamentSummaryDto["host"]; myStatus?: TournamentSummaryDto["myStatus"] };

export function TournamentCard({ href, tournament }: { href: string; tournament: CardTournament }) {
  const timeZone = useUserTimeZone();
  return (
    <Link
      className="group flex min-w-0 flex-col overflow-hidden rounded-panel border border-app-border bg-app-surface shadow-card transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      href={href}
    >
      <div className="relative h-24 bg-primary-soft">
        {tournament.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded banner on the CDN
          <img alt="" className="size-full object-cover" src={tournament.bannerUrl} />
        ) : (
          <div className="flex size-full items-center justify-center">
            <Trophy aria-hidden className="size-8 text-primary-ink" />
          </div>
        )}
        <div className="absolute left-3 top-3">
          <PhaseBadge phase={tournament.phase} />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <h3 className="truncate font-semibold text-app-text group-hover:text-primary-ink">{tournament.name}</h3>
        <p className="truncate text-sm text-app-muted">{formatLine(tournament)}</p>
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-app-muted">
          <span className="inline-flex items-center gap-1">
            <CalendarDays aria-hidden className="size-3.5" />
            {formatDateTime(tournament.startsAt, timeZone)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users aria-hidden className="size-3.5" />
            {tournament.playerCount}
            {tournament.maxPlayers ? ` / ${tournament.maxPlayers}` : ""}
          </span>
          {tournament.myStatus ? (
            <Badge variant={tournament.myStatus === "APPROVED" ? "success" : tournament.myStatus === "INVITED" ? "accent" : "secondary"}>
              {playerStatusLabel(tournament.myStatus)}
            </Badge>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export function playerStatusLabel(status: string): string {
  switch (status) {
    case "APPROVED":
      return "Entered";
    case "PENDING":
      return "Awaiting approval";
    case "INVITED":
      return "Invited";
    case "REJECTED":
      return "Not accepted";
    case "WITHDRAWN":
      return "Withdrawn";
    case "DISQUALIFIED":
      return "Disqualified";
    case "DECLINED":
      return "Declined";
    default:
      return status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ");
  }
}

/** A chess clock face. `active` = this side's clock is running. */
export function ClockFace({ active, low, ms, label }: { active: boolean; low: boolean; ms: string; label: string }) {
  return (
    <div
      aria-label={label}
      className={cn(
        "flex min-w-[6.5rem] items-center justify-center gap-1.5 rounded-control border px-3 py-1.5 font-mono text-xl font-semibold tabular-nums",
        active ? "border-primary bg-primary text-on-primary" : "border-app-border bg-app-soft text-app-text",
        active && low && "border-app-danger bg-app-danger text-on-danger"
      )}
      role="timer"
    >
      <Clock aria-hidden className="size-4 opacity-70" />
      {ms}
    </div>
  );
}

/** Previous / next for a paged list (the API's `pagination`). */
export function Pager({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-app-muted">
        Page {page} of {totalPages} · {total} in all
      </p>
      <div className="ml-auto flex items-center gap-2">
        <Button disabled={page <= 1} onClick={() => onPage(page - 1)} size="sm" variant="outline">
          Previous
        </Button>
        <Button disabled={page >= totalPages} onClick={() => onPage(page + 1)} size="sm" variant="outline">
          Next
        </Button>
      </div>
    </div>
  );
}

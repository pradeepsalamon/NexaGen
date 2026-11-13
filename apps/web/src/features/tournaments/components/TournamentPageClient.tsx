"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Clapperboard,
  Clock,
  Grid3x3,
  Pause,
  Pencil,
  Play,
  Radio,
  Send,
  Settings2,
  Share2,
  Swords,
  Trophy,
  Users
} from "lucide-react";
import {
  TOURNAMENT_AGE_LIMITS,
  TOURNAMENT_HOST_ROLE_LABELS,
  TOURNAMENT_ROUND_START_MODE_LABELS,
  TOURNAMENT_VISIBILITY_LABELS,
  type TournamentDetailDto,
  type TournamentLiveDto,
  type TournamentStandingsQuery
} from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { InfiniteScrollTrigger } from "@/components/ui/InfiniteScrollTrigger";
import { LinkedText } from "@/components/ui/FormattedText";
import { SectionCard } from "@/components/ui/SectionCard";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { useToast } from "@/providers/ToastProvider";
import { acceptInvitation, arenaJoin, arenaLeave, declineInvitation, publishTournament, register, withdraw } from "../api/tournamentsApi";
import { useBracket, useCommentary, useInvalidateTournament, usePlayers, useRounds, useStandings, useTournament, useTournamentLive } from "../hooks/useTournaments";
import { useAutoOpenGame } from "../hooks/useAutoOpenGame";
import { useTournamentRealtime } from "../hooks/useTournamentRealtime";
import { countdown, formatLine, nextRoundLine, points } from "../lib/format";
import { BracketView } from "./BracketView";
import { CommentaryFeed } from "./CommentaryFeed";
import { PairingsList, type PairingRow } from "./PairingsList";
import { ReasonDialog } from "./ReasonDialog";
import { StandingsTable } from "./StandingsTable";
import { PhaseBadge, playerStatusLabel, useNow, useServerOffset } from "./TournamentBits";

type GameRef = { name: string; rating: number | null };
export const toPairing = (g: { id: string; board: number; roundNumber: number; white: GameRef; black: GameRef | null; byeKind: PairingRow["byeKind"]; status: PairingRow["status"]; result: PairingRow["result"]; ply: number }, highlight = false): PairingRow => ({
  black: g.black ? { name: g.black.name, rating: g.black.rating } : null,
  board: g.board,
  byeKind: g.byeKind,
  highlight,
  id: g.id,
  ply: g.ply,
  result: g.result,
  roundNumber: g.roundNumber,
  status: g.status,
  white: { name: g.white.name, rating: g.white.rating }
});

function EntryActions({ t }: { t: TournamentDetailDto }) {
  const invalidate = useInvalidateTournament();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const run = async (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    try {
      await fn();
      if (success) toast.success({ title: success });
      await invalidate(t.id);
    } catch {
      // apiFetch showed the reason.
    } finally {
      setBusy(false);
    }
  };
  const v = t.viewer;
  const entryOpen = t.status === "PUBLISHED" || t.status === "LIVE" || t.status === "PAUSED";
  const publish = async (reason?: string) => {
    setBusy(true);
    try {
      const result = await publishTournament(t.id, reason);
      toast.success({ title: result.outcome === "PUBLISHED" ? "Tournament published" : "Sent to an admin for approval" });
      setPublishOpen(false);
      await invalidate(t.id);
    } catch {
      // shown
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {v.myStatus === "INVITED" && entryOpen ? (
          <>
            <Button isLoading={busy} onClick={() => run(() => acceptInvitation(t.id), "You're in")}>
              Accept invitation
            </Button>
            <Button disabled={busy} onClick={() => run(() => declineInvitation(t.id), "Invitation declined")} variant="outline">
              Decline
            </Button>
          </>
        ) : v.myStatus === "APPROVED" || v.myStatus === "PENDING" ? (
          <>
            <Badge variant={v.myStatus === "APPROVED" ? "success" : "warning"}>{playerStatusLabel(v.myStatus)}</Badge>
            {v.canWithdraw ? (
              <Button disabled={busy} onClick={() => run(() => withdraw(t.id), "You've withdrawn")} variant="danger-soft">
                Withdraw
              </Button>
            ) : null}
          </>
        ) : entryOpen && v.signedIn ? (
          v.registrationIssue ? (
            <span className="text-sm text-app-muted">{v.registrationIssue}</span>
          ) : (
            <Button isLoading={busy} onClick={() => run(() => register(t.id), t.registrationRequiresApproval ? "Registration sent for approval" : "You're registered")}>
              <Users className="size-4" />
              Register
            </Button>
          )
        ) : v.myStatus ? (
          <Badge variant="secondary">{playerStatusLabel(v.myStatus)}</Badge>
        ) : null}
        {t.status === "DRAFT" && v.canManage ? (
          t.pendingPublishRequestId ? (
            <Badge variant="warning">Waiting for admin approval</Badge>
          ) : v.publishPath === "FORBIDDEN" ? (
            <span className="text-sm text-app-muted">Ask an admin to publish this tournament.</span>
          ) : (
            <Button isLoading={busy} onClick={() => (v.publishPath === "APPROVAL" ? setPublishOpen(true) : void publish())}>
              <Send className="size-4" />
              {v.publishPath === "APPROVAL" ? "Request publishing" : "Publish"}
            </Button>
          )
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {v.canManage ? (
          <>
            <Button asChild size="sm" variant="outline">
              <Link href={`/tournaments/${t.id}/manage`}>
                <Settings2 className="size-4" />
                Manage
              </Link>
            </Button>
            {t.status === "DRAFT" || t.status === "PUBLISHED" || t.status === "LIVE" || t.status === "PAUSED" ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/tournaments/${t.id}/edit`}>
                  <Pencil className="size-4" />
                  Edit
                </Link>
              </Button>
            ) : null}
          </>
        ) : null}
        {v.canBroadcast ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/tournaments/${t.id}/studio`}>
              <Clapperboard className="size-4" />
              Studio
            </Link>
          </Button>
        ) : null}
        {t.status !== "DRAFT" ? (
          <>
            <Button asChild size="sm" variant="outline">
              <Link href={`/tournaments/${t.id}/broadcast`}>
                <Radio className="size-4" />
                Broadcast
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/tournaments/${t.id}/boards`}>
                <Grid3x3 className="size-4" />
                All boards
              </Link>
            </Button>
          </>
        ) : null}
        {t.visibility === "PUBLIC" && t.status !== "DRAFT" ? (
          <Button
            onClick={() => {
              void navigator.clipboard?.writeText(`${window.location.origin}/watch/${t.id}`);
              toast.success({ message: "Anyone with the link can watch (no sign-in).", title: "Public link copied" });
            }}
            size="sm"
            variant="ghost"
          >
            <Share2 className="size-4" />
            Share
          </Button>
        ) : null}
      </div>
      <ReasonDialog
        busy={busy}
        confirmLabel="Send request"
        description="An academy admin approves public tournaments created by coaches."
        onClose={() => setPublishOpen(false)}
        onConfirm={(reason) => void publish(reason)}
        open={publishOpen}
        title="Request publishing"
      />
    </div>
  );
}

/** How long after the start time the page keeps asking whether the tournament has started. */
const START_RECHECK_MS = 3_000;

/**
 * Before the start: the countdown, and at zero the page asks the server until
 * the tournament is live — so a player waiting here is carried into round 1
 * (the live panel then opens their board) without touching anything.
 */
function StartPanel({ t }: { t: TournamentDetailDto }) {
  const qc = useQueryClient();
  const now = useNow(1000);
  const startsAt = Date.parse(t.startsAt);
  const due = now >= startsAt;
  const entered = t.viewer.myStatus === "APPROVED";
  useEffect(() => {
    if (!due) return;
    const refresh = () => void qc.invalidateQueries({ queryKey: ["tournaments", "detail", t.id] });
    refresh();
    const timer = window.setInterval(refresh, START_RECHECK_MS);
    return () => window.clearInterval(timer);
  }, [due, qc, t.id]);
  // Only close to the start: days ahead, the date in the header says enough.
  if (startsAt - now > 24 * 3600_000) return null;
  const short = t.playerCount < Math.max(2, t.minPlayers);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-control border border-primary bg-primary-soft p-3">
      <Clock aria-hidden className="size-5 shrink-0 text-primary-ink" />
      <div className="min-w-0">
        <p className="font-medium text-app-text">{due ? (short ? "Waiting for enough players to start" : "Starting…") : `Starts in ${countdown(startsAt, now)}`}</p>
        <p className="text-sm text-app-muted">
          {entered
            ? "Stay on this page: your board opens by itself when you are paired."
            : due && short
              ? `It starts as soon as ${Math.max(2, t.minPlayers)} players have entered.`
              : "This page updates by itself when play begins."}
        </p>
      </div>
    </div>
  );
}

function LivePanel({ t, live }: { t: TournamentDetailDto; live: TournamentLiveDto }) {
  const now = useNow(1000);
  const offset = useServerOffset(live.serverNow);
  const invalidate = useInvalidateTournament();
  const [busy, setBusy] = useState(false);
  const serverNow = now + offset;
  const me = live.me;
  const arena = t.format === "ARENA";

  const toggleArena = async () => {
    setBusy(true);
    try {
      await (me?.arenaPaused ? arenaJoin(t.id) : arenaLeave(t.id));
      await invalidate(t.id);
    } catch {
      // shown
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      actions={
        live.tournament.arenaEndsAt ? (
          <Badge variant="outline">Ends in {countdown(Date.parse(live.tournament.arenaEndsAt), serverNow)}</Badge>
        ) : live.totalRounds ? (
          <Badge variant="outline">
            Round {live.currentRound} of {live.totalRounds}
          </Badge>
        ) : null
      }
      title={t.status === "PAUSED" ? "Paused" : "Live now"}
    >
      <div className="flex flex-col gap-4">
        {t.status === "PAUSED" ? <Alert variant="warning">The hosts paused the tournament. Clocks of games in progress keep running.</Alert> : null}
        {me && me.status === "APPROVED" ? (
          <div className="flex flex-wrap items-center gap-3 rounded-control border border-primary bg-primary-soft p-3">
            {me.currentGameId ? (
              <>
                <Swords aria-hidden className="size-5 text-primary-ink" />
                <span className="font-medium text-app-text">Your game is on.</span>
                <Button asChild className="ml-auto">
                  <Link href={`/tournaments/${t.id}/games/${me.currentGameId}`}>Play</Link>
                </Button>
              </>
            ) : (
              <>
                <span className="text-sm text-app-text">
                  {arena ? (me.arenaPaused ? "You're paused and won't be paired." : "Waiting for your next opponent…") : nextRoundLine(live, serverNow)}
                </span>
                {arena ? (
                  <Button className="ml-auto" isLoading={busy} onClick={() => void toggleArena()} variant={me.arenaPaused ? "primary" : "outline"}>
                    {me.arenaPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
                    {me.arenaPaused ? "Rejoin" : "Pause"}
                  </Button>
                ) : null}
              </>
            )}
          </div>
        ) : live.nextRoundAt || live.awaitingHost ? (
          <p className="text-sm text-app-muted">{nextRoundLine(live, serverNow)}</p>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="min-w-0">
            <h3 className="mb-2 text-sm font-semibold text-app-text">Games in progress</h3>
            <PairingsList gameHref={(id) => `/tournaments/${t.id}/games/${id}`} rows={live.ongoingGames.map((g) => toPairing(g, g.id === me?.currentGameId))} />
          </div>
          <div className="min-w-0">
            <h3 className="mb-2 text-sm font-semibold text-app-text">Leaders</h3>
            <StandingsTable
              compact
              pointsUnit={arena ? "arena-points" : "half-points"}
              rows={live.leaders.map((s) => ({ ...s, highlight: s.playerId === me?.playerId, key: s.playerId, name: s.player.name, rating: s.player.rating }))}
              tiebreaks={[]}
            />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function StandingsTab({ t, realtime, myPlayerId }: { t: TournamentDetailDto; realtime: boolean; myPlayerId?: string }) {
  const [ageGroup, setAgeGroup] = useState("");
  const [band, setBand] = useState("");
  const [minRating, maxRating] = band ? band.split("-").map(Number) : [undefined, undefined];
  const query: TournamentStandingsQuery = { ...(ageGroup ? { ageGroup } : {}), ...(band ? { maxRating, minRating } : {}) };
  const standings = useStandings(t.id, query, { realtime });
  const filtered = !!ageGroup || !!band;
  return (
    <div className="flex flex-col gap-3">
      {t.format === "KNOCKOUT" ? null : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select
            aria-label="Age group"
            className="sm:w-44"
            onChange={(e) => setAgeGroup(e.target.value)}
            options={[{ label: "All ages", value: "" }, ...TOURNAMENT_AGE_LIMITS.map((a) => ({ label: `Under ${a}`, value: `U${a}` })), { label: "Open", value: "OPEN" }]}
            value={ageGroup}
          />
          <Select
            aria-label="Rating band"
            className="sm:w-44"
            onChange={(e) => setBand(e.target.value)}
            options={[
              { label: "All ratings", value: "" },
              { label: "Under 1000", value: "0-999" },
              { label: "1000–1399", value: "1000-1399" },
              { label: "1400–1799", value: "1400-1799" },
              { label: "1800+", value: "1800-3500" }
            ]}
            value={band}
          />
        </div>
      )}
      {standings.data ? (
        <StandingsTable
          filtered={filtered}
          pointsUnit={standings.data.pointsUnit}
          rows={standings.data.standings.map((s) => ({ ...s, highlight: s.playerId === myPlayerId, key: s.playerId, name: s.player.name, rating: s.player.rating }))}
          showPerformance={t.format !== "ARENA"}
          tiebreaks={standings.data.tiebreaks}
        />
      ) : (
        <Skeleton className="h-64" />
      )}
    </div>
  );
}

function RoundsTab({ t, myPlayerId }: { t: TournamentDetailDto; myPlayerId?: string }) {
  const knockout = t.format === "KNOCKOUT";
  const rounds = useRounds(t.id, !knockout);
  const bracket = useBracket(t.id, knockout);
  const [selected, setSelected] = useState<number | null>(null);
  const href = (id: string) => `/tournaments/${t.id}/games/${id}`;
  if (knockout) return bracket.data ? <BracketView bracket={bracket.data} gameHref={href} /> : <Skeleton className="h-64" />;
  if (!rounds.data) return <Skeleton className="h-64" />;
  const list = rounds.data.rounds;
  if (list.length === 0) return <PairingsList gameHref={href} rows={[]} />;
  const current = selected ?? list[list.length - 1].number;
  const round = list.find((r) => r.number === current) ?? list[list.length - 1];
  const arena = t.format === "ARENA";
  return (
    <div className="flex flex-col gap-3">
      {arena ? null : (
        <Select
          aria-label="Round"
          className="sm:w-48"
          onChange={(e) => setSelected(Number(e.target.value))}
          options={list.map((r) => ({ label: `Round ${r.number}${r.status === "ONGOING" ? " (live)" : ""}`, value: String(r.number) }))}
          value={String(round.number)}
        />
      )}
      <PairingsList
        gameHref={href}
        rows={(arena ? list.flatMap((r) => r.games) : round.games)
          .slice()
          .reverse()
          .map((g) => toPairing(g, !!myPlayerId && (g.white.playerId === myPlayerId || g.black?.playerId === myPlayerId)))}
        showRound={arena}
      />
    </div>
  );
}

function PlayersTab({ t }: { t: TournamentDetailDto }) {
  const players = usePlayers(t.id);
  if (!players.data) return <Skeleton className="h-48" />;
  const entered = players.data.players.filter((p) => p.status === "APPROVED" || p.status === "WITHDRAWN" || p.status === "DISQUALIFIED");
  if (entered.length === 0) return <p className="text-sm text-app-muted">Nobody has entered yet.</p>;
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {entered
        .slice()
        .sort((a, b) => (a.seedNumber ?? 999) - (b.seedNumber ?? 999) || (b.seedRating ?? 0) - (a.seedRating ?? 0))
        .map((p) => (
          <li className="flex min-w-0 items-center gap-3 rounded-control border border-app-border bg-app-surface p-2" key={p.id}>
            <Avatar imageUrl={p.user.avatarUrl} name={p.user.name} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-app-text">{p.user.name}</p>
              <p className="text-xs text-app-muted">
                {p.seedRating ?? "Unrated"}
                {p.ageGroup ? ` · ${p.ageGroup}` : ""}
                {p.status !== "APPROVED" ? ` · ${playerStatusLabel(p.status)}` : ""}
              </p>
            </div>
          </li>
        ))}
    </ul>
  );
}

function CommentaryTab({ t, realtime }: { t: TournamentDetailDto; realtime: boolean }) {
  const feed = useCommentary(t.id, realtime);
  if (!feed.data) return <Skeleton className="h-48" />;
  const items = feed.data.pages.flatMap((p) => p.items);
  const pinned = feed.data.pages[0]?.pinned ?? [];
  return <CommentaryFeed footer={<InfiniteScrollTrigger query={feed} />} items={items} pinned={pinned} />;
}

function OverviewTab({ t }: { t: TournamentDetailDto }) {
  const timeZone = useUserTimeZone();
  const e = t.eligibility;
  const rules: string[] = [];
  if (e.minRating !== undefined || e.maxRating !== undefined) rules.push(`Rating ${e.minRating ?? 0}–${e.maxRating ?? "any"}`);
  if (e.maxAgeUnder) rules.push(`Under ${e.maxAgeUnder}`);
  if (e.minAge) rules.push(`Age ${e.minAge}+`);
  if (e.allowUnrated === false) rules.push("Rated players only");
  if (e.experienceLevels?.length) rules.push(e.experienceLevels.map((l) => l.charAt(0) + l.slice(1).toLowerCase()).join(", "));
  if (e.batchIds?.length) rules.push("Selected batches only");
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="flex min-w-0 flex-col gap-4">
        {t.description ? (
          <div className="whitespace-pre-wrap break-words text-sm text-app-text">
            <LinkedText text={t.description} />
          </div>
        ) : (
          <p className="text-sm text-app-muted">No description.</p>
        )}
        {t.rulesText ? (
          <div>
            <h3 className="mb-1 text-sm font-semibold text-app-text">Rules</h3>
            <div className="whitespace-pre-wrap break-words text-sm text-app-text">
              <LinkedText text={t.rulesText} />
            </div>
          </div>
        ) : null}
        {t.prizesText ? (
          <div>
            <h3 className="mb-1 flex items-center gap-1 text-sm font-semibold text-app-text">
              <Trophy aria-hidden className="size-4 text-accent-ink" />
              Prizes
            </h3>
            <div className="whitespace-pre-wrap break-words text-sm text-app-text">
              <LinkedText text={t.prizesText} />
            </div>
          </div>
        ) : null}
      </div>
      <dl className="grid h-fit gap-3 rounded-control border border-app-border bg-app-soft p-4 text-sm">
        <div>
          <dt className="text-app-muted">Starts</dt>
          <dd className="font-medium text-app-text">{formatDateTime(t.startsAt, timeZone)}</dd>
        </div>
        <div>
          <dt className="text-app-muted">Registration</dt>
          <dd className="font-medium text-app-text">
            {t.registrationClosesAt ? `Closes ${formatDateTime(t.registrationClosesAt, timeZone)}` : "Closes at the start"}
            {t.registrationRequiresApproval ? " · approval needed" : ""}
          </dd>
        </div>
        <div>
          <dt className="text-app-muted">Players</dt>
          <dd className="font-medium text-app-text">
            {t.playerCount}
            {t.maxPlayers ? ` of ${t.maxPlayers}` : ""} (minimum {t.minPlayers})
          </dd>
        </div>
        <div>
          <dt className="text-app-muted">Who can enter</dt>
          <dd className="font-medium text-app-text">{rules.length ? rules.join(" · ") : "Everyone in the academy"}</dd>
        </div>
        <div>
          <dt className="text-app-muted">Visibility</dt>
          <dd className="font-medium text-app-text">{TOURNAMENT_VISIBILITY_LABELS[t.visibility]}</dd>
        </div>
        {t.format === "SWISS" || t.format === "ROUND_ROBIN" ? (
          <div>
            <dt className="text-app-muted">Rounds start</dt>
            <dd className="font-medium text-app-text">
              {t.roundStartMode === "AUTO" ? `${t.roundBreakSec} seconds after the round before` : TOURNAMENT_ROUND_START_MODE_LABELS[t.roundStartMode]}
            </dd>
            {t.roundStartMode === "SCHEDULED" ? (
              <dd className="mt-1 flex flex-col gap-0.5 text-app-text">
                {t.roundSchedule.map((entry) => (
                  <span key={entry.round}>
                    Round {entry.round}: {formatDateTime(entry.startsAt, timeZone)}
                  </span>
                ))}
              </dd>
            ) : null}
          </div>
        ) : null}
        {t.spectatorDelaySec > 0 ? (
          <div>
            <dt className="text-app-muted">Spectator delay</dt>
            <dd className="font-medium text-app-text">{t.spectatorDelaySec} seconds</dd>
          </div>
        ) : null}
        {t.hosts.length ? (
          <div>
            <dt className="text-app-muted">Hosts</dt>
            <dd className="mt-1 flex flex-col gap-1">
              {t.hosts.map((h) => (
                <span className="flex items-center gap-2" key={h.id}>
                  <Avatar imageUrl={h.avatarUrl} name={h.name} size="xs" />
                  <span className="truncate font-medium text-app-text">{h.name}</span>
                  <span className="text-xs text-app-muted">{TOURNAMENT_HOST_ROLE_LABELS[h.role]}</span>
                </span>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

export function TournamentPageClient({ tournamentId }: { tournamentId: string }) {
  const query = useTournament(tournamentId);
  const t = query.data?.tournament;
  const started = t ? ["LIVE", "PAUSED", "COMPLETED"].includes(t.status) : false;
  // Joined before the start too, so the page turns live the moment the first round is paired.
  const { connected } = useTournamentRealtime(tournamentId, { enabled: started || t?.status === "PUBLISHED" });
  const live = useTournamentLive(tournamentId, { enabled: !!t && (t.status === "LIVE" || t.status === "PAUSED"), realtime: connected });
  const qc = useQueryClient();
  const [tab, setTab] = useState<string | null>(null);
  const timeZone = useUserTimeZone();
  // Paired: straight to the board.
  useAutoOpenGame(tournamentId, live.data?.me?.status === "APPROVED" ? live.data.me.currentGameId : null);

  // A new version (round, result) refreshes the detail too.
  const liveVersion = live.data?.version;
  const seenVersion = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (liveVersion === undefined) return;
    if (seenVersion.current !== undefined && seenVersion.current !== liveVersion) {
      void qc.invalidateQueries({ queryKey: ["tournaments", "detail", tournamentId] });
      void qc.invalidateQueries({ queryKey: ["tournaments", "rounds", tournamentId] });
      void qc.invalidateQueries({ queryKey: ["tournaments", "bracket", tournamentId] });
    }
    seenVersion.current = liveVersion;
  }, [liveVersion, qc, tournamentId]);

  if (query.isError) return <Alert title="This tournament isn't available" variant="error">It may be private, or it no longer exists.</Alert>;
  if (!t) return <Skeleton className="h-96 w-full" />;

  const myPlayerId = live.data?.me?.playerId;
  const activeTab = tab ?? (started ? "standings" : "overview");
  return (
    <div className="flex flex-col gap-5">
      {t.bannerUrl ? (
        <div className="h-32 overflow-hidden rounded-panel border border-app-border sm:h-44">
          {/* eslint-disable-next-line @next/next/no-img-element -- uploaded banner on the CDN */}
          <img alt="" className="size-full object-cover" src={t.bannerUrl} />
        </div>
      ) : null}
      <PageHeader
        breadcrumbs={[{ href: "/tournaments", label: "Tournaments" }, { label: t.name }]}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{formatLine(t)}</span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays aria-hidden className="size-3.5" />
              {formatDateTime(t.startsAt, timeZone)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users aria-hidden className="size-3.5" />
              {t.playerCount} players
            </span>
          </span>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {t.name}
            <PhaseBadge phase={t.phase} />
          </span>
        }
      />
      {t.status === "CANCELLED" ? <Alert title="Cancelled" variant="warning">{t.cancelReason ?? "This tournament was cancelled."}</Alert> : null}
      {t.status === "COMPLETED" && !t.resultsPublishedAt && t.viewer.canManage ? (
        <Alert variant="info">Results are final but not yet published. Publish them from Manage to notify players.</Alert>
      ) : null}
      <EntryActions t={t} />
      {t.status === "PUBLISHED" ? <StartPanel t={t} /> : null}
      {live.data && (t.status === "LIVE" || t.status === "PAUSED") ? <LivePanel live={live.data} t={t} /> : null}
      {t.status === "COMPLETED" ? <Podium tournamentId={t.id} /> : null}
      <Tabs onValueChange={setTab} value={activeTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {started ? <TabsTrigger value="standings">Standings</TabsTrigger> : null}
          {started ? <TabsTrigger value="rounds">{t.format === "KNOCKOUT" ? "Bracket" : t.format === "ARENA" ? "Games" : "Rounds"}</TabsTrigger> : null}
          <TabsTrigger value="players">Players</TabsTrigger>
          {t.status !== "DRAFT" ? <TabsTrigger value="commentary">Commentary</TabsTrigger> : null}
        </TabsList>
        <TabsContent className="pt-4" value="overview">
          <OverviewTab t={t} />
        </TabsContent>
        {started ? (
          <TabsContent className="pt-4" value="standings">
            <StandingsTab myPlayerId={myPlayerId} realtime={connected} t={t} />
          </TabsContent>
        ) : null}
        {started ? (
          <TabsContent className="pt-4" value="rounds">
            <RoundsTab myPlayerId={myPlayerId} t={t} />
          </TabsContent>
        ) : null}
        <TabsContent className="pt-4" value="players">
          <PlayersTab t={t} />
        </TabsContent>
        {t.status !== "DRAFT" ? (
          <TabsContent className="pt-4" value="commentary">
            <CommentaryTab realtime={connected} t={t} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

function Podium({ tournamentId }: { tournamentId: string }) {
  const standings = useStandings(tournamentId, {}, { realtime: true });
  const top = standings.data?.standings.filter((s) => s.rank !== null).slice(0, 3) ?? [];
  if (top.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {top.map((s, i) => (
        <div className="flex min-w-0 items-center gap-3 rounded-panel border border-app-border bg-app-surface p-4 shadow-card" key={s.playerId}>
          <span className={i === 0 ? "flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink" : "flex size-10 shrink-0 items-center justify-center rounded-full bg-app-soft text-app-muted"}>
            <Trophy aria-hidden className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-app-muted">{["Champion", "Second", "Third"][i]}</p>
            <p className="truncate font-semibold text-app-text">{s.player.name}</p>
            <p className="text-xs text-app-muted">{points(s.points, standings.data!.pointsUnit)} points</p>
          </div>
        </div>
      ))}
    </div>
  );
}

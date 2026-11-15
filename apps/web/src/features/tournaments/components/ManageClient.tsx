"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Award,
  Ban,
  Check,
  Download,
  FastForward,
  Flag,
  Gavel,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  UserMinus,
  X
} from "lucide-react";
import {
  TOURNAMENT_CERTIFICATE_KINDS,
  TOURNAMENT_CERTIFICATE_KIND_LABELS,
  TOURNAMENT_HOST_ROLES,
  TOURNAMENT_HOST_ROLE_LABELS,
  type TournamentCertificateKind,
  type TournamentDetailDto,
  type TournamentGameResult,
  type TournamentHostRole,
  type TournamentLiveDto,
  type TournamentPlayerDto
} from "@nexa-chess/types";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { DateStringPicker } from "@/components/ui/DatePicker";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { SectionCard } from "@/components/ui/SectionCard";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { useToast } from "@/providers/ToastProvider";
import * as api from "../api/tournamentsApi";
import {
  useActiveTemplates,
  useAudit,
  useCandidates,
  useCertificateRules,
  useCertificates,
  useGames,
  useHostCandidates,
  useInvalidateTournament,
  usePlayers,
  useTournament,
  useTournamentLive
} from "../hooks/useTournaments";
import { countdown, resultText } from "../lib/format";
import { isoToLocalInput, localInputToIso } from "../validation/tournamentForm";
import { ReasonDialog } from "./ReasonDialog";
import { Pager, PhaseBadge, playerStatusLabel, useNow, useServerOffset } from "./TournamentBits";

function IconAction({ label, onClick, children, tone }: { label: string; onClick: () => void; children: React.ReactNode; tone?: "danger" }) {
  return (
    <SimpleTooltip label={label}>
      <Button aria-label={label} className={tone === "danger" ? "size-8 p-0 text-app-danger-ink" : "size-8 p-0"} onClick={onClick} variant="neutral">
        {children}
      </Button>
    </SimpleTooltip>
  );
}

/** Runs a host action, refreshes the tournament and reports the outcome. */
function useRun(id: string) {
  const invalidate = useInvalidateTournament();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, success?: string): Promise<boolean> => {
    setBusy(true);
    try {
      await fn();
      if (success) toast.success({ title: success });
      await invalidate(id);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

// ── Run ──

/** Between rounds: when the next one starts, and the host's ways to move it. */
function NextRoundControl({ t, live, busy, run }: { t: TournamentDetailDto; live: TournamentLiveDto; busy: boolean; run: ReturnType<typeof useRun>["run"] }) {
  const now = useNow(1000);
  const serverNow = now + useServerOffset(live.serverNow);
  const timeZone = useUserTimeZone();
  const [custom, setCustom] = useState("");
  const next = live.currentRound + 1;
  const set = (iso: string, done: string) => run(() => api.setNextRoundAt(t.id, iso), done);
  const customIso = localInputToIso(custom);
  return (
    <div className="flex flex-col gap-3 rounded-control border border-app-border bg-app-soft p-3">
      <p className="text-sm font-medium text-app-text">
        {live.nextRoundAt
          ? `Round ${next} starts ${formatDateTime(live.nextRoundAt, timeZone)} (in ${countdown(Date.parse(live.nextRoundAt), serverNow)}).`
          : `Round ${next} waits for you: start it now, or set a time.`}
        {t.status === "PAUSED" ? " The tournament is paused, so it won't start until you resume." : ""}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        {[1, 5, 15].map((minutes) => (
          <Button
            disabled={busy}
            key={minutes}
            onClick={() => void set(new Date(serverNow + minutes * 60_000).toISOString(), `Round ${next} starts in ${minutes} min`)}
            size="sm"
            variant="outline"
          >
            In {minutes} min
          </Button>
        ))}
        <div className="w-full sm:w-64">
          <FormField id="next-round-at" label="Or at">
            <DateStringPicker id="next-round-at" onChange={setCustom} value={custom || isoToLocalInput(live.nextRoundAt)} withTime />
          </FormField>
        </div>
        <Button disabled={busy || !customIso} onClick={() => customIso && void set(customIso, `Round ${next} rescheduled`).then((ok) => ok && setCustom(""))} size="sm">
          Set time
        </Button>
      </div>
    </div>
  );
}

function RunPanel({ t }: { t: TournamentDetailDto }) {
  const router = useRouter();
  const { busy, run } = useRun(t.id);
  const live = useTournamentLive(t.id, { enabled: t.status === "LIVE" || t.status === "PAUSED", realtime: false });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "start" | "finish" | "delete">(null);
  const roundBased = t.format === "SWISS" || t.format === "ROUND_ROBIN";
  const roundDone = live.data ? live.data.ongoingGames.length === 0 : false;
  const moreRounds = live.data ? live.data.totalRounds === null || live.data.currentRound < live.data.totalRounds : false;

  return (
    <div className="flex flex-col gap-4">
      <SectionCard description="Every action here is recorded in the audit log." title="Tournament controls">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <PhaseBadge phase={t.phase} />
            {live.data ? (
              <span className="text-sm text-app-muted">
                {live.data.totalRounds ? `Round ${live.data.currentRound} of ${live.data.totalRounds} · ` : ""}
                {live.data.ongoingGames.length} {live.data.ongoingGames.length === 1 ? "game" : "games"} in progress
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {t.status === "PUBLISHED" ? (
              <Button disabled={busy} onClick={() => setConfirm("start")}>
                <Play className="size-4" />
                Start now
              </Button>
            ) : null}
            {t.status === "LIVE" ? (
              <Button disabled={busy} onClick={() => void run(() => api.pauseTournament(t.id), "Tournament paused")} variant="outline">
                <Pause className="size-4" />
                Pause
              </Button>
            ) : null}
            {t.status === "PAUSED" ? (
              <Button disabled={busy} onClick={() => void run(() => api.resumeTournament(t.id), "Tournament resumed")}>
                <Play className="size-4" />
                Resume
              </Button>
            ) : null}
            {(t.status === "LIVE" || t.status === "PAUSED") && roundBased && moreRounds ? (
              <SimpleTooltip label={roundDone ? "Pair the next round now (skips the break)" : "Waiting for this round's games to finish"}>
                <span>
                  <Button disabled={busy || !roundDone} onClick={() => void run(() => api.startNextRound(t.id), "Next round paired")} variant="outline">
                    <FastForward className="size-4" />
                    Next round now
                  </Button>
                </span>
              </SimpleTooltip>
            ) : null}
            {t.status === "LIVE" || t.status === "PAUSED" ? (
              <Button disabled={busy} onClick={() => setConfirm("finish")} variant="outline">
                <Flag className="size-4" />
                Finish
              </Button>
            ) : null}
            {t.status === "COMPLETED" && !t.resultsPublishedAt ? (
              <Button disabled={busy} onClick={() => void run(() => api.publishResults(t.id), "Results published")}>
                <Send className="size-4" />
                Publish results
              </Button>
            ) : null}
            {t.status === "LIVE" || t.status === "PAUSED" || t.status === "COMPLETED" ? (
              <Button disabled={busy} onClick={() => void run(() => api.recomputeStandings(t.id), "Standings recomputed")} variant="ghost">
                <RefreshCw className="size-4" />
                Recompute standings
              </Button>
            ) : null}
            {t.status !== "COMPLETED" && t.status !== "CANCELLED" ? (
              <Button disabled={busy} onClick={() => setCancelOpen(true)} variant="danger-soft">
                <Ban className="size-4" />
                Cancel tournament
              </Button>
            ) : null}
            {t.status === "DRAFT" || t.status === "CANCELLED" ? (
              <Button disabled={busy} onClick={() => setConfirm("delete")} variant="danger-soft">
                <Trash2 className="size-4" />
                Delete
              </Button>
            ) : null}
          </div>
          {live.data && roundBased && (live.data.nextRoundAt || live.data.awaitingHost) ? <NextRoundControl busy={busy} live={live.data} run={run} t={t} /> : null}
          {t.status === "PUBLISHED" ? <p className="text-sm text-app-muted">It also starts on its own at the start time if at least {t.minPlayers} players have entered.</p> : null}
        </div>
      </SectionCard>
      <ReasonDialog
        busy={busy}
        confirmLabel="Cancel tournament"
        description="Players and hosts are told. Games in progress end without a result."
        destructive
        onClose={() => setCancelOpen(false)}
        onConfirm={(reason) => void run(() => api.cancelTournament(t.id, reason), "Tournament cancelled").then((ok) => ok && setCancelOpen(false))}
        open={cancelOpen}
        title="Cancel this tournament?"
      />
      <ConfirmationModal
        confirmLabel={confirm === "start" ? "Start" : confirm === "finish" ? "Finish" : "Delete"}
        isConfirming={busy}
        isOpen={confirm !== null}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm;
          setConfirm(null);
          if (action === "start") void run(() => api.startTournament(t.id), "Tournament started");
          if (action === "finish") void run(() => api.finishTournament(t.id), "Tournament finished");
          if (action === "delete") void run(() => api.deleteTournament(t.id), "Tournament moved to trash").then((ok) => ok && router.push("/tournaments"));
        }}
        title={confirm === "start" ? "Start the tournament now?" : confirm === "finish" ? "Finish the tournament now?" : "Delete this tournament?"}
      >
        {confirm === "start"
          ? "Registration closes and the first round is paired at once."
          : confirm === "finish"
            ? "Games in progress are ended and the standings become final."
            : "It moves to the trash, where an admin can restore it."}
      </ConfirmationModal>
    </div>
  );
}

// ── Players ──

function AddPlayers({ t }: { t: TournamentDetailDto }) {
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 300);
  const candidates = useCandidates(t.id, q, true);
  const [picked, setPicked] = useState<string[]>([]);
  const { busy, run } = useRun(t.id);
  const toast = useToast();
  const add = async (as: "APPROVED" | "INVITED") => {
    let skipped = 0;
    const ok = await run(async () => {
      const result = await api.addPlayers(t.id, { as, userIds: picked });
      skipped = result.skipped.length;
      if (result.skipped.length) toast.warning({ message: result.skipped.map((s) => s.reason).slice(0, 3).join(" "), title: `${result.skipped.length} not added` });
    });
    if (ok) {
      setPicked([]);
      if (!skipped) toast.success({ title: as === "INVITED" ? "Invitations sent" : "Players entered" });
    }
  };
  return (
    <SectionCard description="Students you can reach. Ineligible ones are shown with the reason." title="Add or invite players">
      <div className="flex flex-col gap-3">
        <Input aria-label="Search students" leadingIcon={<Search className="size-4" />} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email" value={search} />
        <ul className="flex max-h-72 flex-col divide-y divide-app-border overflow-y-auto rounded-control border border-app-border">
          {(candidates.data?.candidates ?? []).map((c) => {
            const disabled = !!c.issue || !!c.entered;
            return (
              <li className="flex min-w-0 items-center gap-3 p-2" key={c.id}>
                <Checkbox
                  aria-label={`Select ${c.name}`}
                  checked={picked.includes(c.id)}
                  disabled={disabled}
                  onCheckedChange={(checked) => setPicked((p) => (checked === true ? [...p, c.id] : p.filter((x) => x !== c.id)))}
                />
                <Avatar imageUrl={c.avatarUrl} name={c.name} size="xs" />
                <span className="min-w-0 flex-1 truncate text-sm text-app-text">{c.name}</span>
                <span className="shrink-0 text-xs text-app-muted">{c.rating ?? "Unrated"}</span>
                {c.entered ? <Badge variant="secondary">{playerStatusLabel(c.entered)}</Badge> : c.issue ? <Badge variant="warning">{c.issue}</Badge> : null}
              </li>
            );
          })}
          {candidates.data && candidates.data.candidates.length === 0 ? <li className="p-3 text-sm text-app-muted">No students match.</li> : null}
        </ul>
        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={busy || picked.length === 0} onClick={() => void add("INVITED")} variant="outline">
            Invite {picked.length || ""}
          </Button>
          <Button disabled={busy || picked.length === 0} onClick={() => void add("APPROVED")}>
            <Plus className="size-4" />
            Enter {picked.length || ""}
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

function PlayersPanel({ t }: { t: TournamentDetailDto }) {
  const players = usePlayers(t.id);
  const { busy, run } = useRun(t.id);
  const [removing, setRemoving] = useState<{ player: TournamentPlayerDto; status: "WITHDRAWN" | "DISQUALIFIED" } | null>(null);
  const [rejecting, setRejecting] = useState<TournamentPlayerDto | null>(null);
  const timeZone = useUserTimeZone();
  const beforeStart = t.status === "DRAFT" || t.status === "PUBLISHED";
  const rows = players.data?.players ?? [];
  const pending = rows.filter((p) => p.status === "PENDING").length;

  return (
    <div className="flex flex-col gap-4">
      {beforeStart ? <AddPlayers t={t} /> : null}
      <SectionCard description={pending ? `${pending} waiting for approval.` : undefined} title={`Entries (${rows.filter((p) => p.status === "APPROVED").length} entered)`}>
        {!players.data ? (
          <Skeleton className="h-40" />
        ) : rows.length === 0 ? (
          <EmptyState title="No entries yet" variant="inline" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead className="hidden sm:table-cell">Rating</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Registered</TableHead>
                <TableHead pin="end">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <span className="flex min-w-0 items-center gap-2">
                      <Avatar imageUrl={p.user.avatarUrl} name={p.user.name} size="xs" />
                      <span className="truncate">{p.user.name}</span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden tabular-nums sm:table-cell">{p.seedRating ?? "Unrated"}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "APPROVED" ? "success" : p.status === "PENDING" ? "warning" : p.status === "INVITED" ? "accent" : "secondary"}>{playerStatusLabel(p.status)}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{formatDateTime(p.registeredAt, timeZone)}</TableCell>
                  <TableCell pin="end">
                    <div className="flex justify-end gap-1">
                      {p.status === "PENDING" && beforeStart ? (
                        <>
                          <IconAction label="Approve" onClick={() => void run(() => api.decidePlayer(t.id, p.id, { status: "APPROVED" }), "Entry approved")}>
                            <Check className="size-4" strokeWidth={2.5} />
                          </IconAction>
                          <IconAction label="Reject" onClick={() => setRejecting(p)} tone="danger">
                            <X className="size-4" strokeWidth={2.5} />
                          </IconAction>
                        </>
                      ) : null}
                      {p.status === "APPROVED" ? (
                        <>
                          <IconAction label="Withdraw player" onClick={() => setRemoving({ player: p, status: "WITHDRAWN" })}>
                            <UserMinus className="size-4" strokeWidth={2.5} />
                          </IconAction>
                          <IconAction label="Disqualify" onClick={() => setRemoving({ player: p, status: "DISQUALIFIED" })} tone="danger">
                            <Ban className="size-4" strokeWidth={2.5} />
                          </IconAction>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
      <ReasonDialog
        busy={busy}
        confirmLabel={removing?.status === "DISQUALIFIED" ? "Disqualify" : "Withdraw"}
        description={
          removing?.status === "DISQUALIFIED"
            ? "A game in progress is lost by forfeit. Their results stay in the table, marked disqualified."
            : "A game in progress is lost by forfeit. They are not paired again."
        }
        destructive={removing?.status === "DISQUALIFIED"}
        onClose={() => setRemoving(null)}
        onConfirm={(reason) =>
          removing && void run(() => api.removePlayer(t.id, removing.player.id, { reason, status: removing.status }), "Player removed").then((ok) => ok && setRemoving(null))
        }
        open={!!removing}
        title={`${removing?.status === "DISQUALIFIED" ? "Disqualify" : "Withdraw"} ${removing?.player.user.name ?? ""}?`}
      />
      <ReasonDialog
        busy={busy}
        confirmLabel="Reject"
        destructive
        onClose={() => setRejecting(null)}
        onConfirm={(reason) => rejecting && void run(() => api.decidePlayer(t.id, rejecting.id, { reason, status: "REJECTED" }), "Entry rejected").then((ok) => ok && setRejecting(null))}
        open={!!rejecting}
        optional
        title={`Reject ${rejecting?.user.name ?? ""}'s entry?`}
      />
    </div>
  );
}

// ── Hosts ──

function HostsPanel({ t }: { t: TournamentDetailDto }) {
  const [hosts, setHosts] = useState(t.hosts.map((h) => ({ avatarUrl: h.avatarUrl, id: h.id, name: h.name, role: h.role })));
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 300);
  const candidates = useHostCandidates(t.id, q, t.viewer.canModerate);
  const { busy, run } = useRun(t.id);
  if (!t.viewer.canModerate) return <Alert variant="info">Only the tournament&apos;s host and academy admins can change the hosts.</Alert>;
  const dirty = JSON.stringify(hosts.map((h) => [h.id, h.role])) !== JSON.stringify(t.hosts.map((h) => [h.id, h.role]));
  return (
    <SectionCard description="Hosts run the tournament; co-hosts help; commentators write commentary only." title="Hosts and commentators">
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col divide-y divide-app-border rounded-control border border-app-border">
          {hosts.length === 0 ? <li className="p-3 text-sm text-app-muted">No hosts: academy admins manage it.</li> : null}
          {hosts.map((h) => (
            <li className="flex min-w-0 flex-wrap items-center gap-2 p-2" key={h.id}>
              <Avatar imageUrl={h.avatarUrl} name={h.name} size="xs" />
              <span className="min-w-0 flex-1 truncate text-sm text-app-text">{h.name}</span>
              <Select
                aria-label={`Role of ${h.name}`}
                className="w-40"
                density="compact"
                onChange={(e) => setHosts((list) => list.map((x) => (x.id === h.id ? { ...x, role: e.target.value as TournamentHostRole } : x)))}
                options={TOURNAMENT_HOST_ROLES.map((r) => ({ label: TOURNAMENT_HOST_ROLE_LABELS[r], value: r }))}
                value={h.role}
              />
              <IconAction label={`Remove ${h.name}`} onClick={() => setHosts((list) => list.filter((x) => x.id !== h.id))} tone="danger">
                <X className="size-4" strokeWidth={2.5} />
              </IconAction>
            </li>
          ))}
        </ul>
        <Input aria-label="Search staff" leadingIcon={<Search className="size-4" />} onChange={(e) => setSearch(e.target.value)} placeholder="Add a coach or admin" value={search} />
        {q ? (
          <ul className="flex max-h-56 flex-col divide-y divide-app-border overflow-y-auto rounded-control border border-app-border">
            {(candidates.data?.candidates ?? [])
              .filter((c) => !hosts.some((h) => h.id === c.id))
              .map((c) => (
                <li className="flex min-w-0 items-center gap-2 p-2" key={c.id}>
                  <Avatar imageUrl={c.avatarUrl} name={c.name} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                  <Badge variant="outline">{c.role === "COACH" ? "Coach" : "Admin"}</Badge>
                  <Button
                    onClick={() => {
                      setHosts((list) => [...list, { avatarUrl: c.avatarUrl, id: c.id, name: c.name, role: "CO_HOST" }]);
                      setSearch("");
                    }}
                    size="sm"
                    variant="outline"
                  >
                    Add
                  </Button>
                </li>
              ))}
          </ul>
        ) : null}
        <div className="flex justify-end">
          <Button disabled={!dirty} isLoading={busy} onClick={() => void run(() => api.setHosts(t.id, { hosts: hosts.map((h) => ({ role: h.role, userId: h.id })) }), "Hosts saved")}>
            Save hosts
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

// ── Games ──

const RESULT_OPTIONS: { label: string; value: TournamentGameResult }[] = [
  { label: "White wins (1–0)", value: "WHITE_WON" },
  { label: "Black wins (0–1)", value: "BLACK_WON" },
  { label: "Draw (½–½)", value: "DRAW" },
  { label: "No result (0–0)", value: "NO_RESULT" }
];

function GamesPanel({ t }: { t: TournamentDetailDto }) {
  const [status, setStatus] = useState("ONGOING");
  const [page, setPage] = useState(1);
  const games = useGames(t.id, { page, status: status || undefined }, false);
  const [deciding, setDeciding] = useState<{ id: string; label: string; finished: boolean } | null>(null);
  const [result, setResult] = useState<TournamentGameResult>("DRAW");
  const { busy, run } = useRun(t.id);
  const qc = useQueryClient();

  const decide = async (reason: string) => {
    if (!deciding) return;
    let version: number | undefined;
    if (deciding.finished) {
      const current = await api.getGame(t.id, deciding.id);
      version = current.game.version;
    }
    const ok = await run(() => api.decideGame(t.id, deciding.id, { reason, result, version }), deciding.finished ? "Result corrected" : "Result recorded");
    if (ok) {
      setDeciding(null);
      void qc.invalidateQueries({ queryKey: ["tournaments", "games", t.id] });
    }
  };

  return (
    <SectionCard
      actions={
        <Select
          aria-label="Game status"
          className="w-40"
          density="compact"
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          options={[
            { label: "In progress", value: "ONGOING" },
            { label: "Finished", value: "FINISHED" },
            { label: "All games", value: "" }
          ]}
          value={status}
        />
      }
      description="Adjudicate a game in progress, or correct a finished result. Standings update at once."
      title="Games"
    >
      {!games.data ? (
        <Skeleton className="h-40" />
      ) : games.data.games.length === 0 ? (
        <EmptyState title="No games here" variant="inline" />
      ) : (
        <div className="flex flex-col gap-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Rd/Bd</TableHead>
                <TableHead>Game</TableHead>
                <TableHead className="w-20 text-center">Result</TableHead>
                <TableHead pin="end">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {games.data.games.map((g) => {
                const label = `${g.white.name} – ${g.black?.name ?? "bye"}`;
                return (
                  <TableRow key={g.id}>
                    <TableCell className="tabular-nums text-app-muted">
                      {g.roundNumber}.{g.board}
                    </TableCell>
                    <TableCell>
                      <Link className="hover:underline" href={`/tournaments/${t.id}/games/${g.id}`}>
                        {label}
                      </Link>
                    </TableCell>
                    <TableCell className="text-center font-mono">{g.status === "ONGOING" ? <Badge variant="live">Live</Badge> : resultText(g.result, !g.black)}</TableCell>
                    <TableCell pin="end">
                      {g.black ? (
                        <div className="flex justify-end">
                          <IconAction
                            label={g.status === "ONGOING" ? "Decide result" : "Correct result"}
                            onClick={() => {
                              setResult(g.result ?? "DRAW");
                              setDeciding({ finished: g.status === "FINISHED", id: g.id, label });
                            }}
                          >
                            <Gavel className="size-4" strokeWidth={2.5} />
                          </IconAction>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {"pagination" in games.data && games.data.pagination ? (
            <Pager onPage={setPage} page={games.data.pagination.page} total={games.data.pagination.total} totalPages={games.data.pagination.totalPages} />
          ) : null}
        </div>
      )}
      <ReasonDialog
        busy={busy}
        confirmLabel={deciding?.finished ? "Correct result" : "Record result"}
        description={deciding?.label}
        onClose={() => setDeciding(null)}
        onConfirm={(reason) => void decide(reason)}
        open={!!deciding}
        title={deciding?.finished ? "Correct the result" : "Decide the game"}
      >
        <FormField id="decision-result" label="Result">
          <Select id="decision-result" onChange={(e) => setResult(e.target.value as TournamentGameResult)} options={RESULT_OPTIONS} value={result} />
        </FormField>
      </ReasonDialog>
    </SectionCard>
  );
}

// ── Certificates ──

type RuleDraft = { kind: TournamentCertificateKind; templateId: string; topN: string; minGames: string };

function CertificatesPanel({ t }: { t: TournamentDetailDto }) {
  const rules = useCertificateRules(t.id);
  const templates = useActiveTemplates();
  const certificates = useCertificates(t.id);
  const { busy, run } = useRun(t.id);
  const qc = useQueryClient();
  const [draft, setDraft] = useState<RuleDraft[] | null>(null);
  const [revoking, setRevoking] = useState<{ id: string; name: string } | null>(null);
  const timeZone = useUserTimeZone();
  const current: RuleDraft[] =
    draft ??
    (rules.data?.rules ?? []).map((r) => ({ kind: r.kind, minGames: r.minGames ? String(r.minGames) : "", templateId: r.templateId, topN: r.topN ? String(r.topN) : "" }));
  const templateOptions = (templates.data?.templates ?? []).map((tpl) => ({ label: tpl.name, value: tpl.id }));
  const update = (i: number, patch: Partial<RuleDraft>) => setDraft(current.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["tournaments", "certificate-rules", t.id] });
    void qc.invalidateQueries({ queryKey: ["tournaments", "certificates", t.id] });
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionCard description="Who gets a certificate when results are published. Templates are set up by academy admins." title="Certificate rules">
        <div className="flex flex-col gap-3">
          {templateOptions.length === 0 ? <Alert variant="info">No certificate templates yet. An academy admin creates them under Admin → Tournaments.</Alert> : null}
          {current.map((rule, i) => (
            <div className="grid gap-2 rounded-control border border-app-border p-3 sm:grid-cols-[2fr_2fr_1fr_1fr_auto] sm:items-end" key={i}>
              <FormField id={`rule-kind-${i}`} label="Who">
                <Select
                  id={`rule-kind-${i}`}
                  onChange={(e) => update(i, { kind: e.target.value as TournamentCertificateKind })}
                  options={TOURNAMENT_CERTIFICATE_KINDS.map((k) => ({ label: TOURNAMENT_CERTIFICATE_KIND_LABELS[k], value: k }))}
                  value={rule.kind}
                />
              </FormField>
              <FormField id={`rule-template-${i}`} label="Template">
                <Select id={`rule-template-${i}`} onChange={(e) => update(i, { templateId: e.target.value })} options={templateOptions} placeholder="Choose" value={rule.templateId} />
              </FormField>
              <FormField id={`rule-top-${i}`} label="Places">
                <Input disabled={rule.kind === "PARTICIPATION"} id={`rule-top-${i}`} inputMode="numeric" onChange={(e) => update(i, { topN: e.target.value })} value={rule.topN} />
              </FormField>
              <FormField id={`rule-min-${i}`} label="Min games">
                <Input id={`rule-min-${i}`} inputMode="numeric" onChange={(e) => update(i, { minGames: e.target.value })} value={rule.minGames} />
              </FormField>
              <IconAction label="Remove rule" onClick={() => setDraft(current.filter((_, j) => j !== i))} tone="danger">
                <Trash2 className="size-4" strokeWidth={2.5} />
              </IconAction>
            </div>
          ))}
          <div className="flex flex-wrap justify-between gap-2">
            <Button
              disabled={templateOptions.length === 0 || current.length >= 10}
              onClick={() => setDraft([...current, { kind: "PLACEMENT", minGames: "", templateId: templateOptions[0]?.value ?? "", topN: "3" }])}
              variant="outline"
            >
              <Plus className="size-4" />
              Add rule
            </Button>
            <Button
              disabled={draft === null}
              isLoading={busy}
              onClick={() =>
                void run(
                  () =>
                    api.setCertificateRules(t.id, {
                      rules: current.map((r) => ({
                        kind: r.kind,
                        minGames: r.minGames ? Number(r.minGames) : null,
                        templateId: r.templateId,
                        topN: r.kind === "PARTICIPATION" ? null : Number(r.topN) || null
                      }))
                    }),
                  "Certificate rules saved"
                ).then((ok) => {
                  if (ok) {
                    setDraft(null);
                    refresh();
                  }
                })
              }
            >
              Save rules
            </Button>
          </div>
        </div>
      </SectionCard>
      <SectionCard
        actions={
          t.status === "COMPLETED" ? (
            <Button disabled={busy} onClick={() => void run(() => api.issueCertificates(t.id), "Certificates issued").then(refresh)} size="sm">
              <Award className="size-4" />
              Issue now
            </Button>
          ) : null
        }
        description={t.status === "COMPLETED" ? "Issuing again only adds missing certificates." : "Issued when results are published."}
        title="Issued certificates"
      >
        {!certificates.data ? (
          <Skeleton className="h-24" />
        ) : certificates.data.certificates.length === 0 ? (
          <EmptyState title="None issued yet" variant="inline" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead>Award</TableHead>
                <TableHead className="hidden md:table-cell">Serial</TableHead>
                <TableHead className="hidden md:table-cell">Issued</TableHead>
                <TableHead pin="end">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {certificates.data.certificates.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="truncate">{c.user.name}</TableCell>
                  <TableCell>
                    {c.placement}
                    {c.revokedAt ? (
                      <Badge className="ml-2" variant="destructive">
                        Revoked
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs md:table-cell">{c.serialNumber}</TableCell>
                  <TableCell className="hidden md:table-cell">{formatDateTime(c.issuedAt, timeZone)}</TableCell>
                  <TableCell pin="end">
                    <div className="flex justify-end gap-1">
                      <SimpleTooltip label="Download PDF">
                        <Button asChild className="size-8 p-0" variant="neutral">
                          <a aria-label="Download PDF" href={api.certificatePdfUrl(c.id)} rel="noreferrer" target="_blank">
                            <Download className="size-4" strokeWidth={2.5} />
                          </a>
                        </Button>
                      </SimpleTooltip>
                      {!c.revokedAt ? (
                        <IconAction label="Revoke" onClick={() => setRevoking({ id: c.id, name: c.user.name })} tone="danger">
                          <Ban className="size-4" strokeWidth={2.5} />
                        </IconAction>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
      <ReasonDialog
        busy={busy}
        confirmLabel="Revoke"
        description="Its verification link will show it as revoked."
        destructive
        onClose={() => setRevoking(null)}
        onConfirm={(reason) =>
          revoking &&
          void run(() => api.revokeCertificate(t.id, revoking.id, reason), "Certificate revoked").then((ok) => {
            if (ok) {
              setRevoking(null);
              refresh();
            }
          })
        }
        open={!!revoking}
        title={`Revoke ${revoking?.name ?? ""}'s certificate?`}
      />
    </div>
  );
}

// ── Audit ──

function AuditPanel({ t }: { t: TournamentDetailDto }) {
  const [page, setPage] = useState(1);
  const audit = useAudit(t.id, page);
  const timeZone = useUserTimeZone();
  if (!audit.data) return <Skeleton className="h-48" />;
  return (
    <SectionCard description="Every host and admin decision, newest first." title="Audit log">
      {audit.data.entries.length === 0 ? (
        <EmptyState title="Nothing recorded yet" variant="inline" />
      ) : (
        <div className="flex flex-col gap-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="hidden sm:table-cell">By</TableHead>
                <TableHead className="hidden md:table-cell">Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit.data.entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap">{formatDateTime(e.createdAt, timeZone)}</TableCell>
                  <TableCell>{e.action.charAt(0) + e.action.slice(1).toLowerCase().replaceAll("_", " ")}</TableCell>
                  <TableCell className="hidden sm:table-cell">{e.actor?.name ?? "System"}</TableCell>
                  <TableCell className="hidden max-w-xs truncate md:table-cell">{e.reason ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pager onPage={setPage} page={audit.data.pagination.page} total={audit.data.pagination.total} totalPages={audit.data.pagination.totalPages} />
        </div>
      )}
    </SectionCard>
  );
}

export function ManageClient({ tournamentId }: { tournamentId: string }) {
  const query = useTournament(tournamentId);
  const [tab, setTab] = useState("run");
  if (query.isError) return <Alert variant="error">This tournament isn&apos;t available.</Alert>;
  if (!query.data) return <Skeleton className="h-96 w-full" />;
  const t = query.data.tournament;
  if (!t.viewer.canManage) return <Alert variant="error">Only the tournament&apos;s hosts and academy admins can manage it.</Alert>;
  return (
    <div className="flex flex-col gap-5">
      <Tabs onValueChange={setTab} value={tab}>
        <PageHeader
          breadcrumbs={[{ href: "/tournaments", label: "Tournaments" }, { href: `/tournaments/${t.id}`, label: t.name }, { label: "Manage" }]}
          tabs={
            <TabsList>
              <TabsTrigger value="run">Run</TabsTrigger>
              <TabsTrigger value="players">Players</TabsTrigger>
              <TabsTrigger value="hosts">Hosts</TabsTrigger>
              {t.status !== "DRAFT" && t.status !== "PUBLISHED" ? <TabsTrigger value="games">Games</TabsTrigger> : null}
              <TabsTrigger value="certificates">Certificates</TabsTrigger>
              <TabsTrigger value="audit">Audit log</TabsTrigger>
            </TabsList>
          }
          title={`Manage ${t.name}`}
        />
        <TabsContent className="pt-4" value="run">
          <RunPanel t={t} />
        </TabsContent>
        <TabsContent className="pt-4" value="players">
          <PlayersPanel t={t} />
        </TabsContent>
        <TabsContent className="pt-4" value="hosts">
          <HostsPanel key={t.version} t={t} />
        </TabsContent>
        <TabsContent className="pt-4" value="games">
          <GamesPanel t={t} />
        </TabsContent>
        <TabsContent className="pt-4" value="certificates">
          <CertificatesPanel t={t} />
        </TabsContent>
        <TabsContent className="pt-4" value="audit">
          <AuditPanel t={t} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

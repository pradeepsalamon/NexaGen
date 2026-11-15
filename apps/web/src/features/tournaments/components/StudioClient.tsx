"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Radio, Send, Star } from "lucide-react";
import {
  TOURNAMENT_COMMENTARY_MAX,
  TOURNAMENT_COMMENTARY_TYPES,
  TOURNAMENT_COMMENTARY_TYPE_LABELS,
  type TournamentCommentaryType,
  type TournamentHighlight
} from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormField } from "@/components/ui/FormField";
import { InfiniteScrollTrigger } from "@/components/ui/InfiniteScrollTrigger";
import { SectionCard } from "@/components/ui/SectionCard";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/providers/ToastProvider";
import { queryKeys } from "@/lib/queryKeys";
import { hideCommentary, pinCommentary, postCommentary, setFeatured } from "../api/tournamentsApi";
import { useCommentary, useGame, useTournament, useTournamentLive } from "../hooks/useTournaments";
import { useTournamentRealtime } from "../hooks/useTournamentRealtime";
import { newClientId } from "../lib/format";
import { CommentaryFeed, type FeedItem } from "./CommentaryFeed";
import { GameBoardPanel } from "./GameBoardPanel";
import { ReasonDialog } from "./ReasonDialog";

type Tone = TournamentHighlight["squares"][number]["tone"];
const TONE: Record<string, Tone> = { blue: "primary", green: "success", red: "danger", yellow: "accent" };

/** The commentator's drawn circles and arrows → a stored highlight. */
function toHighlight(shapes: { orig: string; dest?: string; brush: string }[]): TournamentHighlight | null {
  if (shapes.length === 0) return null;
  return {
    arrows: shapes.filter((s) => s.dest && s.dest !== s.orig).slice(0, 12).map((s) => ({ from: s.orig, to: s.dest!, tone: TONE[s.brush] ?? "primary" })),
    squares: shapes.filter((s) => !s.dest || s.dest === s.orig).slice(0, 24).map((s) => ({ square: s.orig, tone: TONE[s.brush] ?? "primary" }))
  };
}

/** Hosts' and commentators' desk: pick the featured game, write commentary, highlight positions, moderate. */
export function StudioClient({ tournamentId }: { tournamentId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const tournament = useTournament(tournamentId);
  const { connected } = useTournamentRealtime(tournamentId);
  const live = useTournamentLive(tournamentId, { realtime: connected });
  const feed = useCommentary(tournamentId, connected);
  const featured = feed.data?.pages[0]?.featured ?? { gameId: null, playerId: null };
  const ongoing = live.data?.ongoingGames ?? [];
  const [gameId, setGameId] = useState<string>("");
  const selected = gameId || featured.gameId || ongoing[0]?.id || "";
  const game = useGame(tournamentId, selected, { live: true, realtime: connected });

  const [type, setType] = useState<TournamentCommentaryType>("GENERAL");
  const [body, setBody] = useState("");
  const [attach, setAttach] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [shapes, setShapes] = useState<{ orig: string; dest?: string; brush: string }[]>([]);
  const [view, setView] = useState<{ ply: number; fen: string }>({ fen: "", ply: 0 });
  const [sending, setSending] = useState(false);
  const [clientId, setClientId] = useState(newClientId);
  const [hiding, setHiding] = useState<FeedItem | null>(null);

  useEffect(() => setShapes([]), [selected, view.ply]);
  const gameLinked = type === "GAME" || type === "MOVE" || type === "FEATURED" || attach;
  const items = useMemo(() => feed.data?.pages.flatMap((p) => p.items) ?? [], [feed.data]);

  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.tournaments.commentary(tournamentId) });

  const send = async () => {
    if (!body.trim()) return;
    setSending(true);
    try {
      const withGame = gameLinked && !!selected;
      await postCommentary(tournamentId, {
        body,
        clientId,
        fen: withGame && (type === "MOVE" || attach) ? view.fen : null,
        gameId: withGame ? selected : null,
        highlight: withGame && (type === "MOVE" || attach) ? toHighlight(shapes) : null,
        pinned,
        ply: withGame && (type === "MOVE" || attach) ? view.ply : null,
        type
      });
      setBody("");
      setPinned(false);
      setAttach(false);
      setClientId(newClientId());
      await refresh();
    } catch {
      // apiFetch showed it; the same clientId makes a retry safe.
    } finally {
      setSending(false);
    }
  };

  const feature = async (id: string | null) => {
    try {
      await setFeatured(tournamentId, { gameId: id });
      toast.success({ title: id ? "Featured game set" : "Featured game cleared" });
      await refresh();
    } catch {
      // shown
    }
  };

  if (tournament.isError) return <Alert variant="error">This tournament isn&apos;t available.</Alert>;
  if (!tournament.data) return <Skeleton className="h-96 w-full" />;
  const t = tournament.data.tournament;
  if (!t.viewer.canBroadcast) return <Alert variant="error">Only the tournament&apos;s hosts and commentators can use the studio.</Alert>;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <Link href={`/tournaments/${t.id}/broadcast`}>
              <Radio className="size-4" />
              Viewer&apos;s view
            </Link>
          </Button>
        }
        breadcrumbs={[{ href: "/tournaments", label: "Tournaments" }, { href: `/tournaments/${t.id}`, label: t.name }, { label: "Studio" }]}
        description="Commentary reaches spectators after the tournament's delay; you see it at once."
        title="Broadcast studio"
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <SectionCard
          actions={
            selected ? (
              <Button disabled={featured.gameId === selected} onClick={() => void feature(selected)} size="sm" variant={featured.gameId === selected ? "secondary" : "outline"}>
                <Star className="size-4" />
                {featured.gameId === selected ? "Featured" : "Feature this game"}
              </Button>
            ) : null
          }
          description="Right-click and drag on the board to draw arrows and circles for a position highlight."
          title="Game"
        >
          <div className="flex flex-col gap-3">
            <Select
              aria-label="Game"
              onChange={(e) => setGameId(e.target.value)}
              options={[
                ...(ongoing.length === 0 ? [{ label: "No games in progress", value: "" }] : []),
                ...ongoing.map((g) => ({ label: `Bd ${g.board}: ${g.white.name} – ${g.black?.name ?? "bye"}${g.id === featured.gameId ? " ★" : ""}`, value: g.id }))
              ]}
              value={selected}
            />
            {selected && game.data ? (
              <GameBoardPanel game={game.data.game} onShapesChange={setShapes} onViewPly={(ply, fen) => setView({ fen, ply })} />
            ) : (
              <p className="text-sm text-app-muted">Pick a game in progress to comment on it.</p>
            )}
          </div>
        </SectionCard>
        <div className="flex min-w-0 flex-col gap-5">
          <SectionCard title="Write">
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <FormField id="studio-type" label="Type">
                <Select
                  id="studio-type"
                  onChange={(e) => setType(e.target.value as TournamentCommentaryType)}
                  options={TOURNAMENT_COMMENTARY_TYPES.filter((k) => k !== "PLAYER").map((k) => ({ label: TOURNAMENT_COMMENTARY_TYPE_LABELS[k], value: k }))}
                  value={type}
                />
              </FormField>
              <FormField hint={`${body.length}/${TOURNAMENT_COMMENTARY_MAX}`} id="studio-body" label="Text">
                <Textarea id="studio-body" maxLength={TOURNAMENT_COMMENTARY_MAX} onChange={(e) => setBody(e.target.value)} rows={4} value={body} />
              </FormField>
              {type === "MOVE" ? (
                <p className="text-xs text-app-muted">About move {view.ply} of the selected game{shapes.length ? `, with ${shapes.length} highlight${shapes.length === 1 ? "" : "s"}` : ""}. Step through the moves to pick another.</p>
              ) : type === "GENERAL" || type === "ROUND" || type === "ANNOUNCEMENT" || type === "EMERGENCY" ? (
                <Checkbox checked={attach} disabled={!selected} label="Attach the board position (and drawn highlights)" onCheckedChange={(c) => setAttach(c === true)} />
              ) : null}
              <Checkbox checked={pinned} label="Pin to the top" onCheckedChange={(c) => setPinned(c === true)} />
              {type === "EMERGENCY" ? <Alert variant="warning">Important notices are shown prominently to everyone watching.</Alert> : null}
              <div className="flex justify-end">
                <Button disabled={!body.trim() || ((type === "GAME" || type === "MOVE" || type === "FEATURED") && !selected)} isLoading={sending} type="submit">
                  <Send className="size-4" />
                  Post
                </Button>
              </div>
            </form>
          </SectionCard>
          <SectionCard title="Feed">
            {feed.data ? (
              <CommentaryFeed
                footer={<InfiniteScrollTrigger query={feed} />}
                items={items}
                onHide={t.viewer.canModerate ? setHiding : undefined}
                onOpenGame={setGameId}
                onPin={(item) => void pinCommentary(tournamentId, item.id, !item.pinned).then(refresh)}
                pinned={feed.data.pages[0]?.pinned ?? []}
              />
            ) : (
              <Skeleton className="h-40" />
            )}
          </SectionCard>
        </div>
      </div>
      <ReasonDialog
        confirmLabel="Hide"
        description="It disappears for everyone; it stays in the audit log."
        destructive
        onClose={() => setHiding(null)}
        onConfirm={(reason) => hiding && void hideCommentary(tournamentId, hiding.id, reason).then(() => {
          setHiding(null);
          void refresh();
        })}
        open={!!hiding}
        title="Hide this commentary?"
      />
    </div>
  );
}

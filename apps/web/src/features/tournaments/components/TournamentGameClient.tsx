"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Flag, Handshake, Hourglass, Zap } from "lucide-react";
import type { TournamentGameActionRequest, TournamentGameDto } from "@nexa-chess/types";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/providers/ToastProvider";
import { ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { sendGameAction, sendMove } from "../api/tournamentsApi";
import { markGameOpened, useAutoOpenGame } from "../hooks/useAutoOpenGame";
import { useGame, useTournament, useTournamentLive } from "../hooks/useTournaments";
import { useTournamentRealtime } from "../hooks/useTournamentRealtime";
import { GameBoardPanel, useLiveClock } from "./GameBoardPanel";
import { countdown, nextRoundLine } from "../lib/format";
import { useNow, useServerOffset } from "./TournamentBits";

function PlayerActions({ game, tournamentId, arena }: { game: TournamentGameDto; tournamentId: string; arena: boolean }) {
  const qc = useQueryClient();
  const [confirmResign, setConfirmResign] = useState(false);
  const [busy, setBusy] = useState(false);
  const me = game.viewerColor!;
  const opponent = me === "white" ? "black" : "white";
  const clocks = useLiveClock(game);

  const act = async (action: TournamentGameActionRequest["action"]) => {
    setBusy(true);
    try {
      const response = await sendGameAction(tournamentId, game.id, { action });
      qc.setQueryData(queryKeys.tournaments.game(tournamentId, game.id), response);
    } catch {
      await qc.invalidateQueries({ queryKey: queryKeys.tournaments.game(tournamentId, game.id) });
    } finally {
      setBusy(false);
      setConfirmResign(false);
    }
  };

  // A flag falls on the server by itself; this asks once as well, so the result never waits for a click.
  const flagged = game.status === "ONGOING" && game.clock.running !== null && clocks[game.clock.running] <= 0;
  const claimedPly = useRef<number | null>(null);
  useEffect(() => {
    if (!flagged || claimedPly.current === game.ply) return;
    claimedPly.current = game.ply;
    const timer = window.setTimeout(() => {
      void sendGameAction(tournamentId, game.id, { action: "CLAIM_TIMEOUT" })
        .then((response) => qc.setQueryData(queryKeys.tournaments.game(tournamentId, game.id), response))
        .catch(() => qc.invalidateQueries({ queryKey: queryKeys.tournaments.game(tournamentId, game.id) }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [flagged, game.id, game.ply, qc, tournamentId]);

  if (game.status === "FINISHED") return null;
  const myMoveMade = me === "white" ? game.ply >= 1 : game.ply >= 2;
  return (
    <div className="flex flex-wrap gap-2">
      {game.drawOfferedBy === opponent ? (
        <>
          <Button disabled={busy} onClick={() => act("ACCEPT_DRAW")} variant="primary">
            <Handshake className="size-4" />
            Accept draw
          </Button>
          <Button disabled={busy} onClick={() => act("DECLINE_DRAW")} variant="outline">
            Decline
          </Button>
        </>
      ) : (
        <Button disabled={busy || game.drawOfferedBy === me || game.ply < 2} onClick={() => act("OFFER_DRAW")} variant="outline">
          <Handshake className="size-4" />
          {game.drawOfferedBy === me ? "Draw offered" : "Offer draw"}
        </Button>
      )}
      {arena && !game.berserk[me] && !myMoveMade ? (
        <Button disabled={busy} onClick={() => act("BERSERK")} variant="secondary">
          <Zap className="size-4" />
          Berserk
        </Button>
      ) : null}
      {game.clock.running === opponent && clocks[opponent] <= 0 ? (
        <Button disabled={busy} onClick={() => act("CLAIM_TIMEOUT")} variant="primary">
          Claim win on time
        </Button>
      ) : null}
      <Button disabled={busy} onClick={() => setConfirmResign(true)} variant="danger-soft">
        <Flag className="size-4" />
        Resign
      </Button>
      <ConfirmationModal
        confirmLabel="Resign"
        icon={Flag}
        isConfirming={busy}
        isOpen={confirmResign}
        onCancel={() => setConfirmResign(false)}
        onConfirm={() => act("RESIGN")}
        title="Resign this game?"
      >
        Your opponent wins the game. This can&apos;t be undone.
      </ConfirmationModal>
    </div>
  );
}

function FirstMoveBanner({ game }: { game: TournamentGameDto }) {
  const now = useNow(500);
  const offset = useServerOffset(game.clock.serverNow);
  if (!game.firstMoveDeadline || game.status !== "ONGOING" || game.ply >= 2) return null;
  const toMove = game.ply === 0 ? "white" : "black";
  const mine = game.viewerColor === toMove;
  return (
    <Alert title={mine ? "Make your first move" : `Waiting for ${toMove}'s first move`} variant={mine ? "warning" : "info"}>
      {countdown(Date.parse(game.firstMoveDeadline), now + offset)} left, or the game is lost by no-show.
    </Alert>
  );
}

/**
 * After a player's game: what comes next (the countdown to the next round, the
 * wait for an arena opponent), and the jump to the next board when it exists.
 */
function NextUp({ tournamentId, gameId, realtime }: { tournamentId: string; gameId: string; realtime: boolean }) {
  const live = useTournamentLive(tournamentId, { realtime });
  const now = useNow(1000);
  const offset = useServerOffset(live.data?.serverNow);
  const me = live.data?.me;
  useAutoOpenGame(tournamentId, me?.status === "APPROVED" ? me.currentGameId : null, gameId);
  if (!live.data || !me) return null;
  const status = live.data.tournament.status;
  if (status === "COMPLETED") {
    return (
      <Alert title="The tournament is over" variant="success">
        <Link className="underline" href={`/tournaments/${tournamentId}`}>
          See the final standings
        </Link>
      </Alert>
    );
  }
  if ((status !== "LIVE" && status !== "PAUSED") || me.status !== "APPROVED") return null;
  const arena = live.data.tournament.format === "ARENA";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-control border border-primary bg-primary-soft p-3">
      <Hourglass aria-hidden className="size-5 shrink-0 text-primary-ink" />
      <span className="min-w-0 text-sm font-medium text-app-text">
        {arena
          ? me.arenaPaused
            ? "You're paused and won't be paired. Rejoin from the tournament page."
            : "Finding your next opponent… your board opens by itself."
          : nextRoundLine(live.data, now + offset)}
      </span>
      <Button asChild className="ml-auto" size="sm" variant="outline">
        <Link href={`/tournaments/${tournamentId}`}>Standings</Link>
      </Button>
    </div>
  );
}

/** One tournament game: the players play here; everyone else spectates (with the tournament's delay). */
export function TournamentGameClient({ tournamentId, gameId }: { tournamentId: string; gameId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const tournament = useTournament(tournamentId);
  const { connected } = useTournamentRealtime(tournamentId);
  const query = useGame(tournamentId, gameId, { live: true, realtime: connected });
  const [resetKey, setResetKey] = useState(0);
  const game = query.data?.game;
  const mine = game ? game.viewerColor !== null : false;
  // The player is at their board: the lobby won't send them here again for this game.
  useEffect(() => {
    if (mine) markGameOpened(gameId);
  }, [gameId, mine]);

  if (query.isError) {
    return <Alert title="This game isn't available" variant="error">It may belong to a tournament you can&apos;t see.</Alert>;
  }
  if (!game) return <Skeleton className="h-[520px] w-full" />;

  const playing = game.viewerColor !== null;
  const myTurn = playing && game.status === "ONGOING" && (game.ply % 2 === 0 ? "white" : "black") === game.viewerColor;

  const onMove = async (move: { uci: string; fen: string; san: string }) => {
    const key = queryKeys.tournaments.game(tournamentId, gameId);
    // Optimistic: show the move at once; the server's answer replaces it.
    qc.setQueryData(key, { game: { ...game, fen: move.fen, moves: [...game.moves, { san: move.san, uci: move.uci }], ply: game.ply + 1 } });
    try {
      const response = await sendMove(tournamentId, gameId, { ply: game.ply, uci: move.uci });
      qc.setQueryData(key, response);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 409)) toast.error({ message: error instanceof Error ? error.message : undefined, title: "Move not played" });
      setResetKey((k) => k + 1);
      await qc.invalidateQueries({ queryKey: key });
    }
  };

  const arena = tournament.data?.tournament.format === "ARENA";
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <Link href={`/tournaments/${tournamentId}`}>
              <ArrowLeft className="size-4" />
              Tournament
            </Link>
          </Button>
        }
        breadcrumbs={[{ href: "/tournaments", label: "Tournaments" }, { href: `/tournaments/${tournamentId}`, label: tournament.data?.tournament.name ?? "Tournament" }, { label: `Board ${game.board}` }]}
        description={playing ? (myTurn ? "Your move." : game.status === "ONGOING" ? "Waiting for your opponent." : undefined) : "You are watching this game."}
        title={`${game.white.name} vs ${game.black?.name ?? "bye"}`}
      />
      <GameBoardPanel
        actions={playing ? <PlayerActions arena={arena} game={game} tournamentId={tournamentId} /> : null}
        banner={playing && game.status === "FINISHED" ? <NextUp gameId={gameId} realtime={connected} tournamentId={tournamentId} /> : <FirstMoveBanner game={game} />}
        game={game}
        interactive={playing}
        onMove={playing ? (m) => void onMove(m) : undefined}
        orientation={game.viewerColor ?? "white"}
        playerColor={game.viewerColor ?? undefined}
        resetKey={resetKey}
      />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Room, RoomEvent } from "livekit-client";
import { TOURNAMENT_REALTIME_TOPICS, type TournamentGameResponse, type TournamentRealtimeMessage } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { getPublicRealtimeToken, getRealtimeToken } from "../api/tournamentsApi";

const TOPICS = new Set<string>(Object.values(TOURNAMENT_REALTIME_TOPICS));
const decoder = new TextDecoder();

/**
 * Joins the tournament's LiveKit room as a hidden, receive-only viewer and turns
 * the server's nudges into refetches (docs/TOURNAMENTS.md §4). Packets with a
 * sender are dropped: only server-injected ones count. REST stays the source
 * of truth — `connected: false` (no LiveKit, or a drop) just means the queries
 * poll faster.
 */
export function useTournamentRealtime(tournamentId: string, options: { publicView?: boolean; enabled?: boolean } = {}) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const enabled = options.enabled ?? true;
  const publicView = options.publicView ?? false;

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
    if (!enabled || !url) return;
    let room: Room | null = null;
    let cancelled = false;
    const timers: number[] = [];
    const K = queryKeys.tournaments;

    const refreshState = () => {
      if (publicView) {
        void qc.invalidateQueries({ queryKey: K.public.live(tournamentId) });
        void qc.invalidateQueries({ queryKey: K.public.standings(tournamentId) });
        return;
      }
      void qc.invalidateQueries({ queryKey: K.live(tournamentId) });
      // The start, a pause, a moved round: the detail carries the status the page is built on.
      void qc.invalidateQueries({ queryKey: K.detail(tournamentId) });
      void qc.invalidateQueries({ queryKey: ["tournaments", "standings", tournamentId] });
      void qc.invalidateQueries({ queryKey: K.rounds(tournamentId) });
      void qc.invalidateQueries({ queryKey: K.myGame(tournamentId) });
    };
    const refreshGame = (gameId: string) =>
      void qc.invalidateQueries({ queryKey: publicView ? K.public.game(tournamentId, gameId) : K.game(tournamentId, gameId) });

    void (async () => {
      const token = await (publicView ? getPublicRealtimeToken(tournamentId) : getRealtimeToken(tournamentId)).catch(() => null);
      if (cancelled || !token?.enabled) return;
      room = new Room({ adaptiveStream: false, dynacast: false });
      room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        if (participant || !topic || !TOPICS.has(topic)) return;
        let message: TournamentRealtimeMessage;
        try {
          message = JSON.parse(decoder.decode(payload)) as TournamentRealtimeMessage;
        } catch {
          return;
        }
        switch (message.type) {
          case "state":
            refreshState();
            break;
          case "commentary":
            void qc.invalidateQueries({ queryKey: publicView ? K.public.commentary(tournamentId) : K.commentary(tournamentId) });
            break;
          case "game": {
            // The opponent's move arrives in the packet: show it now, no round trip.
            const key = K.game(tournamentId, message.gameId);
            const cached = qc.getQueryData<TournamentGameResponse>(key);
            const move = message.move;
            if (!publicView && move && cached?.game.status === "ONGOING" && cached.game.viewerColor && cached.game.ply === message.ply - 1) {
              void qc.cancelQueries({ queryKey: key });
              qc.setQueryData<TournamentGameResponse>(key, {
                game: {
                  ...cached.game,
                  clock: move.clock,
                  drawOfferedBy: null,
                  fen: move.fen,
                  firstMoveDeadline: move.firstMoveDeadline,
                  moves: [...cached.game.moves, { san: move.san, uci: move.uci }],
                  ply: message.ply
                }
              });
            } else if (!(move && cached?.game.ply === message.ply)) {
              // Not the next move (a result, a draw offer, a missed packet): ask the server.
              refreshGame(message.gameId);
            }
            break;
          }
          case "spectate": {
            // The server applies the delay; ask again once the move is visible.
            const wait = Math.max(0, Date.parse(message.visibleAt) - Date.now()) + 250;
            timers.push(window.setTimeout(() => refreshGame(message.gameId), wait));
            break;
          }
        }
      });
      room.on(RoomEvent.Disconnected, () => setConnected(false));
      room.on(RoomEvent.Reconnected, () => {
        setConnected(true);
        refreshState();
      });
      try {
        await room.connect(url, token.token, { autoSubscribe: false });
        if (cancelled) {
          void room.disconnect();
          return;
        }
        setConnected(true);
      } catch {
        setConnected(false);
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
      setConnected(false);
      void room?.disconnect();
    };
  }, [enabled, publicView, qc, tournamentId]);

  return { connected };
}

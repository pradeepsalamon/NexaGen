import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import {
  TOURNAMENT_REALTIME_TOPICS,
  type TournamentRealtimeMessage,
  type TournamentRealtimeTokenResponse
} from "@nexa-chess/types";
import { TournamentGameStatus } from "@prisma/client";
import { LiveKitService } from "../live-class/livekit.service";
import { PrismaService } from "../prisma/prisma.service";
import { requireTenantId } from "../tenancy/tenant-sql";
import { TournamentEventsService, type TournamentEvent } from "./tournament-events.service";
import { movesOf } from "./tournament-game.service";

const encoder = new TextEncoder();

/** The room's name carries the academy (docs/API_DEVELOPMENT_RULES.md §4.8). */
export function tournamentRoomName(tenantId: string, tournamentId: string): string {
  return `tournament-${tenantId}-${tournamentId}`;
}

/** Viewer identities in a tournament room. Anonymous viewers get a random one. */
export const viewerIdentity = (userId: string) => `tu_${userId}`;

/**
 * Real-time nudges over LiveKit (docs/TOURNAMENTS.md §4). One data-only room per
 * tournament; every viewer holds a hidden, receive-only token (no publish, no
 * data grant), so nobody can put a packet on the wire but the server. Packets
 * are nudges: clients refetch over REST, which applies every permission and
 * the spectator delay. Game packets (the move itself) go only to the two
 * players. Without LiveKit the routes report `enabled: false` and the web polls.
 */
@Injectable()
export class TournamentRealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TournamentRealtimeService.name);
  private unsubscribe: (() => void) | null = null;
  private readonly createdRooms = new Set<string>();

  constructor(
    private readonly livekit: LiveKitService,
    private readonly prisma: PrismaService,
    private readonly events: TournamentEventsService
  ) {}

  onModuleInit() {
    this.livekit.onModuleInit();
    this.unsubscribe = this.events.subscribe((event) => void this.publish(event).catch(() => undefined));
  }

  onModuleDestroy() {
    this.unsubscribe?.();
  }

  enabled(): boolean {
    return this.livekit.isConfigured();
  }

  /** A hidden receive-only seat in this tournament's room. */
  async token(tournamentId: string, viewer: { identity: string; name: string }): Promise<TournamentRealtimeTokenResponse> {
    if (!this.enabled()) return { enabled: false };
    const room = tournamentRoomName(requireTenantId("tournamentRoom"), tournamentId);
    await this.ensureRoom(room);
    const token = await this.livekit.generateSpectatorToken({
      participantIdentity: viewer.identity,
      participantName: viewer.name,
      roomName: room
    });
    return { enabled: true, room, token };
  }

  private async ensureRoom(room: string) {
    if (this.createdRooms.has(room)) return;
    try {
      await this.livekit.createRoom(room);
      this.createdRooms.add(room);
    } catch {
      // The server may auto-create rooms on join; a nudge room is never required.
    }
  }

  private async publish(event: TournamentEvent) {
    if (!this.enabled()) return;
    const room = tournamentRoomName(requireTenantId("tournamentRoom"), event.tournamentId);
    const send = (topic: string, message: TournamentRealtimeMessage, to?: string[]) =>
      this.livekit.broadcastData(room, encoder.encode(JSON.stringify(message)), topic, to).catch((error: unknown) => {
        this.logger.debug(`nudge failed (${room}): ${error instanceof Error ? error.message : String(error)}`);
      });
    const version = this.events.version(event.tournamentId);
    switch (event.type) {
      case "state":
        await send(TOURNAMENT_REALTIME_TOPICS.state, { type: "state", version });
        return;
      case "commentary":
        await send(TOURNAMENT_REALTIME_TOPICS.commentary, { id: event.commentaryId, type: "commentary", version });
        return;
      case "game": {
        const game = await this.prisma.tournamentGame.findUnique({
          select: {
            blackPlayer: { select: { userId: true } },
            movesJson: true,
            ply: true,
            status: true,
            tournament: { select: { spectatorDelaySec: true } },
            whitePlayer: { select: { userId: true } }
          },
          where: { id: event.gameId }
        });
        if (!game) return;
        const players = [game.whitePlayer.userId, game.blackPlayer?.userId].filter((u): u is string => !!u).map(viewerIdentity);
        await send(TOURNAMENT_REALTIME_TOPICS.game, { gameId: event.gameId, ply: game.ply, type: "game" }, players);
        const lastAt = movesOf(game.movesJson).at(-1)?.at ?? Date.now();
        const visibleAt = new Date(lastAt + game.tournament.spectatorDelaySec * 1000).toISOString();
        await send(TOURNAMENT_REALTIME_TOPICS.spectate, {
          finished: game.status === TournamentGameStatus.FINISHED,
          gameId: event.gameId,
          type: "spectate",
          visibleAt
        });
        await send(TOURNAMENT_REALTIME_TOPICS.state, { type: "state", version });
        return;
      }
    }
  }
}

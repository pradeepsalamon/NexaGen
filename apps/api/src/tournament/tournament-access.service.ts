import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Tournament, TournamentHost, TournamentPlayer, User } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import {
  canBroadcast,
  canManageTournament,
  canModerateTournament,
  canViewTournament,
  type TournamentAccessFacts,
  type TournamentActor
} from "./tournament-policy";
import { TournamentSettingsService } from "./tournament-settings.service";

export type TournamentViewer = Pick<User, "id" | "role" | "firstName" | "lastName" | "timezone" | "tenantId">;

export type LoadedTournament = {
  tournament: Tournament;
  facts: TournamentAccessFacts;
  hostRow: TournamentHost | null;
  playerRow: TournamentPlayer | null;
};

/**
 * Loads a tournament for a viewer through scoped queries (the tenant-scope and
 * soft-delete extensions apply), with the viewer's own host and player rows,
 * and applies the policy. A tournament the viewer may not see is a 404, never
 * a 403 (docs/API_DEVELOPMENT_RULES.md §7.2).
 */
@Injectable()
export class TournamentAccessService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly settings: TournamentSettingsService
  ) {}

  authenticate(accessToken: string | undefined): Promise<TournamentViewer> {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }

  actor(user: TournamentViewer): TournamentActor {
    return { id: user.id, role: user.role };
  }

  async load(
    user: TournamentViewer | null,
    tournamentId: string,
    client?: PrismaTransactionClient
  ): Promise<LoadedTournament> {
    const db = client ?? this.prisma;
    const tournament = await db.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) throw new NotFoundException("Tournament not found.");
    const [hostRow, playerRow] = user
      ? await Promise.all([
          db.tournamentHost.findUnique({ where: { tournamentId_userId: { tournamentId, userId: user.id } } }),
          db.tournamentPlayer.findUnique({ where: { tournamentId_userId: { tournamentId, userId: user.id } } })
        ])
      : [null, null];
    const facts: TournamentAccessFacts = {
      hostRole: hostRow?.role ?? null,
      playerStatus: playerRow?.status ?? null,
      status: tournament.status,
      visibility: tournament.visibility
    };
    const settings = await this.settings.policySettings();
    if (!canViewTournament(user ? this.actor(user) : null, facts, settings)) {
      throw new NotFoundException("Tournament not found.");
    }
    return { facts, hostRow, playerRow, tournament };
  }

  /** Loads and requires management rights (HOST / CO_HOST / admin). */
  async loadForManager(
    user: TournamentViewer,
    tournamentId: string,
    client?: PrismaTransactionClient
  ): Promise<LoadedTournament> {
    const loaded = await this.load(user, tournamentId, client);
    if (!canManageTournament(this.actor(user), loaded.facts)) {
      throw new ForbiddenException("Only this tournament's hosts and academy admins can do that.");
    }
    return loaded;
  }

  /** Loads and requires moderation rights (HOST / admin). */
  async loadForModerator(user: TournamentViewer, tournamentId: string, client?: PrismaTransactionClient) {
    const loaded = await this.load(user, tournamentId, client);
    if (!canModerateTournament(this.actor(user), loaded.facts)) {
      throw new ForbiddenException("Only the tournament's host and academy admins can do that.");
    }
    return loaded;
  }

  /** Loads and requires broadcast rights (any host role / admin). */
  async loadForBroadcaster(user: TournamentViewer, tournamentId: string, client?: PrismaTransactionClient) {
    const loaded = await this.load(user, tournamentId, client);
    if (!canBroadcast(this.actor(user), loaded.facts)) {
      throw new ForbiddenException("Only the tournament's hosts and commentators can do that.");
    }
    return loaded;
  }
}

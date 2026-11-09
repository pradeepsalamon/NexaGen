import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  TournamentAuditAction,
  TournamentHostRole,
  TournamentStatus,
  TournamentVisibility,
  UserStatus,
  type ApprovalRequest
} from "@prisma/client";
import { z } from "zod";
import type { PrismaTransactionClient } from "../../prisma/prisma.service";
import { canHoldHostRole } from "../../tournament/tournament-policy";
import { publishInTx } from "../../tournament/tournament-publish";
import type { ApprovalActor, ApprovalHandler, PreparedApproval } from "../approval-handler";

const payloadSchema = z.object({ tournamentId: z.string().trim().min(1).max(64) }).strict();
type Payload = z.infer<typeof payloadSchema>;

/**
 * A coach HOST asks to publish a PUBLIC tournament when the academy doesn't let
 * coaches publish public tournaments themselves (docs/TOURNAMENTS.md §3.2).
 * The snapshot is the tournament's `version`: any edit after the request makes
 * the approval refuse, so an admin never publishes something they didn't see.
 */
@Injectable()
export class TournamentPublishHandler implements ApprovalHandler<Payload> {
  readonly actionType = "TOURNAMENT_PUBLISH" as const;
  readonly payloadSchema = payloadSchema;

  async prepare(tx: PrismaTransactionClient, requester: ApprovalActor, payload: Payload): Promise<PreparedApproval> {
    const tournament = await tx.tournament.findUnique({
      select: { id: true, name: true, startsAt: true, status: true, version: true, visibility: true },
      where: { id: payload.tournamentId }
    });
    const host = tournament
      ? await tx.tournamentHost.findUnique({
          where: { tournamentId_userId: { tournamentId: tournament.id, userId: requester.id } }
        })
      : null;
    if (!tournament || !host) throw new NotFoundException("Tournament not found.");
    if (host.role !== TournamentHostRole.HOST) throw new ForbiddenException("Only the tournament's host can ask to publish it.");
    if (tournament.status !== TournamentStatus.DRAFT) throw new ConflictException("This tournament is already published.");
    if (tournament.visibility !== TournamentVisibility.PUBLIC) {
      throw new ConflictException("A private or invitation-only tournament can be published directly.");
    }
    return {
      currentValue: { status: tournament.status, version: tournament.version },
      dedupeKey: `TOURNAMENT_PUBLISH:${tournament.id}`,
      details: { name: tournament.name, startsAt: tournament.startsAt.toISOString() },
      // No point publishing after the start.
      expiresAt: tournament.startsAt,
      requestedValue: { tournamentId: tournament.id }
    };
  }

  async revalidate(tx: PrismaTransactionClient, request: ApprovalRequest): Promise<void> {
    const { tournamentId } = payloadSchema.parse(request.requestedValue);
    const snapshot = z.object({ version: z.number() }).parse(request.currentValue);
    await tx.$queryRaw`SELECT "id" FROM "tournaments" WHERE "id" = ${tournamentId} FOR UPDATE`;
    const tournament = await tx.tournament.findUnique({
      select: { startsAt: true, status: true, version: true },
      where: { id: tournamentId }
    });
    if (!tournament || tournament.status !== TournamentStatus.DRAFT) {
      throw new ConflictException("The tournament is gone or no longer a draft. Reject this request.");
    }
    if (tournament.version !== snapshot.version) {
      throw new ConflictException("The tournament was edited after this request. Reject it; the host can ask again.");
    }
    if (tournament.startsAt.getTime() <= Date.now()) throw new ConflictException("The start time has passed. Reject this request.");
    const host = await tx.tournamentHost.findUnique({
      include: { user: { select: { isDeleted: true, role: true, status: true } } },
      where: { tournamentId_userId: { tournamentId, userId: request.requesterId! } }
    });
    if (
      !host ||
      host.role !== TournamentHostRole.HOST ||
      host.user.isDeleted ||
      host.user.status !== UserStatus.ACTIVE ||
      !canHoldHostRole(host.user.role)
    ) {
      throw new ConflictException("The requester no longer hosts this tournament. Reject this request.");
    }
  }

  async execute(tx: PrismaTransactionClient, request: ApprovalRequest, reviewer: { id: string }) {
    const { tournamentId } = payloadSchema.parse(request.requestedValue);
    const { version } = z.object({ version: z.number() }).parse(request.currentValue);
    await publishInTx(tx, tournamentId, version);
    await tx.tournamentAuditLog.create({
      data: {
        action: TournamentAuditAction.PUBLISHED,
        actorId: reviewer.id,
        targetId: request.id,
        targetType: "ApprovalRequest",
        tournamentId
      }
    });
    return { published: true, tournamentId };
  }
}

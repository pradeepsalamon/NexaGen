import { Injectable } from "@nestjs/common";
import type { Prisma, TournamentAuditAction } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type PrismaTx = Parameters<Parameters<PrismaService["$transaction"]>[0]>[0];

export type TournamentAuditEntry = {
  action: TournamentAuditAction;
  /** Null for an automated action (cron, worker). */
  actorId: string | null;
  /** Null for an academy-level action (settings). */
  tournamentId?: string | null;
  targetType?: string;
  targetId?: string;
  reason?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
};

/**
 * The append-only tournament audit log (docs/TOURNAMENTS.md §3.1). Always
 * written in the same transaction as the change it records, so a change is
 * never committed without its audit row. The academy comes from the request's
 * tenant context (the tenant-scope extension sets `tenantId`).
 */
@Injectable()
export class TournamentAuditService {
  async record(tx: PrismaTx, entry: TournamentAuditEntry): Promise<void> {
    await tx.tournamentAuditLog.create({
      data: {
        action: entry.action,
        actorId: entry.actorId,
        afterJson: entry.after,
        beforeJson: entry.before,
        reason: entry.reason,
        targetId: entry.targetId,
        targetType: entry.targetType,
        tournamentId: entry.tournamentId ?? null
      }
    });
  }
}

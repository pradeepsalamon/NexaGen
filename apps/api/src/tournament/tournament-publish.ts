import { ConflictException } from "@nestjs/common";
import { TournamentStatus } from "@prisma/client";
import type { PrismaTransactionClient } from "../prisma/prisma.service";

/** DRAFT → PUBLISHED, claimed on status and version (used directly and by the approval handler). */
export async function publishInTx(tx: PrismaTransactionClient, id: string, version: number): Promise<void> {
  const { count } = await tx.tournament.updateMany({
    data: { publishedAt: new Date(), status: TournamentStatus.PUBLISHED, version: { increment: 1 } },
    where: { id, status: TournamentStatus.DRAFT, version }
  });
  if (count === 0) throw new ConflictException("The tournament changed since it was submitted. Review it again.");
}

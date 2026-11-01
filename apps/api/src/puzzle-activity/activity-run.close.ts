import { LiveClassActivityRunStatus, PlayoutEndReason, PlayoutGameStatus, PlayoutResult, type Prisma } from "@prisma/client";

/** The two writes this needs, so PrismaService (an extended client) fits as it is. */
type Client = {
  liveClassActivityRun: {
    updateMany(args: { where: Prisma.LiveClassActivityRunWhereInput; data: Prisma.LiveClassActivityRunUpdateManyMutationInput }): Promise<{ count: number }>;
  };
  liveClassPlayoutGame: {
    updateMany(args: { where: Prisma.LiveClassPlayoutGameWhereInput; data: Prisma.LiveClassPlayoutGameUpdateManyMutationInput }): Promise<{ count: number }>;
  };
};

/**
 * Close a run and whatever games are still open in it. Status-filtered, so two
 * callers (the coach's End, a timer, the class ending) can't both finish it.
 * Returns whether this call was the one that ended it. A class ending goes
 * through here too, so LiveClassService needs no dependency on this module.
 */
export async function closeActivityRun(
  client: Client,
  run: { id: string; revealOnEnd: boolean },
  endedAt: Date
): Promise<boolean> {
  const { count } = await client.liveClassActivityRun.updateMany({
    where: { id: run.id, status: LiveClassActivityRunStatus.ACTIVE },
    data: {
      endedAt,
      ...(run.revealOnEnd ? { revealedAt: endedAt } : {}),
      status: LiveClassActivityRunStatus.ENDED
    }
  });
  if (count === 0) return false;
  await client.liveClassPlayoutGame.updateMany({
    where: { runId: run.id, status: PlayoutGameStatus.IN_PROGRESS },
    data: {
      endReason: PlayoutEndReason.ACTIVITY_ENDED,
      finishedAt: endedAt,
      result: PlayoutResult.NONE,
      score: 0,
      status: PlayoutGameStatus.COMPLETED
    }
  });
  return true;
}

/** An MCQ set to reveal at the end reveals when it ends, however it ended. */
export function revealsOnEnd(run: { kind: string; configJson: unknown }): boolean {
  return run.kind === "MCQ" && (run.configJson as { revealMode?: string }).revealMode === "ON_ACTIVITY_END";
}

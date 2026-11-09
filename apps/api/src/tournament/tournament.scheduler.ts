import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { TournamentStatus } from "@prisma/client";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { TournamentGameService } from "./tournament-game.service";
import { TournamentRunnerService } from "./tournament-runner.service";

/**
 * The tournament clock (docs/TOURNAMENTS.md §3.3): every few seconds, for
 * every academy, finish games whose side to move has run out of time or never
 * made its first move, pair the arena pool, end arenas, start the next round
 * after the break, and start tournaments whose start time has come. One
 * runner across the cluster (job lock); every step re-checks under the
 * tournament's row lock, so a late or doubled tick changes nothing.
 */
@Injectable()
export class TournamentScheduler {
  private readonly logger = new Logger(TournamentScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobLockService,
    private readonly games: TournamentGameService,
    private readonly runner: TournamentRunnerService
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async tickCron(): Promise<void> {
    await this.jobs.runForEachTenant(JOB_LOCKS.tournamentTick, () => this.tickTenant(), { ttlMs: 60_000 });
  }

  /** One academy's pass (inside its tenant context). */
  async tickTenant(now = new Date()): Promise<void> {
    const due = await this.prisma.tournament.findMany({
      select: { id: true, status: true },
      where: {
        OR: [
          { status: { in: [TournamentStatus.LIVE, TournamentStatus.PAUSED] } },
          { startsAt: { lte: now }, status: TournamentStatus.PUBLISHED }
        ]
      }
    });
    for (const t of due) {
      try {
        if (t.status !== TournamentStatus.PUBLISHED) await this.games.sweep(t.id, now);
        await this.runner.tick(t.id, now);
      } catch (error) {
        // One broken tournament never stops the others; the next tick retries.
        this.logger.error(`tournament tick failed (${t.id})`, error instanceof Error ? error.stack : String(error));
      }
    }
  }
}

import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { TournamentStatus } from "@prisma/client";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { requireTenantId } from "../tenancy/tenant-sql";
import { TournamentGameService } from "./tournament-game.service";
import { TournamentNotifierService } from "./tournament-notifier.service";
import { TournamentRunnerService } from "./tournament-runner.service";
import { TOURNAMENT_TIMER_HORIZON_MS, TournamentTimerService } from "./tournament-timer.service";

/**
 * The tournament clock (docs/TOURNAMENTS.md §3.3): every few seconds, for
 * every academy, finish games whose side to move has run out of time or never
 * made its first move, pair the arena pool, end arenas, start the next round
 * after the break, and start tournaments whose start time has come. One
 * runner across the cluster (job lock); every step re-checks under the
 * tournament's row lock, so a late or doubled tick changes nothing.
 *
 * The cron is the safety net. Between passes, `TournamentTimerService` runs
 * the same pass for one tournament at the exact moment its next deadline
 * falls (start time, next round, arena end, a flag), so nothing waits for the
 * next pass.
 */
@Injectable()
export class TournamentScheduler implements OnModuleInit {
  private readonly logger = new Logger(TournamentScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobLockService,
    private readonly games: TournamentGameService,
    private readonly runner: TournamentRunnerService,
    private readonly notifier: TournamentNotifierService,
    private readonly timers: TournamentTimerService
  ) {}

  onModuleInit() {
    this.timers.setRunner(
      (id) => this.runOne(id),
      (id) => this.armNext(id)
    );
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async tickCron(): Promise<void> {
    await this.jobs.runForEachTenant(JOB_LOCKS.tournamentTick, () => this.tickTenant(), { ttlMs: 60_000 });
  }

  /** One academy's pass (inside its tenant context). */
  async tickTenant(now = new Date()): Promise<void> {
    const due = await this.prisma.tournament.findMany({
      select: { id: true },
      where: {
        OR: [
          { status: { in: [TournamentStatus.LIVE, TournamentStatus.PAUSED] } },
          // A little ahead of the start, so its timer is armed for the exact second.
          { startsAt: { lte: new Date(now.getTime() + TOURNAMENT_TIMER_HORIZON_MS) }, status: TournamentStatus.PUBLISHED }
        ]
      }
    });
    for (const t of due) {
      try {
        await this.runOne(t.id, now);
      } catch (error) {
        // One broken tournament never stops the others; the next tick retries.
        this.logger.error(`tournament tick failed (${t.id})`, error instanceof Error ? error.stack : String(error));
      }
    }
    // Claim-first scheduled messages (starting soon, pairings, rounds, completion).
    try {
      await this.notifier.tick(now);
    } catch (error) {
      this.logger.error("tournament notifications failed", error instanceof Error ? error.stack : String(error));
    }
  }

  /**
   * One tournament's pass (inside its academy): flags and no-shows, then the
   * start / next round / arena step, then the timer for whatever is due next.
   */
  async runOne(id: string, now = new Date()): Promise<void> {
    const before = await this.prisma.tournament.findUnique({ select: { status: true }, where: { id } });
    if (!before) return;
    if (before.status === TournamentStatus.LIVE || before.status === TournamentStatus.PAUSED) await this.games.sweep(id, now);
    await this.runner.tick(id, now);
    await this.armNext(id);
  }

  /** Arms the timer for the tournament's earliest deadline, when it is close. */
  private async armNext(id: string) {
    const t = await this.prisma.tournament.findUnique({
      select: { arenaEndsAt: true, nextRoundAt: true, startsAt: true, status: true },
      where: { id }
    });
    if (!t) return;
    const now = Date.now();
    const candidates: (number | null | undefined)[] = [];
    if (t.status === TournamentStatus.PUBLISHED) candidates.push(t.startsAt.getTime());
    if (t.status === TournamentStatus.LIVE) candidates.push(t.nextRoundAt?.getTime(), t.arenaEndsAt?.getTime());
    if (t.status === TournamentStatus.LIVE || t.status === TournamentStatus.PAUSED) candidates.push(await this.games.nextDeadline(id));
    // Only what is ahead or just due (a zero-second break): an old deadline that changed nothing
    // (too few players to start, a paused tournament) waits for the cron instead of spinning.
    const ahead = candidates.filter((at): at is number => typeof at === "number" && at > now - 1000);
    if (ahead.length === 0) return;
    this.timers.arm(requireTenantId("tournamentTimer"), id, Math.min(...ahead), now);
  }
}

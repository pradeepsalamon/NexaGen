import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { currentTenantId, runInTenant } from "../tenancy/tenant-context";
import { TournamentEventsService } from "./tournament-events.service";

/** Deadlines further away than this are left to the next cron pass, which re-arms the timer. */
export const TOURNAMENT_TIMER_HORIZON_MS = 20_000;
/** Fire just after the deadline, so "has it passed?" is true when the run looks. */
const TIMER_SLACK_MS = 30;

type Armed = { at: number; handle: NodeJS.Timeout };

/**
 * Exact-time wake-ups for the tournament clock (docs/TOURNAMENTS.md "Timing").
 * The cron pass runs every few seconds; on its own that makes a start, a new
 * round or a flag fall up to a whole pass late. This holds one in-process
 * timer per tournament, armed for its earliest known deadline, and runs the
 * same idempotent pass for that tournament at that moment. A timer is only an
 * accelerator: every step re-checks under the tournament's row lock, and the
 * cron still runs, so a lost timer (a restart, another instance) costs a few
 * seconds and never a result.
 */
@Injectable()
export class TournamentTimerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TournamentTimerService.name);
  private readonly timers = new Map<string, Armed>();
  private unsubscribe: (() => void) | null = null;
  private runner: ((tournamentId: string) => Promise<void>) | null = null;
  private armer: ((tournamentId: string) => Promise<void>) | null = null;

  constructor(private readonly events: TournamentEventsService) {}

  onModuleInit() {
    // Emitted inside the request (or job) that created the deadline, so the academy is in context.
    this.unsubscribe = this.events.subscribe((event) => {
      const tenantId = currentTenantId();
      if (!tenantId) return;
      if (event.type === "deadline") this.arm(tenantId, event.tournamentId, event.at);
      // A result or a host action may have set the next round's time: look for what is due next.
      else if (event.type === "state") void this.rearm(tenantId, event.tournamentId);
    });
  }

  onModuleDestroy() {
    this.unsubscribe?.();
    for (const timer of this.timers.values()) clearTimeout(timer.handle);
    this.timers.clear();
  }

  /** The pass to run for one tournament (set by the scheduler; runs inside the academy). */
  setRunner(run: (tournamentId: string) => Promise<void>, arm: (tournamentId: string) => Promise<void>) {
    this.runner = run;
    this.armer = arm;
  }

  /** Arms (or brings forward) the tournament's timer. A later deadline than the armed one is ignored: the run re-arms. */
  arm(tenantId: string, tournamentId: string, at: number, now = Date.now()): boolean {
    if (!Number.isFinite(at) || at - now > TOURNAMENT_TIMER_HORIZON_MS) return false;
    const armed = this.timers.get(tournamentId);
    if (armed && armed.at <= at) return false;
    if (armed) clearTimeout(armed.handle);
    const handle = setTimeout(() => {
      this.timers.delete(tournamentId);
      void this.fire(tenantId, tournamentId);
    }, Math.max(0, at - now) + TIMER_SLACK_MS);
    handle.unref?.();
    this.timers.set(tournamentId, { at, handle });
    return true;
  }

  armedAt(tournamentId: string): number | null {
    return this.timers.get(tournamentId)?.at ?? null;
  }

  private async rearm(tenantId: string, tournamentId: string) {
    const arm = this.armer;
    if (!arm) return;
    try {
      await runInTenant(tenantId, "tournament-timer", () => arm(tournamentId));
    } catch (error) {
      this.logger.debug(`tournament timer not armed (${tournamentId}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async fire(tenantId: string, tournamentId: string) {
    const run = this.runner;
    if (!run) return;
    try {
      await runInTenant(tenantId, "tournament-timer", () => run(tournamentId));
    } catch (error) {
      // The cron pass retries; a timer never takes the process down.
      this.logger.warn(`tournament timer failed (${tournamentId}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { getApiEnv } from '@nexa-chess/config/api';
import { JOB_LOCKS, JobLockService } from '../prisma/job-lock.service';
import { GameSourcesService } from './game-sources.service';

/** Hourly so long backlogs and rate limits recover soon; each account still syncs about once a day. */
@Injectable()
export class GameSourcesScheduler {
  private readonly logger = new Logger(GameSourcesScheduler.name);

  constructor(
    private readonly jobLocks: JobLockService,
    private readonly sources: GameSourcesService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async autoSync(): Promise<void> {
    if (!getApiEnv().EXTERNAL_GAME_IMPORT_ENABLED) return;
    try {
      await this.jobLocks.runExclusive(JOB_LOCKS.externalGameSync, (signal) => this.sources.runAutoSync(signal));
    } catch (error) {
      this.logger.error('Game auto-sync cron failed', error as Error);
    }
  }
}

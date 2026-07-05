import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { TrashService } from "./trash.service";

@Injectable()
export class TrashScheduler {
  private readonly logger = new Logger(TrashScheduler.name);

  constructor(private readonly trashService: TrashService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupExpiredTrash() {
    const deletedCount = await this.trashService.cleanupExpiredTrash();

    if (deletedCount > 0) {
      this.logger.log(`Permanently deleted ${deletedCount} expired trash item(s).`);
    }
  }
}

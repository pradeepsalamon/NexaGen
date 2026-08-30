import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationService } from "./notification.service";

const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class NotificationScheduler {
  private readonly logger = new Logger(NotificationScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService
  ) {}

  /** Once a day: remind students of assignments due within the next 24h. */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async assignmentDueReminders() {
    const now = new Date();
    const soon = new Date(now.getTime() + DUE_SOON_WINDOW_MS);

    const rows = await this.prisma.studentAssignment.findMany({
      where: {
        status: { in: ["PENDING", "IN_PROGRESS"] },
        assignmentBatch: { dueDate: { gt: now, lte: soon } }
      },
      select: {
        id: true,
        studentId: true,
        assignmentBatch: {
          select: { dueDate: true, assignment: { select: { title: true } } }
        }
      }
    });

    const inserted = await this.notifications.notifyMany(
      rows.map((r) => ({
        userId: r.studentId,
        type: "ASSIGNMENT_DUE_SOON" as const,
        title: `"${r.assignmentBatch.assignment.title}" is due soon`,
        body: `Due ${r.assignmentBatch.dueDate.toISOString().slice(0, 16).replace("T", " ")} UTC — not finished yet.`,
        linkPath: `/student/practice/${r.id}`,
        dedupeKey: `due-soon:${r.id}`
      }))
    );

    if (inserted > 0) {
      this.logger.log(`Sent ${inserted} assignment-due reminder(s).`);
    }
  }
}

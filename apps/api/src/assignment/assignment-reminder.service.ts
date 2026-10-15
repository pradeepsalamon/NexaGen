import { ForbiddenException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  ASSIGNMENT_DUE_SOON_HOURS,
  ASSIGNMENT_OVERVIEW_AHEAD_DAYS,
  ASSIGNMENT_OVERVIEW_PAST_DAYS,
  resolveAssignmentDueStatus,
  type AssignmentDueStatus,
  type AssignmentOverviewQuery,
  type AssignmentOverviewResponse,
  type AssignmentOverviewRow,
  type AssignmentReminderItem,
  type AssignmentRemindersResponse
} from "@nexa-chess/types";
import { Prisma, UserRole } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { PrismaService } from "../prisma/prisma.service";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Overdue first, then the nearest deadline; finished work last. */
const DUE_ORDER: Record<AssignmentDueStatus, number> = {
  OVERDUE: 0,
  DUE_TODAY: 1,
  DUE_SOON: 2,
  UPCOMING: 3,
  COMPLETED: 4
};

/**
 * Read-only due-date views: a student's own outstanding work (dashboard
 * banner, popup, sidebar count) and the coach/admin overview of deployments
 * around today. Nothing here is stored — every status is derived from
 * `dueDate` + the row's status with the shared `resolveAssignmentDueStatus`,
 * in the caller's own `User.timezone`.
 */
@Injectable()
export class AssignmentReminderService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async reminders(accessToken: string | undefined): Promise<AssignmentRemindersResponse> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.STUDENT) {
      throw new ForbiddenException("Only students have assignment reminders.");
    }

    const now = new Date();
    const rows = await this.prisma.studentAssignment.findMany({
      where: {
        studentId: user.id,
        status: { in: ["PENDING", "IN_PROGRESS"] },
        assignmentBatch: {
          batch: { isDeleted: false },
          // Ancient unfinished work stops nagging after the overview window.
          dueDate: {
            gt: new Date(now.getTime() - ASSIGNMENT_OVERVIEW_PAST_DAYS * DAY_MS),
            lte: new Date(now.getTime() + ASSIGNMENT_DUE_SOON_HOURS * HOUR_MS)
          }
        }
      },
      include: {
        assignmentBatch: {
          select: {
            assignment: { select: { title: true } },
            batch: { select: { name: true } },
            dueDate: true
          }
        }
      },
      orderBy: { assignmentBatch: { dueDate: "asc" } },
      take: 100
    });

    const items: AssignmentReminderItem[] = [];
    for (const row of rows) {
      const dueStatus = resolveAssignmentDueStatus(
        { completed: false, dueDate: row.assignmentBatch.dueDate },
        now,
        user.timezone
      );
      if (dueStatus !== "OVERDUE" && dueStatus !== "DUE_TODAY" && dueStatus !== "DUE_SOON") continue;
      items.push({
        batchName: row.assignmentBatch.batch.name,
        dueDate: row.assignmentBatch.dueDate.toISOString(),
        dueStatus,
        id: row.id,
        status: row.status === "IN_PROGRESS" ? "IN_PROGRESS" : "PENDING",
        title: row.assignmentBatch.assignment.title
      });
    }
    items.sort((a, b) => DUE_ORDER[a.dueStatus] - DUE_ORDER[b.dueStatus] || a.dueDate.localeCompare(b.dueDate));

    return {
      counts: {
        dueSoon: items.filter((i) => i.dueStatus === "DUE_SOON").length,
        dueToday: items.filter((i) => i.dueStatus === "DUE_TODAY").length,
        overdue: items.filter((i) => i.dueStatus === "OVERDUE").length
      },
      items,
      serverTime: now.toISOString()
    };
  }

  async overview(
    accessToken: string | undefined,
    query: AssignmentOverviewQuery
  ): Promise<AssignmentOverviewResponse> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    if (!isAdmin && user.role !== UserRole.COACH) {
      throw new ForbiddenException("Only coaches and admins can see the assignment overview.");
    }

    const now = new Date();
    const batchWhere: Prisma.BatchWhereInput = isAdmin
      ? { isDeleted: false }
      : { isDeleted: false, coaches: { some: { coachId: user.id, isDeleted: false } } };

    const deployments = await this.prisma.assignmentBatch.findMany({
      where: {
        batch: batchWhere,
        dueDate: {
          gte: new Date(now.getTime() - ASSIGNMENT_OVERVIEW_PAST_DAYS * DAY_MS),
          lte: new Date(now.getTime() + ASSIGNMENT_OVERVIEW_AHEAD_DAYS * DAY_MS)
        }
      },
      include: {
        assignment: { select: { id: true, title: true } },
        batch: { select: { id: true, name: true } },
        students: {
          select: {
            completedAt: true,
            id: true,
            status: true,
            student: { select: { firstName: true, id: true, lastName: true } },
            studentId: true
          }
        }
      },
      orderBy: { dueDate: "asc" },
      take: 500
    });

    const batches = new Map<string, string>();
    const rows: AssignmentOverviewRow[] = [];
    const totals = { dueSoon: 0, dueToday: 0, overdueDeployments: 0, overdueStudents: 0 };

    for (const d of deployments) {
      batches.set(d.batch.id, d.batch.name);
      if (query.batchId && d.batchId !== query.batchId) continue;

      const completed = d.students.filter((s) => s.status === "COMPLETED").length;
      const inProgress = d.students.filter((s) => s.status === "IN_PROGRESS").length;
      const outstandingCount = d.students.length - completed;
      const dueStatus = resolveAssignmentDueStatus(
        { completed: d.students.length > 0 && outstandingCount === 0, dueDate: d.dueDate },
        now,
        user.timezone
      );

      if (dueStatus === "OVERDUE") {
        totals.overdueDeployments += 1;
        totals.overdueStudents += outstandingCount;
      } else if (dueStatus === "DUE_TODAY") {
        totals.dueToday += outstandingCount;
      } else if (dueStatus === "DUE_SOON") {
        totals.dueSoon += outstandingCount;
      }

      if (query.dueStatus && dueStatus !== query.dueStatus) continue;

      rows.push({
        assignmentId: d.assignment.id,
        batchId: d.batch.id,
        batchName: d.batch.name,
        completed,
        deploymentId: d.id,
        dueDate: d.dueDate.toISOString(),
        dueStatus,
        inProgress,
        outstanding: d.students
          .filter((s) => s.status !== "COMPLETED")
          .map((s) => ({
            completedAt: s.completedAt?.toISOString() ?? null,
            id: s.id,
            name: `${s.student.firstName} ${s.student.lastName ?? ""}`.trim(),
            status: s.status,
            studentId: s.studentId
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        pending: d.students.filter((s) => s.status === "PENDING").length,
        title: d.assignment.title,
        total: d.students.length
      });
    }

    rows.sort((a, b) => {
      const byStatus = DUE_ORDER[a.dueStatus] - DUE_ORDER[b.dueStatus];
      if (byStatus !== 0) return byStatus;
      // Most recently missed first; otherwise the nearest deadline first.
      return a.dueStatus === "OVERDUE" ? b.dueDate.localeCompare(a.dueDate) : a.dueDate.localeCompare(b.dueDate);
    });

    return {
      batches: [...batches].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      rows,
      serverTime: now.toISOString(),
      totals
    };
  }
}

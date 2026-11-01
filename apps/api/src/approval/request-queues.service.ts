import { Injectable } from "@nestjs/common";
import {
  OTHER_REQUEST_QUEUE_LABELS,
  formatMoney,
  type OtherRequestQueue,
  type OtherRequestQueueItem,
  type OtherRequestQueueKind,
  type OtherRequestQueuesResponse
} from "@nexa-chess/types";
import { UserRole } from "@prisma/client";
import { EntitlementService } from "../platform/entitlement.service";
import { PrismaService } from "../prisma/prisma.service";
import type { ApprovalActor } from "./approval-handler";

/** How many waiting items each queue shows in the inbox (the count covers all). */
const PREVIEW = 5;

const fullName = (u: { firstName: string; lastName: string | null } | null | undefined) =>
  u ? `${u.firstName} ${u.lastName ?? ""}`.trim() : null;

/**
 * Stage 5 of docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md: the review queues
 * that keep their own tables and flows (manual payments, account deletions,
 * coach applications), listed in the same admin inbox. Read-only: each is still
 * decided on its own page, by the rules of its own service. A queue appears
 * only for a caller who could review it there:
 *  - manual payments: ADMIN / SUPER_ADMIN, and only while the plan includes
 *    `studentPayments` (the review routes are gated on it);
 *  - account deletions: ADMIN / SUPER_ADMIN;
 *  - coach applications: SUPER_ADMIN only.
 */
@Injectable()
export class RequestQueuesService {
  constructor(
    private readonly entitlements: EntitlementService,
    private readonly prisma: PrismaService
  ) {}

  /** `reviewer` is already authenticated as ADMIN or SUPER_ADMIN by the caller. */
  async list(reviewer: ApprovalActor): Promise<OtherRequestQueuesResponse> {
    const queues: Promise<OtherRequestQueue>[] = [];
    if (await this.entitlements.hasFeature("studentPayments")) queues.push(this.manualPayments());
    queues.push(this.accountDeletions());
    if (reviewer.role === UserRole.SUPER_ADMIN) queues.push(this.coachApplications());
    return { queues: await Promise.all(queues) };
  }

  private async manualPayments(): Promise<OtherRequestQueue> {
    const where = { status: "PENDING" as const };
    const [pendingCount, rows] = await Promise.all([
      this.prisma.manualPaymentRecord.count({ where }),
      this.prisma.manualPaymentRecord.findMany({
        include: {
          payment: {
            select: {
              amount: true,
              currency: true,
              order: {
                select: {
                  plan: { select: { batch: { select: { name: true } }, name: true } },
                  user: { select: { firstName: true, lastName: true } }
                }
              }
            }
          },
          recordedByUser: { select: { firstName: true, lastName: true } }
        },
        orderBy: { createdAt: "asc" },
        take: PREVIEW,
        where
      })
    ]);
    return this.queue("MANUAL_PAYMENT", pendingCount, rows.map((row) => {
      const order = row.payment.order;
      const student = fullName(order?.user) ?? "Former student";
      const plan = [order?.plan?.batch?.name, order?.plan?.name].filter(Boolean).join(" · ");
      return {
        createdAt: row.createdAt.toISOString(),
        id: row.id,
        subtitle: [plan || null, `recorded by ${fullName(row.recordedByUser) ?? "a former user"}`]
          .filter(Boolean)
          .join(" · "),
        title: `${student} · ${formatMoney(row.payment.amount, row.payment.currency)}`
      };
    }));
  }

  private async accountDeletions(): Promise<OtherRequestQueue> {
    const where = { status: "PENDING" as const };
    const [pendingCount, rows] = await Promise.all([
      this.prisma.accountDeletionRequest.count({ where }),
      this.prisma.accountDeletionRequest.findMany({
        orderBy: { createdAt: "asc" },
        select: { createdAt: true, id: true, userName: true, userRole: true },
        take: PREVIEW,
        where
      })
    ]);
    return this.queue("ACCOUNT_DELETION", pendingCount, rows.map((row) => ({
      createdAt: row.createdAt.toISOString(),
      id: row.id,
      subtitle: row.userRole.charAt(0) + row.userRole.slice(1).toLowerCase().replace("_", " "),
      title: row.userName
    })));
  }

  /** Same filter as `AdminService.getPendingCoaches`. */
  private async coachApplications(): Promise<OtherRequestQueue> {
    const where = { coachProfile: { approvalStatus: "PENDING" as const }, isDeleted: false, role: UserRole.COACH };
    const [pendingCount, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          coachProfile: { select: { fideRating: true, title: true } },
          createdAt: true,
          firstName: true,
          id: true,
          lastName: true
        },
        take: PREVIEW,
        where
      })
    ]);
    return this.queue("COACH_APPLICATION", pendingCount, rows.map((row) => {
      const facts = [row.coachProfile?.title, row.coachProfile?.fideRating ? `FIDE ${row.coachProfile.fideRating}` : null];
      return {
        createdAt: row.createdAt.toISOString(),
        id: row.id,
        subtitle: facts.filter(Boolean).join(" · ") || null,
        title: fullName(row) ?? "Applicant"
      };
    }));
  }

  private queue(kind: OtherRequestQueueKind, pendingCount: number, items: OtherRequestQueueItem[]): OtherRequestQueue {
    return { items, kind, label: OTHER_REQUEST_QUEUE_LABELS[kind], pendingCount };
  }
}

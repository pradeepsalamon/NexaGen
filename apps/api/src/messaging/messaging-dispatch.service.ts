import { Injectable, Logger } from "@nestjs/common";
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import {
  renderMessageTemplate,
  type MessageVariables,
  type MessagingAudience,
  type MessagingDispatchSummary,
  type MessagingEvent
} from "@nexa-chess/types";
import { Prisma, UserRole, UserStatus, type MessagingRule } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { MessagingRuleService } from "./messaging-rule.service";
import { ACADEMY_NAME, formatInZone } from "./messaging.format";
import { computeScheduledFor } from "./messaging.schedule";

/** One resolved addressee plus the values its templates bind. */
interface Recipient {
  userId: string;
  role: UserRole;
  phoneNumber: string | null;
  timezone: string;
  variables: MessageVariables;
  /** Deep link for the in-app notification. */
  linkPath: string | null;
  /** Makes this send unique, so a cron re-run collides instead of re-sending. */
  dedupeKey: string | null;
}

export type DispatchRequest =
  | {
      event:
        | "CLASS_SCHEDULED"
        | "CLASS_CANCELLED"
        | "CLASS_REMINDER"
        | "CLASS_REMINDER_COACH";
      classId: string;
    }
  | { event: "ASSIGNMENT_ASSIGNED"; assignmentBatchId: string }
  | { event: "ASSIGNMENT_DUE_SOON"; studentAssignmentIds: string[] }
  | {
      event: "ASSIGNMENT_GRADED";
      studentAssignmentId: string;
      coachId: string;
      studentName: string;
      scorePercent: number;
      outcome: string;
    }
  | { event: "ANNOUNCEMENT"; announcementId: string }
  | { event: "ACCOUNT_WELCOME" | "ACCOUNT_APPROVED"; userId: string };

const EMPTY_SUMMARY: MessagingDispatchSummary = {
  ruleEnabled: false,
  recipients: 0,
  queuedWhatsApp: 0,
  queuedInApp: 0,
  missingPhone: 0,
  scheduledFor: null
};

/**
 * Turns a domain event into queued messages, per the admin's rule for it.
 *
 * Nothing is sent here: each message becomes a PENDING `message_deliveries` row
 * and `MessagingDeliveryWorker` delivers it. That keeps the triggering request
 * free of a provider round-trip, survives an outage (the row is already
 * committed), and lets a rule hold its messages for a scheduled hour.
 *
 * Every entry point is best-effort — callers are ordinary feature services and
 * a messaging failure must never fail their request.
 */
@Injectable()
export class MessagingDispatchService {
  private readonly env = getApiEnv();
  private readonly logger = new Logger(MessagingDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: MessagingRuleService,
    private readonly whatsapp: WhatsAppService
  ) {}

  /** Fire-and-forget entry point for feature services. Never throws. */
  dispatchInBackground(request: DispatchRequest): void {
    void this.dispatch(request).catch((error) => {
      this.logger.warn(
        `Messaging dispatch for ${request.event} failed: ${(error as Error).message}`
      );
    });
  }

  async dispatch(request: DispatchRequest): Promise<MessagingDispatchSummary> {
    const rule = await this.rules.getRule(request.event);
    if (!rule.enabled || (!rule.whatsappEnabled && !rule.inAppEnabled)) {
      return { ...EMPTY_SUMMARY };
    }

    const recipients = await this.resolveRecipients(request, rule.audience);
    const summary: MessagingDispatchSummary = {
      ...EMPTY_SUMMARY,
      ruleEnabled: true,
      recipients: recipients.length
    };

    const now = new Date();
    let earliest: Date | null = null;

    for (const recipient of recipients) {
      // A lead-time rule is already being dispatched at the right moment by the
      // scheduler; only IMMEDIATE/DAILY/WEEKLY rules get a future due time.
      const scheduledFor = this.rules.usesLeadTime(rule.event)
        ? now
        : computeScheduledFor(rule, recipient.timezone, now);

      if (!earliest || scheduledFor < earliest) earliest = scheduledFor;

      const body = renderMessageTemplate(rule.body, recipient.variables);

      if (rule.whatsappEnabled) {
        const queued = await this.queueWhatsApp(rule, recipient, body, scheduledFor);
        if (queued === "queued") summary.queuedWhatsApp += 1;
        if (queued === "no-phone") summary.missingPhone += 1;
      }

      if (rule.inAppEnabled) {
        const queued = await this.queue({
          rule,
          recipient,
          channel: "IN_APP",
          body,
          title: renderMessageTemplate(rule.title, recipient.variables),
          scheduledFor
        });
        if (queued) summary.queuedInApp += 1;
      }
    }

    summary.scheduledFor =
      earliest && earliest.getTime() > now.getTime() ? earliest.toISOString() : null;

    return summary;
  }

  private async queueWhatsApp(
    rule: MessagingRule,
    recipient: Recipient,
    body: string,
    scheduledFor: Date
  ): Promise<"queued" | "no-phone" | "duplicate"> {
    const to = this.whatsapp.normalizeRecipient(recipient.phoneNumber);
    if (!to) {
      // Recorded rather than dropped: "who did we fail to reach" is the first
      // thing an admin asks, and a skip is not a failure worth retrying.
      await this.queue({
        rule,
        recipient,
        channel: "WHATSAPP",
        body,
        status: "SKIPPED",
        scheduledFor,
        error: recipient.phoneNumber
          ? "Phone number is not a valid WhatsApp number."
          : "No phone number on file."
      });
      return "no-phone";
    }

    const queued = await this.queue({
      rule,
      recipient,
      channel: "WHATSAPP",
      body,
      phone: to,
      scheduledFor,
      ...(rule.whatsappTemplateName
        ? {
            templateName: rule.whatsappTemplateName,
            templateLanguage: rule.whatsappTemplateLanguage,
            templateParams: rule.whatsappTemplateParams.map((param) =>
              renderMessageTemplate(param, recipient.variables)
            )
          }
        : {})
    });

    return queued ? "queued" : "duplicate";
  }

  /** Writes one outbox row. False means the dedupe key already claimed it. */
  private async queue(input: {
    rule: MessagingRule;
    recipient: Recipient;
    channel: "WHATSAPP" | "IN_APP";
    body: string;
    scheduledFor: Date;
    title?: string;
    phone?: string;
    status?: "PENDING" | "SKIPPED";
    error?: string;
    templateName?: string | null;
    templateLanguage?: string | null;
    templateParams?: string[];
  }): Promise<boolean> {
    try {
      await this.prisma.messageDelivery.create({
        data: {
          event: input.rule.event,
          channel: input.channel,
          status: input.status ?? "PENDING",
          recipientId: input.recipient.userId,
          recipientPhone: input.phone ?? null,
          body: input.body,
          title: input.title ?? null,
          linkPath: input.recipient.linkPath,
          templateName: input.templateName ?? null,
          templateLanguage: input.templateLanguage ?? null,
          templateParams: input.templateParams ?? [],
          scheduledFor: input.scheduledFor,
          error: input.error ?? null,
          dedupeKey: input.recipient.dedupeKey
        }
      });
      return true;
    } catch (error) {
      // The unique (channel, dedupeKey) index IS the idempotency guarantee: a
      // repeated sweep collides on insert instead of racing a second send.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return false;
      }
      throw error;
    }
  }

  // ── recipients ──

  private async resolveRecipients(
    request: DispatchRequest,
    audience: MessagingAudience
  ): Promise<Recipient[]> {
    switch (request.event) {
      case "CLASS_SCHEDULED":
      case "CLASS_CANCELLED":
      case "CLASS_REMINDER":
      case "CLASS_REMINDER_COACH":
        return this.classRecipients(request.event, request.classId, audience);
      case "ASSIGNMENT_ASSIGNED":
        return this.assignmentRecipients(request.assignmentBatchId);
      case "ASSIGNMENT_DUE_SOON":
        return this.dueSoonRecipients(request.studentAssignmentIds);
      case "ASSIGNMENT_GRADED":
        return this.gradedRecipients(request);
      case "ANNOUNCEMENT":
        return this.announcementRecipients(request.announcementId);
      case "ACCOUNT_WELCOME":
      case "ACCOUNT_APPROVED":
        return this.accountRecipients(request.event, request.userId, audience);
    }
  }

  private async classRecipients(
    event: MessagingEvent,
    classId: string,
    audience: MessagingAudience
  ): Promise<Recipient[]> {
    const cls = await this.prisma.coachClass.findUnique({
      where: { id: classId },
      include: {
        coach: true,
        batch: {
          include: {
            students: { where: { isDeleted: false }, include: { student: true } }
          }
        }
      }
    });
    if (!cls) return [];

    const coachName = this.fullName(cls.coach.firstName, cls.coach.lastName);
    const startsInMinutes = Math.max(
      0,
      Math.round((cls.startsAt.getTime() - Date.now()) / 60_000)
    );

    const classVariables = (timezone: string): MessageVariables => ({
      "class.title": cls.title ?? cls.topic ?? "Chess class",
      "class.topic": cls.topic ?? "",
      "class.date": formatInZone(cls.startsAt, timezone, "date"),
      "class.time": formatInZone(cls.startsAt, timezone, "time"),
      "class.dateTime": formatInZone(cls.startsAt, timezone, "dateTime"),
      "class.startsInMinutes": String(startsInMinutes),
      "class.coachName": coachName,
      "batch.name": cls.batch?.name ?? ""
    });

    const people: { users: (typeof cls.coach)[]; role: UserRole }[] = [];
    if (audience !== "COACHES") {
      people.push({
        users: cls.batch?.students.map((s) => s.student) ?? [],
        role: UserRole.STUDENT
      });
    }
    if (audience !== "STUDENTS") {
      people.push({ users: [cls.coach], role: UserRole.COACH });
    }

    return people.flatMap(({ users, role }) =>
      users
        .filter((u) => u.status === UserStatus.ACTIVE && !u.isDeleted)
        .map((u) =>
          this.toRecipient(u, {
            variables: classVariables(u.timezone),
            linkPath: role === UserRole.STUDENT ? "/student/classes" : "/coach/classes",
            linkVariable: "links.class",
            dedupeKey: `${event}:${classId}:${u.id}`
          })
        )
    );
  }

  private async assignmentRecipients(
    assignmentBatchId: string
  ): Promise<Recipient[]> {
    const deployment = await this.prisma.assignmentBatch.findUnique({
      where: { id: assignmentBatchId },
      include: {
        assignment: { select: { title: true } },
        batch: { select: { name: true } },
        students: { include: { student: true } }
      }
    });
    if (!deployment) return [];

    return deployment.students
      .map((row) => row.student)
      .filter((u) => u.status === UserStatus.ACTIVE && !u.isDeleted)
      .map((u) =>
        this.toRecipient(u, {
          variables: this.assignmentVariables(
            deployment.assignment.title,
            deployment.batch.name,
            deployment.dueDate,
            u.timezone
          ),
          linkPath: "/student/assignments",
          linkVariable: "links.assignment",
          dedupeKey: `ASSIGNMENT_ASSIGNED:${assignmentBatchId}:${u.id}`
        })
      );
  }

  private async dueSoonRecipients(
    studentAssignmentIds: string[]
  ): Promise<Recipient[]> {
    if (studentAssignmentIds.length === 0) return [];

    const rows = await this.prisma.studentAssignment.findMany({
      where: { id: { in: studentAssignmentIds } },
      include: {
        student: true,
        assignmentBatch: {
          include: {
            assignment: { select: { title: true } },
            batch: { select: { name: true } }
          }
        }
      }
    });

    return rows
      .filter((r) => r.student.status === UserStatus.ACTIVE && !r.student.isDeleted)
      .map((r) =>
        this.toRecipient(r.student, {
          variables: this.assignmentVariables(
            r.assignmentBatch.assignment.title,
            r.assignmentBatch.batch.name,
            r.assignmentBatch.dueDate,
            r.student.timezone
          ),
          linkPath: `/student/practice/${r.id}`,
          linkVariable: "links.assignment",
          // The due date is part of the key so a rescheduled deadline reminds again.
          dedupeKey: `ASSIGNMENT_DUE_SOON:${r.id}:${r.assignmentBatch.dueDate.toISOString()}`
        })
      );
  }

  private async gradedRecipients(
    request: Extract<DispatchRequest, { event: "ASSIGNMENT_GRADED" }>
  ): Promise<Recipient[]> {
    const [coach, row] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: request.coachId } }),
      this.prisma.studentAssignment.findUnique({
        where: { id: request.studentAssignmentId },
        include: {
          assignmentBatch: {
            include: {
              assignment: { select: { title: true } },
              batch: { select: { name: true } }
            }
          }
        }
      })
    ]);
    if (!coach || !row || coach.status !== UserStatus.ACTIVE || coach.isDeleted) {
      return [];
    }

    return [
      this.toRecipient(coach, {
        variables: {
          ...this.assignmentVariables(
            row.assignmentBatch.assignment.title,
            row.assignmentBatch.batch.name,
            row.assignmentBatch.dueDate,
            coach.timezone
          ),
          "student.fullName": request.studentName,
          "result.score": `${request.scorePercent}%`,
          "result.outcome": request.outcome
        },
        linkPath: "/coach/assignments",
        linkVariable: "links.assignment",
        dedupeKey: `ASSIGNMENT_GRADED:${request.studentAssignmentId}`
      })
    ];
  }

  /**
   * The announcement's own audience decides who hears it — the rule's audience
   * is not consulted, or an admin could silently narrow a published broadcast.
   */
  private async announcementRecipients(
    announcementId: string
  ): Promise<Recipient[]> {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id: announcementId }
    });
    if (!announcement) return [];

    const roleFilter: UserRole[] =
      announcement.audience === "STUDENTS"
        ? [UserRole.STUDENT]
        : announcement.audience === "COACHES"
          ? [UserRole.COACH]
          : [UserRole.STUDENT, UserRole.COACH];

    const users = await this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        role: { in: roleFilter },
        ...(announcement.audience === "BATCH" && announcement.batchId
          ? {
              OR: [
                {
                  studentBatches: {
                    some: { batchId: announcement.batchId, isDeleted: false }
                  }
                },
                {
                  coachedBatches: {
                    some: { batchId: announcement.batchId, isDeleted: false }
                  }
                }
              ]
            }
          : {})
      }
    });

    const variables: MessageVariables = {
      "announcement.title": announcement.title,
      "announcement.body": announcement.description
    };

    return users.map((u) =>
      this.toRecipient(u, {
        variables,
        linkPath: u.role === UserRole.STUDENT ? "/student" : "/coach",
        dedupeKey: `ANNOUNCEMENT:${announcementId}:${u.id}`
      })
    );
  }

  private async accountRecipients(
    event: MessagingEvent,
    userId: string,
    audience: MessagingAudience
  ): Promise<Recipient[]> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.isDeleted) return [];

    if (audience === "STUDENTS" && user.role !== UserRole.STUDENT) return [];
    if (audience === "COACHES" && user.role !== UserRole.COACH) return [];

    return [
      this.toRecipient(user, {
        variables: {},
        linkPath: null,
        linkVariable: "links.login",
        dedupeKey: `${event}:${userId}`
      })
    ];
  }

  // ── shared bits ──

  private assignmentVariables(
    title: string,
    batchName: string,
    dueDate: Date,
    timezone: string
  ): MessageVariables {
    return {
      "assignment.title": title,
      "assignment.dueDate": formatInZone(dueDate, timezone, "date"),
      "assignment.dueTime": formatInZone(dueDate, timezone, "time"),
      "assignment.dueDateTime": formatInZone(dueDate, timezone, "dateTime"),
      "batch.name": batchName
    };
  }

  private toRecipient(
    user: {
      id: string;
      firstName: string;
      lastName: string | null;
      phoneNumber: string | null;
      role: UserRole;
      timezone: string;
    },
    options: {
      variables: MessageVariables;
      linkPath: string | null;
      linkVariable?: "links.class" | "links.assignment" | "links.login";
      dedupeKey: string | null;
    }
  ): Recipient {
    const frontendUrl = getFrontendUrl(this.env);
    const link = options.linkPath
      ? `${frontendUrl}${options.linkPath}`
      : `${frontendUrl}/login`;

    return {
      userId: user.id,
      role: user.role,
      phoneNumber: user.phoneNumber,
      timezone: user.timezone,
      linkPath: options.linkPath,
      dedupeKey: options.dedupeKey,
      variables: {
        "recipient.firstName": user.firstName,
        "recipient.lastName": user.lastName ?? "",
        "recipient.fullName": this.fullName(user.firstName, user.lastName),
        "academy.name": ACADEMY_NAME,
        "links.login": `${frontendUrl}/login`,
        ...(options.linkVariable ? { [options.linkVariable]: link } : {}),
        ...options.variables
      }
    };
  }

  private fullName(firstName: string, lastName: string | null): string {
    return `${firstName} ${lastName ?? ""}`.trim();
  }
}

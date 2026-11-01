import { Injectable, Logger } from "@nestjs/common";
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import {
  APPROVAL_ACTIONS,
  formatMoney,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  renderFormattedTemplate,
  renderMessageTemplate,
  type MessageVariables,
  type MessagingAudience,
  type MessagingDispatchSummary,
  type MessagingEvent
} from "@nexa-chess/types";
import { Prisma, UserRole, UserStatus, type MessagingRule } from "@prisma/client";
import { zonedYmd } from "../common/time";
import { EmailVerificationService } from "../email-admin/email-verification.service";
import { PrismaService } from "../prisma/prisma.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { MessagingRuleService } from "./messaging-rule.service";
import { ACADEMY_NAME, formatInZone } from "./messaging.format";
import { computeScheduledFor } from "./messaging.schedule";

const HOUR_MS = 60 * 60 * 1000;

/** One resolved addressee plus the values its templates bind. */
interface Recipient {
  userId: string;
  role: UserRole;
  phoneNumber: string | null;
  isEmailVerified: boolean;
  timezone: string;
  variables: MessageVariables;
  /** Deep link for the in-app notification. */
  linkPath: string | null;
  /** Makes this send unique, so a cron re-run collides instead of re-sending. */
  dedupeKey: string | null;
  /** Attached to the WhatsApp message, when the event carries a document. */
  document?: DispatchDocument;
}

/**
 * A file to attach to a WhatsApp message.
 *
 * Resolved by the CALLER, not here: this service persists rows and must not
 * learn how to build an invoice PDF. Payments uploads the PDF to Meta and
 * passes the resulting handle in.
 */
export type DispatchDocument = {
  /** Meta media handle, from `WhatsAppService.uploadMedia`. Valid 30 days. */
  mediaId?: string | null;
  /** Fallback when nothing could be uploaded; Meta fetches it at send time. */
  link?: string | null;
  filename?: string | null;
};

export type DispatchRequest =
  | {
      event:
        | "CLASS_SCHEDULED"
        | "CLASS_CANCELLED"
        | "CLASS_SUBSTITUTE_ASSIGNED"
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
  /** One coach notice per deployment whose due date passed with unfinished students. */
  | { event: "ASSIGNMENT_OVERDUE_COACH"; assignmentBatchId: string }
  /** Students with a revision item due; each hears at most once per send day. */
  | { event: "REVISION_DUE"; studentIds: string[] }
  | { event: "ANNOUNCEMENT"; announcementId: string }
  | { event: "ACCOUNT_WELCOME" | "ACCOUNT_APPROVED"; userId: string }
  /**
   * Payment outcomes. The caller passes the payment id only — every figure in
   * the message is read back from the row, so a message can never claim an
   * amount or a status the database does not hold.
   */
  | {
      event:
        | "PAYMENT_RECEIVED"
        | "PAYMENT_FAILED"
        | "REFUND_PROCESSED"
        | "SUBSCRIPTION_RENEWAL_FAILED";
      paymentId: string;
      /** Distinguishes repeat events on one payment (a second refund). */
      dedupeSuffix?: string;
    }
  /**
   * The invoice itself. Every figure is read back from the invoice row, and the
   * PDF is attached by the caller — this service never builds one.
   */
  | {
      event: "INVOICE_ISSUED";
      invoiceId: string;
      document?: DispatchDocument;
    }
  /**
   * A coach's own payroll moment. Every figure is read back from the
   * `CoachPayrollRecord` row — never asserted by the caller — and the body
   * template carries no bank/payment detail (CLAUDE.md payroll §28).
   */
  | { event: "PAYROLL_FINALIZED" | "PAYROLL_PAID"; payrollRecordId: string }
  /**
   * Admin approvals (docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md §2.7):
   * REQUESTED → every admin who may decide it (never the requester); DECIDED →
   * the requester. Everything shown is read back from the request row.
   */
  | { event: "APPROVAL_REQUESTED" | "APPROVAL_DECIDED"; approvalRequestId: string };

const EMPTY_SUMMARY: MessagingDispatchSummary = {
  ruleEnabled: false,
  recipients: 0,
  queuedWhatsApp: 0,
  queuedInApp: 0,
  queuedEmail: 0,
  missingPhone: 0,
  unverifiedEmail: 0,
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
    private readonly emailVerification: EmailVerificationService,
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
    if (!rule.enabled || (!rule.whatsappEnabled && !rule.inAppEnabled && !rule.emailEnabled)) {
      return { ...EMPTY_SUMMARY };
    }

    const recipients = await this.resolveRecipients(request, rule);
    // With verification off nobody is asked to confirm, so an unverified address proves nothing.
    const verifiedOnly = rule.emailEnabled && (await this.emailVerification.policy()) !== "OFF";
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

      const body = renderFormattedTemplate(rule.body, recipient.variables);

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

      if (rule.emailEnabled) {
        const unverified = verifiedOnly && !recipient.isEmailVerified;
        const queued = await this.queue({
          rule,
          recipient,
          channel: "EMAIL",
          body,
          title: renderMessageTemplate(rule.title, recipient.variables),
          scheduledFor,
          ...(unverified
            ? { status: "SKIPPED" as const, error: "Email address is not verified." }
            : {})
        });
        if (unverified) summary.unverifiedEmail += 1;
        else if (queued) summary.queuedEmail += 1;
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
      document: recipient.document,
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
    channel: "WHATSAPP" | "IN_APP" | "EMAIL";
    body: string;
    scheduledFor: Date;
    title?: string;
    phone?: string;
    status?: "PENDING" | "SKIPPED";
    error?: string;
    templateName?: string | null;
    templateLanguage?: string | null;
    templateParams?: string[];
    document?: DispatchDocument;
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
          documentMediaId: input.document?.mediaId ?? null,
          documentLink: input.document?.link ?? null,
          documentFilename: input.document?.filename ?? null,
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
    rule: MessagingRule
  ): Promise<Recipient[]> {
    switch (request.event) {
      case "CLASS_SCHEDULED":
      case "CLASS_CANCELLED":
      case "CLASS_SUBSTITUTE_ASSIGNED":
      case "CLASS_REMINDER":
      case "CLASS_REMINDER_COACH":
        return this.classRecipients(request.event, request.classId, rule.audience);
      case "ASSIGNMENT_ASSIGNED":
        return this.assignmentRecipients(request.assignmentBatchId);
      case "ASSIGNMENT_DUE_SOON":
        return this.dueSoonRecipients(request.studentAssignmentIds);
      case "ASSIGNMENT_GRADED":
        return this.gradedRecipients(request);
      case "ASSIGNMENT_OVERDUE_COACH":
        return this.overdueCoachRecipients(request.assignmentBatchId);
      case "REVISION_DUE":
        return this.revisionDueRecipients(request.studentIds, rule);
      case "ANNOUNCEMENT":
        return this.announcementRecipients(request.announcementId);
      case "ACCOUNT_WELCOME":
      case "ACCOUNT_APPROVED":
        return this.accountRecipients(request.event, request.userId, rule.audience);
      case "PAYMENT_RECEIVED":
      case "PAYMENT_FAILED":
      case "REFUND_PROCESSED":
      case "SUBSCRIPTION_RENEWAL_FAILED":
        return this.paymentRecipients(
          request.event,
          request.paymentId,
          request.dedupeSuffix
        );
      case "INVOICE_ISSUED":
        return this.invoiceRecipients(request.invoiceId, request.document);
      case "PAYROLL_FINALIZED":
      case "PAYROLL_PAID":
        return this.payrollRecipients(request.event, request.payrollRecordId);
      case "APPROVAL_REQUESTED":
      case "APPROVAL_DECIDED":
        return this.approvalRecipients(request.event, request.approvalRequestId);
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

  private async revisionDueRecipients(
    studentIds: string[],
    rule: MessagingRule
  ): Promise<Recipient[]> {
    const students = await this.prisma.user.findMany({
      where: { id: { in: studentIds }, status: UserStatus.ACTIVE, isDeleted: false }
    });
    const now = new Date();

    return students.flatMap((student) => {
      const sendAt = computeScheduledFor(rule, student.timezone, now);
      // Queued within an hour of sending, so a student who catches up first hears nothing.
      if (sendAt.getTime() - now.getTime() > HOUR_MS) return [];
      const { year, month, day } = zonedYmd(student.timezone, sendAt);
      return [
        this.toRecipient(student, {
          variables: {},
          linkPath: "/student/revision",
          linkVariable: "links.revision",
          dedupeKey: `REVISION_DUE:${student.id}:${year}-${month}-${day}`
        })
      ];
    });
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
   * The coach who deployed the assignment — or, when that account is gone or no
   * longer coaches the batch, the batch's current coaches. Nothing is sent once
   * every student has finished. The due date is in the key, so moving the
   * deadline later and missing it again notifies again; a re-run never does.
   */
  private async overdueCoachRecipients(assignmentBatchId: string): Promise<Recipient[]> {
    const deployment = await this.prisma.assignmentBatch.findUnique({
      where: { id: assignmentBatchId },
      include: {
        assignment: { select: { title: true } },
        assignedBy: true,
        batch: {
          select: {
            coaches: { include: { coach: true }, where: { isDeleted: false } },
            name: true
          }
        },
        students: { select: { status: true } }
      }
    });
    if (!deployment) return [];

    const outstanding = deployment.students.filter((s) => s.status !== "COMPLETED").length;
    if (outstanding === 0) return [];

    const active = (u: { status: UserStatus; isDeleted: boolean }) =>
      u.status === UserStatus.ACTIVE && !u.isDeleted;
    const batchCoaches = deployment.batch.coaches.map((c) => c.coach).filter(active);
    const deployer = deployment.assignedBy;
    const coaches =
      deployer && active(deployer) && batchCoaches.some((c) => c.id === deployer.id)
        ? [deployer]
        : batchCoaches;

    return coaches.map((coach) =>
      this.toRecipient(coach, {
        variables: {
          ...this.assignmentVariables(
            deployment.assignment.title,
            deployment.batch.name,
            deployment.dueDate,
            coach.timezone
          ),
          "assignment.overdueCount": String(outstanding),
          "assignment.studentCount": String(deployment.students.length)
        },
        linkPath: "/coach/assignments",
        linkVariable: "links.assignment",
        dedupeKey: `ASSIGNMENT_OVERDUE_COACH:${assignmentBatchId}:${deployment.dueDate.toISOString()}:${coach.id}`
      })
    );
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

  /**
   * The payer, with every figure read back from the payment row. `payment.
   * amount` is formatted from the stored minor units — the caller never gets to
   * assert what was charged.
   */
  private async paymentRecipients(
    event: MessagingEvent,
    paymentId: string,
    dedupeSuffix?: string
  ): Promise<Recipient[]> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        user: true,
        order: { include: { plan: true } },
        invoice: true
      }
    });
    if (!payment?.user || payment.user.isDeleted) return [];

    const refunded = event === "REFUND_PROCESSED";
    const amount = refunded ? payment.amountRefunded : payment.amount;

    return [
      this.toRecipient(payment.user, {
        variables: {
          "payment.amount": formatMoney(amount, payment.currency),
          "payment.currency": payment.currency,
          "payment.method": payment.paymentMethod
            ? PAYMENT_METHOD_LABELS[payment.paymentMethod]
            : "",
          "payment.status": PAYMENT_STATUS_LABELS[payment.status],
          "order.number": payment.order.orderNumber,
          "plan.name": payment.order.plan?.name ?? "",
          "invoice.number": payment.invoice?.number ?? ""
        },
        linkPath: "/student/billing",
        linkVariable: "links.billing",
        dedupeKey: `${event}:${paymentId}${dedupeSuffix ? `:${dedupeSuffix}` : ""}`
      })
    ];
  }

  /**
   * The invoice's recipient is whoever the invoice is BILLED to — for a student
   * account that is usually the parent, whose phone is on the invoice row and
   * not on the user. Falls back to the account's own number when the invoice
   * carries none.
   *
   * The dedupe key is the invoice id alone, so however many times generation is
   * retried the parent receives exactly one copy.
   */
  private async invoiceRecipients(
    invoiceId: string,
    document?: DispatchDocument
  ): Promise<Recipient[]> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { user: true, order: { include: { plan: true } } }
    });
    if (!invoice?.user || invoice.user.isDeleted) return [];

    const recipient = this.toRecipient(invoice.user, {
      variables: {
        "invoice.number": invoice.number,
        "invoice.total": formatMoney(invoice.total, invoice.currency),
        "invoice.currency": invoice.currency,
        "invoice.date": formatInZone(
          invoice.invoiceDate,
          invoice.user.timezone,
          "date"
        ),
        "order.number": invoice.order.orderNumber,
        "plan.name": invoice.order.plan?.name ?? ""
      },
      linkPath: `/student/billing/invoices/${invoice.id}`,
      linkVariable: "links.invoice",
      dedupeKey: `INVOICE_ISSUED:${invoice.id}`
    });

    return [
      {
        ...recipient,
        phoneNumber: invoice.billingPhone ?? recipient.phoneNumber,
        document
      }
    ];
  }

  private async payrollRecipients(
    event: "PAYROLL_FINALIZED" | "PAYROLL_PAID",
    payrollRecordId: string
  ): Promise<Recipient[]> {
    const record = await this.prisma.coachPayrollRecord.findUnique({
      where: { id: payrollRecordId },
      include: { coach: true, period: true }
    });
    if (!record?.coach || record.coach.isDeleted) return [];

    const periodLabel = `${formatInZone(record.period.startDate, "UTC", "date")} – ${formatInZone(record.period.endDate, "UTC", "date")}`;

    const recipient = this.toRecipient(record.coach, {
      variables: {
        "payroll.periodLabel": periodLabel,
        "payroll.netPayable": formatMoney(record.netPayableMinor, "INR")
      },
      linkPath: "/coach/earnings",
      linkVariable: "links.earnings",
      dedupeKey: `${event}:${record.id}`
    });

    return [recipient];
  }

  private async approvalRecipients(
    event: "APPROVAL_REQUESTED" | "APPROVAL_DECIDED",
    approvalRequestId: string
  ): Promise<Recipient[]> {
    const request = await this.prisma.approvalRequest.findUnique({
      where: { id: approvalRequestId },
      include: {
        class: { select: { startsAt: true, title: true, topic: true } },
        requester: true,
        subjectUser: { select: { firstName: true, lastName: true } }
      }
    });
    if (!request) return [];
    const meta = APPROVAL_ACTIONS[request.actionType as keyof typeof APPROVAL_ACTIONS];
    if (!meta) return [];

    const subjectFor = (timezone: string) =>
      [
        request.class
          ? `${request.class.title || request.class.topic || "Class"}, ${formatInZone(request.class.startsAt, timezone, "dateTime")}`
          : null,
        request.subjectUser ? this.fullName(request.subjectUser.firstName, request.subjectUser.lastName) : null
      ]
        .filter(Boolean)
        .join(" · ") || meta.label;
    const base = (timezone: string) => ({
      "approval.action": meta.label,
      "approval.reason": request.reason,
      "approval.requesterName": request.requester
        ? this.fullName(request.requester.firstName, request.requester.lastName)
        : "A former user",
      "approval.subject": subjectFor(timezone)
    });

    if (event === "APPROVAL_DECIDED") {
      const requester = request.requester;
      if (!requester || requester.isDeleted) return [];
      const decision =
        request.status === "APPROVED" ? "approved" : request.status === "REJECTED" ? "rejected" : "expired";
      const note = request.rejectionReason ? `Reason: ${request.rejectionReason}` : "";
      return [
        this.toRecipient(requester, {
          variables: { ...base(requester.timezone), "approval.decision": decision, "approval.note": note },
          linkPath: "/coach/requests",
          linkVariable: "links.approval",
          dedupeKey: `${event}:${request.id}`
        })
      ];
    }

    const admins = await this.prisma.user.findMany({
      where: {
        id: { not: request.requesterId ?? undefined },
        isDeleted: false,
        role: { in: meta.reviewerRoles.map((role) => role as UserRole) },
        status: UserStatus.ACTIVE
      }
    });
    return admins.map((admin) =>
      this.toRecipient(admin, {
        variables: { ...base(admin.timezone), "approval.decision": "", "approval.note": "" },
        linkPath: `/admin/requests?id=${request.id}`,
        linkVariable: "links.approval",
        dedupeKey: `${event}:${request.id}:${admin.id}`
      })
    );
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
      isEmailVerified: boolean;
      lastName: string | null;
      phoneNumber: string | null;
      role: UserRole;
      timezone: string;
    },
    options: {
      variables: MessageVariables;
      linkPath: string | null;
      linkVariable?:
        | "links.class"
        | "links.assignment"
        | "links.login"
        | "links.billing"
        | "links.invoice"
        | "links.earnings"
        | "links.revision"
        | "links.approval";
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
      isEmailVerified: user.isEmailVerified,
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

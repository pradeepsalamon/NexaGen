import { randomUUID } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config/api";
import type {
  ManualPaymentListResponse,
  ManualPaymentRecordItem,
  ManualPaymentReviewStatus,
  ManualPaymentStudentListResponse,
  PlanListResponse,
  RecordManualPaymentRequest
} from "@nexa-chess/types";
import {
  OrderStatus,
  PaymentMethodKind,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  UserRole,
  type User
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ManualPaymentAttachmentStorage } from "./manual-payment-attachment.storage";
import { OfflinePaymentMethodService } from "./offline-payment-method.service";
import { PaymentService } from "./payment.service";
import { assertAdmin, fullName, isAdminRole } from "./payments-auth.helper";
import { generateOrderNumber, isUniqueViolation, priceOrder, toPlanItem } from "./payments.util";

export type ManualAttachmentInput = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

const MANUAL_PAYMENT_INCLUDE = {
  payment: {
    include: {
      order: {
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
          plan: { include: { batch: { select: { id: true, name: true } } } }
        }
      }
    }
  },
  method: true,
  recordedByUser: { select: { firstName: true, lastName: true } },
  reviewedByUser: { select: { firstName: true, lastName: true } }
} satisfies Prisma.ManualPaymentRecordInclude;

type ManualPaymentRow = Prisma.ManualPaymentRecordGetPayload<{
  include: typeof MANUAL_PAYMENT_INCLUDE;
}>;

/**
 * Cash / personal UPI-GPay / bank transfer, tracked the same way a gateway
 * payment is. A manual payment is an ordinary Order + Payment (provider
 * MANUAL) — `approve`/an admin's own `record` call reach PAID through the
 * SAME {@link PaymentService.applyProviderState} funnel a real capture uses,
 * so the entitlement, invoice and PAYMENT_RECEIVED messaging are unchanged
 * code paths. This service only ever builds the rows and calls that funnel —
 * it never talks to a gateway or ProviderRegistry.
 */
@Injectable()
export class ManualPaymentService {
  private readonly env = getApiEnv();

  constructor(
    private readonly attachments: ManualPaymentAttachmentStorage,
    private readonly methods: OfflinePaymentMethodService,
    private readonly payments: PaymentService,
    private readonly prisma: PrismaService
  ) {}

  async record(
    actor: User,
    dto: RecordManualPaymentRequest,
    file?: ManualAttachmentInput
  ): Promise<ManualPaymentRecordItem> {
    const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
    if (!plan || !plan.isActive) {
      throw new NotFoundException("This plan is not available.");
    }

    const student = await this.prisma.user.findUnique({
      where: { id: dto.studentUserId }
    });
    if (!student || student.role !== UserRole.STUDENT) {
      throw new NotFoundException("Student not found.");
    }

    const admin = isAdminRole(actor.role);
    if (!admin) {
      await this.assertCoachCanRecordFor(actor.id, plan.batchId, dto.studentUserId);
    }

    const method = await this.methods.requireActive(dto.methodId);
    const pricing = priceOrder(plan.amount, plan.taxPercent);

    const idempotencyKey = dto.idempotencyKey
      ? `manual:${actor.id}:${dto.idempotencyKey}`
      : `manual:${randomUUID()}`;

    let created: { payment: { id: string }; record: { id: string } };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            orderNumber: generateOrderNumber(this.env.PAYMENTS_INVOICE_PREFIX),
            userId: student.id,
            planId: plan.id,
            status: OrderStatus.CREATED,
            subtotalAmount: plan.amount,
            discountAmount: 0,
            taxAmount: pricing.taxAmount,
            amount: pricing.total,
            currency: plan.currency,
            idempotencyKey,
            notes: { planCode: plan.code, manual: true, taxPercent: plan.taxPercent }
          }
        });

        const payment = await tx.payment.create({
          data: {
            orderId: order.id,
            userId: student.id,
            provider: PaymentProvider.MANUAL,
            amount: order.amount,
            currency: order.currency,
            paymentMethod: PaymentMethodKind.OTHER,
            methodDetail: method.label,
            status: PaymentStatus.CREATED
          }
        });

        await tx.paymentAttempt.create({
          data: {
            orderId: order.id,
            paymentId: payment.id,
            attemptNumber: 1,
            provider: PaymentProvider.MANUAL,
            status: PaymentStatus.CREATED
          }
        });

        const record = await tx.manualPaymentRecord.create({
          data: {
            paymentId: payment.id,
            methodId: method.id,
            reference: dto.reference ?? null,
            recordedByUserId: actor.id,
            recordedByRole: actor.role,
            status: admin ? "APPROVED" : "PENDING",
            reviewedByUserId: admin ? actor.id : null,
            reviewedAt: admin ? new Date() : null
          }
        });

        return { payment, record };
      });
    } catch (error) {
      if (dto.idempotencyKey && isUniqueViolation(error)) {
        return this.replayRecord(idempotencyKey, dto);
      }
      throw error;
    }
    const { payment, record } = created;

    if (file) {
      const uploaded = await this.attachments.upload(record.id, file);
      if (uploaded) {
        await this.prisma.manualPaymentRecord.update({
          where: { id: record.id },
          data: {
            attachmentKey: uploaded.key,
            attachmentFileName: uploaded.fileName,
            attachmentMimeType: uploaded.mimeType,
            attachmentSizeBytes: uploaded.sizeBytes
          }
        });
      }
    }

    if (admin) {
      await this.settle(payment.id, method.label, {
        methodId: method.id,
        reference: dto.reference,
        actorId: actor.id
      }, "manual:record");
    }

    return this.requireItem(record.id);
  }

  /** The record a repeated submit already created; a key reused for a different payment is a conflict. */
  private async replayRecord(
    idempotencyKey: string,
    dto: RecordManualPaymentRequest
  ): Promise<ManualPaymentRecordItem> {
    const existing = await this.prisma.manualPaymentRecord.findFirst({
      where: { payment: { order: { idempotencyKey } } },
      include: MANUAL_PAYMENT_INCLUDE
    });
    const order = existing?.payment.order;
    if (!existing || order?.userId !== dto.studentUserId || order.planId !== dto.planId) {
      throw new ConflictException("This request was already used for a different payment.");
    }
    return toItem(existing);
  }

  async approve(admin: User, recordId: string): Promise<ManualPaymentRecordItem> {
    assertAdmin(admin);
    const record = await this.requireRow(recordId);
    if (record.status !== "PENDING") {
      throw new ConflictException("This request has already been reviewed.");
    }

    await this.settle(
      record.paymentId,
      record.method.label,
      {
        methodId: record.methodId,
        reference: record.reference ?? undefined,
        actorId: record.recordedByUserId,
        approvedByUserId: admin.id
      },
      "manual:approve"
    );

    await this.prisma.manualPaymentRecord.update({
      where: { id: recordId },
      data: { status: "APPROVED", reviewedByUserId: admin.id, reviewedAt: new Date() }
    });

    return this.requireItem(recordId);
  }

  async reject(
    admin: User,
    recordId: string,
    reason: string
  ): Promise<ManualPaymentRecordItem> {
    assertAdmin(admin);
    const record = await this.requireRow(recordId);
    if (record.status !== "PENDING") {
      throw new ConflictException("This request has already been reviewed.");
    }

    await this.payments.applyProviderState(
      record.paymentId,
      {
        providerPaymentId: `manual_${record.paymentId}`,
        providerOrderId: null,
        status: PaymentStatus.FAILED,
        method: null,
        methodDetail: record.method.label,
        amount: null,
        amountRefunded: 0,
        currency: record.payment.currency,
        failureCode: "manual_rejected",
        failureMessage: reason,
        paidAt: null,
        raw: { manual: true, rejectedBy: admin.id, reason }
      },
      "manual:reject"
    );

    await this.prisma.manualPaymentRecord.update({
      where: { id: recordId },
      data: {
        status: "REJECTED",
        reviewedByUserId: admin.id,
        reviewedAt: new Date(),
        rejectionReason: reason
      }
    });

    return this.requireItem(recordId);
  }

  async listAll(status?: ManualPaymentReviewStatus): Promise<ManualPaymentListResponse> {
    const rows = await this.prisma.manualPaymentRecord.findMany({
      where: status ? { status } : {},
      include: MANUAL_PAYMENT_INCLUDE,
      orderBy: { createdAt: "desc" }
    });
    return { records: rows.map(toItem) };
  }

  async listMine(coachId: string): Promise<ManualPaymentListResponse> {
    const rows = await this.prisma.manualPaymentRecord.findMany({
      where: { recordedByUserId: coachId },
      include: MANUAL_PAYMENT_INCLUDE,
      orderBy: { createdAt: "desc" }
    });
    return { records: rows.map(toItem) };
  }

  /** The active plans of one batch — any batch for an admin, only their own for a coach. */
  async listBatchPlans(actor: User, batchId: string): Promise<PlanListResponse> {
    await this.assertActorCanSeeBatch(actor, batchId);

    const rows = await this.prisma.plan.findMany({
      where: { batchId, isActive: true },
      include: { batch: { select: { name: true } } },
      orderBy: [{ sortOrder: "asc" }, { amount: "asc" }]
    });
    return { plans: rows.map(toPlanItem) };
  }

  /** The enrolled students of one batch — any batch for an admin, only their own for a coach. */
  async listBatchStudents(
    actor: User,
    batchId: string
  ): Promise<ManualPaymentStudentListResponse> {
    await this.assertActorCanSeeBatch(actor, batchId);

    const rows = await this.prisma.batchStudent.findMany({
      where: { batchId, isDeleted: false },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, email: true } }
      },
      orderBy: { enrolledAt: "asc" }
    });

    return {
      students: rows
        .filter((row) => row.student)
        .map((row) => ({
          id: row.student.id,
          name: fullName(row.student) ?? row.student.email,
          email: row.student.email
        }))
    };
  }

  private async assertActorCanSeeBatch(actor: User, batchId: string): Promise<void> {
    const batch = await this.prisma.batch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException("Batch not found.");

    if (isAdminRole(actor.role)) return;

    const batchCoach = await this.prisma.batchCoach.findFirst({
      where: { batchId, coachId: actor.id, isDeleted: false }
    });
    if (!batchCoach) {
      throw new ForbiddenException("You are not assigned to this batch.");
    }
  }

  /** Authorizes; throws unless `id` is a record the caller may reach the attachment of. */
  async getAttachment(
    actor: User,
    recordId: string
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string } | null> {
    const record = await this.prisma.manualPaymentRecord.findUnique({
      where: { id: recordId }
    });
    if (!record) throw new NotFoundException("Manual payment record not found.");

    if (!isAdminRole(actor.role) && record.recordedByUserId !== actor.id) {
      throw new ForbiddenException("This record belongs to another coach.");
    }

    if (!record.attachmentKey || !record.attachmentMimeType) return null;

    const buffer = await this.attachments.download(
      record.attachmentKey,
      record.attachmentMimeType
    );
    if (!buffer) return null;

    return {
      buffer,
      fileName: record.attachmentFileName ?? "attachment",
      mimeType: record.attachmentMimeType
    };
  }

  private async settle(
    paymentId: string,
    methodLabel: string,
    context: {
      methodId: string;
      reference?: string;
      actorId: string;
      approvedByUserId?: string;
    },
    source: string
  ): Promise<void> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException("Payment not found.");

    await this.payments.applyProviderState(
      paymentId,
      {
        providerPaymentId: `manual_${paymentId}`,
        providerOrderId: null,
        status: PaymentStatus.PAID,
        method: null,
        methodDetail: methodLabel,
        amount: payment.amount,
        amountRefunded: 0,
        currency: payment.currency,
        failureCode: null,
        failureMessage: null,
        paidAt: new Date(),
        raw: {
          manual: true,
          methodId: context.methodId,
          reference: context.reference ?? null,
          recordedBy: context.actorId,
          approvedBy: context.approvedByUserId ?? null
        }
      },
      source
    );
  }

  private async assertCoachCanRecordFor(
    coachId: string,
    batchId: string | null,
    studentId: string
  ): Promise<void> {
    if (!batchId) {
      throw new ForbiddenException(
        "This plan is not attached to a batch — only an admin can record a manual payment for it."
      );
    }

    const batchCoach = await this.prisma.batchCoach.findFirst({
      where: { batchId, coachId, isDeleted: false }
    });
    if (!batchCoach) {
      throw new ForbiddenException("You are not assigned to this batch.");
    }

    const batchStudent = await this.prisma.batchStudent.findFirst({
      where: { batchId, studentId, isDeleted: false }
    });
    if (!batchStudent) {
      throw new ForbiddenException("This student is not enrolled in your batch.");
    }
  }

  private async requireRow(recordId: string): Promise<ManualPaymentRow> {
    const row = await this.prisma.manualPaymentRecord.findUnique({
      where: { id: recordId },
      include: MANUAL_PAYMENT_INCLUDE
    });
    if (!row) throw new NotFoundException("Manual payment record not found.");
    return row;
  }

  private async requireItem(recordId: string): Promise<ManualPaymentRecordItem> {
    return toItem(await this.requireRow(recordId));
  }
}

function toItem(row: ManualPaymentRow): ManualPaymentRecordItem {
  const order = row.payment.order;
  return {
    id: row.id,
    paymentId: row.paymentId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    studentUserId: order.userId,
    studentName: fullName(order.user),
    planId: order.planId ?? "",
    planName: order.plan?.name ?? "",
    batchId: order.plan?.batchId ?? null,
    batchName: order.plan?.batch?.name ?? null,
    amount: row.payment.amount,
    currency: row.payment.currency,
    methodId: row.methodId,
    methodLabel: row.method.label,
    reference: row.reference,
    recordedByUserId: row.recordedByUserId,
    recordedByName: fullName(row.recordedByUser),
    recordedByRole: row.recordedByRole,
    status: row.status,
    reviewedByName: fullName(row.reviewedByUser),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
    hasAttachment: row.attachmentKey !== null,
    attachmentFileName: row.attachmentFileName,
    createdAt: row.createdAt.toISOString()
  };
}

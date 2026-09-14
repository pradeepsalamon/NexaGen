import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { softDeleteExtension } from "./soft-delete.extension";

const createPrismaClient = () => new PrismaClient().$extends(softDeleteExtension);

export type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

/**
 * The client handed to a `$transaction` callback. It is the *extended* client,
 * so `Prisma.TransactionClient` does not describe it — a service that takes a
 * `tx` parameter must use this type or the call site will not compile.
 */
export type PrismaTransactionClient = Omit<
  ExtendedPrismaClient,
  "$connect" | "$disconnect" | "$extends" | "$on" | "$transaction"
>;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly client = createPrismaClient();
  readonly withDeleted = this.client.$extends({
    name: "with-deleted",
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const queryArgs = { ...(args as object) } as Record<string, unknown>;
          delete queryArgs.includeDeleted;

          return (query as (queryArgs: unknown) => unknown)(queryArgs);
        }
      }
    }
  });

  get user() {
    return this.client.user;
  }

  get studentProfile() {
    return this.client.studentProfile;
  }

  get coachProfile() {
    return this.client.coachProfile;
  }

  get authSession() {
    return this.client.authSession;
  }

  get passwordResetToken() {
    return this.client.passwordResetToken;
  }

  get emailVerificationToken() {
    return this.client.emailVerificationToken;
  }

  get batch() {
    return this.client.batch;
  }

  get batchCoach() {
    return this.client.batchCoach;
  }

  get batchStudent() {
    return this.client.batchStudent;
  }

  get trashAuditLog() {
    return this.client.trashAuditLog;
  }

  get coachClass() {
    return this.client.coachClass;
  }

  get liveSession() {
    return this.client.liveSession;
  }

  get liveClassWaitingParticipant() {
    return this.client.liveClassWaitingParticipant;
  }

  get course() {
    return this.client.course;
  }

  get courseModule() {
    return this.client.courseModule;
  }

  get studentCourseProgress() {
    return this.client.studentCourseProgress;
  }

  get studentModuleProgress() {
    return this.client.studentModuleProgress;
  }

  get practice() {
    return this.client.practice;
  }

  get studentPractice() {
    return this.client.studentPractice;
  }

  get assignment() {
    return this.client.assignment;
  }

  get assignmentBatch() {
    return this.client.assignmentBatch;
  }

  get studentAssignment() {
    return this.client.studentAssignment;
  }

  get studentAssignmentAttempt() {
    return this.client.studentAssignmentAttempt;
  }

  get studentActivity() {
    return this.client.studentActivity;
  }

  get announcement() {
    return this.client.announcement;
  }

  get classAttendance() {
    return this.client.classAttendance;
  }

  get coachAttendance() {
    return this.client.coachAttendance;
  }

  get coachAttendanceLog() {
    return this.client.coachAttendanceLog;
  }

  get liveChatMessage() {
    return this.client.liveChatMessage;
  }

  get attendanceLog() {
    return this.client.attendanceLog;
  }

  get attendancePolicy() {
    return this.client.attendancePolicy;
  }

  get processedWebhookEvent() {
    return this.client.processedWebhookEvent;
  }

  get liveClassPolicy() {
    return this.client.liveClassPolicy;
  }

  get liveClassPreset() {
    return this.client.liveClassPreset;
  }

  get recordingWatchProgress() {
    return this.client.recordingWatchProgress;
  }

  get notification() {
    return this.client.notification;
  }

  get batchClassSchedule() {
    return this.client.batchClassSchedule;
  }

  get batchClassScheduleRule() {
    return this.client.batchClassScheduleRule;
  }

  get batchScheduleException() {
    return this.client.batchScheduleException;
  }

  get analyticsEvent() {
    return this.client.analyticsEvent;
  }

  get storageSnapshot() {
    return this.client.storageSnapshot;
  }

  get puzzleTopic() {
    return this.client.puzzleTopic;
  }

  get puzzle() {
    return this.client.puzzle;
  }

  get puzzleAttempt() {
    return this.client.puzzleAttempt;
  }

  get liveClassPuzzleAssignment() {
    return this.client.liveClassPuzzleAssignment;
  }

  get messagingRule() {
    return this.client.messagingRule;
  }

  get messageDelivery() {
    return this.client.messageDelivery;
  }

  get plan() {
    return this.client.plan;
  }

  get order() {
    return this.client.order;
  }

  get payment() {
    return this.client.payment;
  }

  get paymentAttempt() {
    return this.client.paymentAttempt;
  }

  get paymentWebhookEvent() {
    return this.client.paymentWebhookEvent;
  }

  get refund() {
    return this.client.refund;
  }

  get subscription() {
    return this.client.subscription;
  }

  get invoice() {
    return this.client.invoice;
  }

  get invoiceSequence() {
    return this.client.invoiceSequence;
  }

  get creditNote() {
    return this.client.creditNote;
  }

  get creditNoteSequence() {
    return this.client.creditNoteSequence;
  }

  get invoiceSettings() {
    return this.client.invoiceSettings;
  }

  get invoiceAuditLog() {
    return this.client.invoiceAuditLog;
  }

  get billingProfile() {
    return this.client.billingProfile;
  }

  get entitlement() {
    return this.client.entitlement;
  }

  get paymentProviderEvent() {
    return this.client.paymentProviderEvent;
  }

  get paymentSetting() {
    return this.client.paymentSetting;
  }

  get discount() {
    return this.client.discount;
  }

  get discountRedemption() {
    return this.client.discountRedemption;
  }

  async $connect() {
    return this.client.$connect();
  }

  async $disconnect() {
    return this.client.$disconnect();
  }

  $transaction: typeof this.client.$transaction = this.client.$transaction.bind(
    this.client
  );

  $queryRaw: typeof this.client.$queryRaw = this.client.$queryRaw.bind(this.client);

  $queryRawUnsafe: typeof this.client.$queryRawUnsafe =
    this.client.$queryRawUnsafe.bind(this.client);

  $executeRaw: typeof this.client.$executeRaw = this.client.$executeRaw.bind(
    this.client
  );

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

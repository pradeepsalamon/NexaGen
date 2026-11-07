import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { applySoftDeleteArgs } from "./soft-delete.extension";
import { applyTenantScope, tenantScopeExtension } from "./tenant-scope.extension";

/**
 * The main client's query pipeline: tenant scope (docs/SAAS_MULTI_TENANCY.md §E),
 * then the soft-delete filter, as one extension: every stacked `$extends` layer
 * adds to tsc's memory, which is already near the limit on a cold typecheck.
 */
const dataLayerExtension = Prisma.defineExtension({
  name: "data-layer",
  query: {
    $allModels: {
      async $allOperations({ args, model, operation, query }) {
        const scoped = applyTenantScope(model, operation, args) as typeof args;
        return query(applySoftDeleteArgs(model, operation, scoped));
      }
    }
  }
});

const createPrismaClient = (base: PrismaClient) => base.$extends(dataLayerExtension);

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
  private readonly base = new PrismaClient();
  private readonly client = createPrismaClient(this.base);
  // Same connection pool, without the soft-delete filter but still
  // tenant-scoped. Layering another extension on `client` cannot undo the
  // soft-delete filter, which runs after it.
  readonly withDeleted = this.base.$extends(tenantScopeExtension);

  get tenantDomain() {
    return this.client.tenantDomain;
  }

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

  get userMfa() {
    return this.client.userMfa;
  }

  get passwordResetToken() {
    return this.client.passwordResetToken;
  }

  get emailVerificationToken() {
    return this.client.emailVerificationToken;
  }

  get emailSettings() {
    return this.client.emailSettings;
  }

  get tenantBranding() {
    return this.client.tenantBranding;
  }

  get tenantPaymentCredential() {
    return this.client.tenantPaymentCredential;
  }

  get tenantUsage() {
    return this.client.tenantUsage;
  }

  get tenantIntegrityRun() {
    return this.client.tenantIntegrityRun;
  }

  get platformCheckout() {
    return this.client.platformCheckout;
  }

  get platformInvoice() {
    return this.client.platformInvoice;
  }

  get platformInvoiceCounter() {
    return this.client.platformInvoiceCounter;
  }

  get platformSellerSettings() {
    return this.client.platformSellerSettings;
  }

  get platformWebhookEvent() {
    return this.client.platformWebhookEvent;
  }

  get whatsAppSettings() {
    return this.client.whatsAppSettings;
  }

  get directEmail() {
    return this.client.directEmail;
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

  get liveClassPull() {
    return this.client.liveClassPull;
  }

  get demoClassRegistration() {
    return this.client.demoClassRegistration;
  }

  get demoSchedule() {
    return this.client.demoSchedule;
  }

  get liveClassScreenShareRequest() {
    return this.client.liveClassScreenShareRequest;
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

  get assignmentPuzzle() {
    return this.client.assignmentPuzzle;
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

  get accountDeletionRequest() {
    return this.client.accountDeletionRequest;
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

  get lichessPuzzle() {
    return this.client.lichessPuzzle;
  }

  get lichessCatalogueRelease() {
    return this.client.lichessCatalogueRelease;
  }

  get chessGame() {
    return this.client.chessGame;
  }

  get externalChessAccount() {
    return this.client.externalChessAccount;
  }

  get gameSourceSettings() {
    return this.client.gameSourceSettings;
  }

  get gameAnalysis() {
    return this.client.gameAnalysis;
  }

  get gameAnalysisSide() {
    return this.client.gameAnalysisSide;
  }

  get conversation() {
    return this.client.conversation;
  }

  get conversationMember() {
    return this.client.conversationMember;
  }

  get chatMessage() {
    return this.client.chatMessage;
  }

  get knowledgeCategory() {
    return this.client.knowledgeCategory;
  }

  get knowledgeArticle() {
    return this.client.knowledgeArticle;
  }

  get knowledgeArticleBatch() {
    return this.client.knowledgeArticleBatch;
  }

  get knowledgeArticleVersion() {
    return this.client.knowledgeArticleVersion;
  }

  get knowledgeArticleEvent() {
    return this.client.knowledgeArticleEvent;
  }

  get knowledgeFeedback() {
    return this.client.knowledgeFeedback;
  }

  get knowledgeSearchLog() {
    return this.client.knowledgeSearchLog;
  }

  get liveClassPuzzleAssignment() {
    return this.client.liveClassPuzzleAssignment;
  }

  get liveClassLeaderboardAdjustment() {
    return this.client.liveClassLeaderboardAdjustment;
  }

  get liveClassSimul() {
    return this.client.liveClassSimul;
  }

  get liveClassSimulGame() {
    return this.client.liveClassSimulGame;
  }

  get liveClassMatchRound() {
    return this.client.liveClassMatchRound;
  }

  get liveClassMatchGame() {
    return this.client.liveClassMatchGame;
  }

  get liveClassMatchChallenge() {
    return this.client.liveClassMatchChallenge;
  }

  get liveClassMovePoll() {
    return this.client.liveClassMovePoll;
  }

  get liveClassMovePollAnswer() {
    return this.client.liveClassMovePollAnswer;
  }

  get liveClassPuzzleRush() {
    return this.client.liveClassPuzzleRush;
  }

  get liveClassPuzzleRushEntry() {
    return this.client.liveClassPuzzleRushEntry;
  }

  get liveClassToolState() {
    return this.client.liveClassToolState;
  }

  get liveClassChapter() {
    return this.client.liveClassChapter;
  }

  get liveClassActivityQueue() {
    return this.client.liveClassActivityQueue;
  }

  get liveClassActivityQueueItem() {
    return this.client.liveClassActivityQueueItem;
  }

  get libraryActivity() {
    return this.client.libraryActivity;
  }

  get liveClassActivityRun() {
    return this.client.liveClassActivityRun;
  }

  get liveClassMcqAttempt() {
    return this.client.liveClassMcqAttempt;
  }

  get liveClassPlayoutGame() {
    return this.client.liveClassPlayoutGame;
  }

  get puzzleScoringSettings() {
    return this.client.puzzleScoringSettings;
  }

  get messagingRule() {
    return this.client.messagingRule;
  }

  get messageDelivery() {
    return this.client.messageDelivery;
  }

  get systemMessageTemplate() {
    return this.client.systemMessageTemplate;
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

  get offlinePaymentMethod() {
    return this.client.offlinePaymentMethod;
  }

  get manualPaymentRecord() {
    return this.client.manualPaymentRecord;
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

  get coachCompensationProfile() {
    return this.client.coachCompensationProfile;
  }

  get coachCompensationRate() {
    return this.client.coachCompensationRate;
  }

  get payrollRule() {
    return this.client.payrollRule;
  }

  get payrollPeriod() {
    return this.client.payrollPeriod;
  }

  get coachPayrollRecord() {
    return this.client.coachPayrollRecord;
  }

  get payrollAdjustment() {
    return this.client.payrollAdjustment;
  }

  get coachPayout() {
    return this.client.coachPayout;
  }

  get payslip() {
    return this.client.payslip;
  }

  get payslipSequence() {
    return this.client.payslipSequence;
  }

  get chessAppearanceSettings() {
    return this.client.chessAppearanceSettings;
  }

  get userChessAppearancePreference() {
    return this.client.userChessAppearancePreference;
  }

  get typographySettings() {
    return this.client.typographySettings;
  }

  get userTypographyPreference() {
    return this.client.userTypographyPreference;
  }

  get visitorSession() {
    return this.client.visitorSession;
  }

  get feedbackAnswer() {
    return this.client.feedbackAnswer;
  }

  get feedbackForm() {
    return this.client.feedbackForm;
  }

  get approvalRequest() {
    return this.client.approvalRequest;
  }

  get approvalEvent() {
    return this.client.approvalEvent;
  }

  get classChangeRequest() {
    return this.client.classChangeRequest;
  }

  get studentProgress() {
    return this.client.studentProgress;
  }

  get puzzleRatingChange() {
    return this.client.puzzleRatingChange;
  }

  get retentionPolicy() {
    return this.client.retentionPolicy;
  }

  get revisionItem() {
    return this.client.revisionItem;
  }

  get revisionReview() {
    return this.client.revisionReview;
  }

  get jobLock() {
    return this.client.jobLock;
  }

  get feedbackResponse() {
    return this.client.feedbackResponse;
  }

  get referral() {
    return this.client.referral;
  }

  get referralCode() {
    return this.client.referralCode;
  }

  get referralCreditEntry() {
    return this.client.referralCreditEntry;
  }

  get referralRedemption() {
    return this.client.referralRedemption;
  }

  get referralRewardRule() {
    return this.client.referralRewardRule;
  }

  get referralReward() {
    return this.client.referralReward;
  }

  get referralPointsConversion() {
    return this.client.referralPointsConversion;
  }

  get referralPointsTransfer() {
    return this.client.referralPointsTransfer;
  }

  get referralSettings() {
    return this.client.referralSettings;
  }

  get referralStage() {
    return this.client.referralStage;
  }

  get referralStageEvent() {
    return this.client.referralStageEvent;
  }

  get referralStageReach() {
    return this.client.referralStageReach;
  }

  get referralVisit() {
    return this.client.referralVisit;
  }

  get referralWithdrawal() {
    return this.client.referralWithdrawal;
  }

  get referralVoucher() {
    return this.client.referralVoucher;
  }

  get lead() {
    return this.client.lead;
  }

  get leadActivity() {
    return this.client.leadActivity;
  }

  get leadNote() {
    return this.client.leadNote;
  }

  get tenant() {
    return this.client.tenant;
  }

  get platformPlan() {
    return this.client.platformPlan;
  }

  get tenantSubscription() {
    return this.client.tenantSubscription;
  }

  get tenantSubscriptionEvent() {
    return this.client.tenantSubscriptionEvent;
  }

  get platformStaff() {
    return this.client.platformStaff;
  }

  get platformAuditLog() {
    return this.client.platformAuditLog;
  }

  get platformPlanVersion() {
    return this.client.platformPlanVersion;
  }

  get platformPayment() {
    return this.client.platformPayment;
  }

  get platformSupportSession() {
    return this.client.platformSupportSession;
  }

  get contentPack() {
    return this.client.contentPack;
  }

  get contentPackItem() {
    return this.client.contentPackItem;
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

  $executeRawUnsafe: typeof this.client.$executeRawUnsafe =
    this.client.$executeRawUnsafe.bind(this.client);

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

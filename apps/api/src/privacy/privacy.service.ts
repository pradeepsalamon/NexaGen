import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  PERSONAL_DATA_EXPORT_FORMAT,
  type PersonalDataExport,
  type PersonalDataRecord
} from "@nexa-chess/types";
import { authenticateUser } from "../auth/authenticate";
import { PrismaService } from "../prisma/prisma.service";

// Dates become ISO strings so the export is plain JSON (§3.4: UTC, never pre-formatted).
function toPlain(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toPlain);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, toPlain(inner)]));
  }
  return value;
}

const records = (rows: object[]) => rows.map((row) => toPlain(row) as PersonalDataRecord);

@Injectable()
export class PrivacyService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async exportMyData(accessToken: string | undefined): Promise<PersonalDataExport> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    const id = user.id;
    const p = this.prisma;

    const account = await p.user.findUniqueOrThrow({
      select: {
        acquisitionSource: true,
        avatarUrl: true,
        createdAt: true,
        email: true,
        emailVerifiedAt: true,
        firstName: true,
        id: true,
        lastLoginAt: true,
        lastName: true,
        phoneNumber: true,
        role: true,
        status: true,
        timezone: true,
        updatedAt: true,
        username: true
      },
      where: { id }
    });

    const [
      studentProfile,
      coachProfile,
      billingProfile,
      batchesAsStudent,
      batchesAsCoach,
      classAttendance,
      classesTaught,
      coachAttendance,
      puzzleAttempts,
      puzzleRatingChanges,
      progress,
      assignments,
      courseProgress,
      moduleProgress,
      practice,
      activity,
      feedbackGiven,
      movePollAnswers,
      chatMessages,
      notifications,
      orders,
      payments,
      invoices,
      subscriptions,
      entitlements,
      sessions,
      usageEvents,
      chessAppearance,
      typography,
      classChangeRequests
    ] = await Promise.all([
      // Soft-deleted rows are still personal data held about the user, so they are exported too.
      p.withDeleted.studentProfile.findMany({ where: { userId: id } }),
      p.withDeleted.coachProfile.findMany({ where: { userId: id } }),
      p.billingProfile.findMany({ where: { userId: id } }),
      p.withDeleted.batchStudent.findMany({
        select: {
          batch: { select: { id: true, name: true } },
          deletedAt: true,
          enrolledAt: true,
          isDeleted: true
        },
        where: { studentId: id }
      }),
      p.withDeleted.batchCoach.findMany({
        select: {
          assignedAt: true,
          batch: { select: { id: true, name: true } },
          deletedAt: true,
          isDeleted: true
        },
        where: { coachId: id }
      }),
      p.classAttendance.findMany({ where: { studentId: id } }),
      p.coachClass.findMany({
        select: {
          batchId: true,
          cancelledAt: true,
          description: true,
          endsAt: true,
          homework: true,
          id: true,
          isDemo: true,
          notes: true,
          objectives: true,
          startsAt: true,
          title: true,
          topic: true
        },
        where: { coachId: id }
      }),
      p.coachAttendance.findMany({ where: { coachId: id } }),
      p.puzzleAttempt.findMany({ where: { studentId: id } }),
      p.puzzleRatingChange.findMany({ where: { studentId: id } }),
      p.studentProgress.findMany({ where: { studentId: id } }),
      p.studentAssignment.findMany({ where: { studentId: id } }),
      p.studentCourseProgress.findMany({ where: { studentId: id } }),
      p.studentModuleProgress.findMany({ where: { studentId: id } }),
      p.studentPractice.findMany({ where: { studentId: id } }),
      p.studentActivity.findMany({ where: { studentId: id } }),
      p.feedbackResponse.findMany({ include: { answers: true }, where: { studentId: id } }),
      p.liveClassMovePollAnswer.findMany({ where: { studentId: id } }),
      p.liveChatMessage.findMany({
        select: { createdAt: true, id: true, liveSessionId: true, message: true, recipientId: true },
        where: { senderId: id }
      }),
      p.notification.findMany({ where: { userId: id } }),
      p.order.findMany({ omit: { idempotencyKey: true }, where: { userId: id } }),
      p.payment.findMany({ omit: { metadata: true }, where: { userId: id } }),
      p.invoice.findMany({
        omit: { pdfAttempts: true, pdfError: true, pdfStorageKey: true, pdfUrl: true, seller: true },
        where: { userId: id }
      }),
      p.subscription.findMany({ omit: { metadata: true }, where: { userId: id } }),
      p.entitlement.findMany({ where: { userId: id } }),
      p.authSession.findMany({ omit: { refreshTokenHash: true }, where: { userId: id } }),
      p.analyticsEvent.findMany({ where: { userId: id } }),
      p.userChessAppearancePreference.findMany({ where: { userId: id } }),
      p.userTypographyPreference.findMany({ where: { userId: id } }),
      p.classChangeRequest.findMany({ where: { coachId: id } })
    ]);

    return {
      account: toPlain(account) as PersonalDataRecord,
      exportedAt: new Date().toISOString(),
      format: PERSONAL_DATA_EXPORT_FORMAT,
      sections: {
        activity: records(activity),
        assignments: records(assignments),
        batchesAsCoach: records(batchesAsCoach),
        batchesAsStudent: records(batchesAsStudent),
        billingProfile: records(billingProfile),
        chatMessages: records(chatMessages),
        chessAppearance: records(chessAppearance),
        classAttendance: records(classAttendance),
        classChangeRequests: records(classChangeRequests),
        classesTaught: records(classesTaught),
        coachAttendance: records(coachAttendance),
        coachProfile: records(coachProfile),
        courseProgress: records(courseProgress),
        entitlements: records(entitlements),
        feedbackGiven: records(feedbackGiven),
        invoices: records(invoices),
        moduleProgress: records(moduleProgress),
        movePollAnswers: records(movePollAnswers),
        notifications: records(notifications),
        orders: records(orders),
        payments: records(payments),
        practice: records(practice),
        progress: records(progress),
        puzzleAttempts: records(puzzleAttempts),
        puzzleRatingChanges: records(puzzleRatingChanges),
        sessions: records(sessions),
        studentProfile: records(studentProfile),
        subscriptions: records(subscriptions),
        typography: records(typography),
        usageEvents: records(usageEvents)
      }
    };
  }
}

import { MessageChannel, MessageDeliveryStatus, MessagingEvent, Prisma, UserRole, UserStatus } from "@prisma/client";
import type { PrismaService, PrismaTransactionClient } from "../prisma/prisma.service";

/** An active student account: who counts when telling whether a number is shared. */
export const ACTIVE_STUDENT_ACCOUNT: Prisma.UserWhereInput = {
  isDeleted: false,
  role: UserRole.STUDENT,
  status: UserStatus.ACTIVE
};

/** A student whose Puzzle of the Day is on: a batch with training and the daily puzzle on. */
export const DAILY_PUZZLE_STUDENT: Prisma.UserWhereInput = {
  ...ACTIVE_STUDENT_ACCOUNT,
  studentBatches: {
    some: { batch: { dailyPuzzleEnabled: true, isDeleted: false, puzzleTrainingEnabled: true }, isDeleted: false }
  }
};

/** One WhatsApp number Puzzle of the Day goes to today. */
export interface DailyPuzzleNumber {
  /** Normalized, the way a send normalizes it. */
  phone: string;
  /**
   * The one student whose account phone this is (their picture, answers and
   * streak); null = the number is on 2+ student accounts, so it gets the link
   * only (we can't tell who answered).
   */
  studentId: string | null;
  /** The students (switch on) it is sent for; the first is the delivery row's recipient. */
  studentIds: string[];
}

export interface DailyPuzzleAudience {
  numbers: DailyPuzzleNumber[];
  /** Students it reaches (switch on, usable phone). */
  students: number;
  /** Students who switched it off. */
  turnedOff: number;
  /** Students with no, or no usable, phone (skipped quietly: no row per student per day). */
  noPhone: number;
}

type Normalize = (raw: string | null | undefined) => string | null;

/**
 * Who gets Puzzle of the Day on WhatsApp (docs/PUZZLE_OF_THE_DAY.md step 2,
 * owner's final calls 2026-11-21): every active student whose Puzzle of the Day
 * is on, on their account phone (`User.phoneNumber`), unless they switched it
 * off in the app (`StudentProfile.dailyPuzzleWhatsAppOffAt`). Never a bare
 * WhatsApp contact, never the typed-in parent phone. A number shared by 2+
 * active student accounts (any of them, on or off) is sent once, link only.
 * STOP is checked by the outbox worker at send time.
 *
 * Call inside the academy (the tenant extension scopes every query).
 */
export async function loadDailyPuzzleAudience(
  prisma: PrismaService | PrismaTransactionClient,
  normalize: Normalize
): Promise<DailyPuzzleAudience> {
  const [students, accountPhones] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, phoneNumber: true, studentProfile: { select: { dailyPuzzleWhatsAppOffAt: true } } },
      where: DAILY_PUZZLE_STUDENT
    }),
    prisma.user.findMany({
      select: { phoneNumber: true },
      where: { ...ACTIVE_STUDENT_ACCOUNT, phoneNumber: { not: null } }
    })
  ]);

  const accountsPerNumber = new Map<string, number>();
  for (const account of accountPhones) {
    const phone = normalize(account.phoneNumber);
    if (phone) accountsPerNumber.set(phone, (accountsPerNumber.get(phone) ?? 0) + 1);
  }

  let turnedOff = 0;
  let noPhone = 0;
  const byNumber = new Map<string, string[]>();
  for (const student of students) {
    if (student.studentProfile?.dailyPuzzleWhatsAppOffAt) {
      turnedOff += 1;
      continue;
    }
    const phone = normalize(student.phoneNumber);
    if (!phone) {
      noPhone += 1;
      continue;
    }
    byNumber.set(phone, [...(byNumber.get(phone) ?? []), student.id]);
  }

  const numbers = [...byNumber.entries()].map(([phone, studentIds]): DailyPuzzleNumber => ({
    phone,
    studentId: (accountsPerNumber.get(phone) ?? 1) > 1 ? null : studentIds[0],
    studentIds
  }));
  const reached = numbers.reduce((sum, n) => sum + n.studentIds.length, 0);
  return { noPhone, numbers, students: reached, turnedOff };
}

/** The dedupe key of a number's Puzzle of the Day message on one academy day (YYYY-MM-DD). */
export function dailyPuzzleDedupeKey(phone: string, day: string): string {
  return `DAILY_PUZZLE:${phone}:${day}`;
}

/**
 * Drops the Puzzle of the Day WhatsApp message still queued for a number whose
 * student just switched it off (docs/PUZZLE_OF_THE_DAY.md step 2), so switching
 * off shortly before the send time still counts. A row a worker has already
 * claimed goes out.
 */
export function cancelQueuedDailyPuzzle(
  client: PrismaService | PrismaTransactionClient,
  recipientPhone: string
): Promise<Prisma.BatchPayload> {
  return client.messageDelivery.updateMany({
    data: { error: "Turned off before it was sent.", status: MessageDeliveryStatus.SKIPPED },
    where: {
      channel: MessageChannel.WHATSAPP,
      claimedAt: null,
      event: MessagingEvent.DAILY_PUZZLE,
      recipientPhone,
      status: MessageDeliveryStatus.PENDING
    }
  });
}

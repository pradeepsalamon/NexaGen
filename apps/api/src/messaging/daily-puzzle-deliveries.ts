import { MessageChannel, MessageDeliveryStatus, MessagingEvent, type Prisma } from "@prisma/client";
import type { PrismaService, PrismaTransactionClient } from "../prisma/prisma.service";

/**
 * Drops the Puzzle of the Day WhatsApp messages still queued for a student or
 * a number that just turned it off (docs/PUZZLE_OF_THE_DAY.md step 2), so a
 * "PUZZLE OFF" shortly before the send time still counts. A row a worker has
 * already claimed goes out. Shared by the student's switch and the support bot.
 */
export function cancelQueuedDailyPuzzle(
  client: PrismaService | PrismaTransactionClient,
  who: { recipientId: string } | { recipientPhone: string }
): Promise<Prisma.BatchPayload> {
  return client.messageDelivery.updateMany({
    data: { error: "Turned off before it was sent.", status: MessageDeliveryStatus.SKIPPED },
    where: {
      ...who,
      channel: MessageChannel.WHATSAPP,
      claimedAt: null,
      event: MessagingEvent.DAILY_PUZZLE,
      status: MessageDeliveryStatus.PENDING
    }
  });
}

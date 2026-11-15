import type { SupportConversationStatus, SupportOwnerChangeReason } from "@prisma/client";
import type { PrismaTransactionClient } from "../prisma/prisma.service";

export type SupportOwnerChange = {
  actorId?: string | null;
  conversationId: string;
  from: SupportConversationStatus;
  reason: SupportOwnerChangeReason;
  ticketId?: string | null;
  to: SupportConversationStatus;
};

/** Why one bot step moved the conversation; null when it stayed with the same owner. */
export function botOwnerChangeReason(from: SupportConversationStatus, to: SupportConversationStatus): SupportOwnerChangeReason | null {
  if (from === to) return null;
  if (to === "WAITING_AGENT" || to === "AGENT") return "HANDOFF";
  if (to === "BOT") return "CUSTOMER_MENU";
  return null;
}

/**
 * Records a change of hands (docs/WHATSAPP_SUPPORT_MODES_PLAN.md §5.2), in the
 * transaction that makes it, under the contact's lock. No row when nothing changed.
 */
export async function recordOwnerChange(tx: PrismaTransactionClient, change: SupportOwnerChange): Promise<void> {
  if (change.from === change.to) return;
  await tx.supportConversationEvent.create({
    data: {
      actorId: change.actorId ?? null,
      conversationId: change.conversationId,
      fromStatus: change.from,
      reason: change.reason,
      ticketId: change.ticketId ?? null,
      toStatus: change.to
    }
  });
}

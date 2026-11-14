import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { WhatsAppService } from "./whatsapp.service";

/**
 * "STOP" on WhatsApp (docs/WHATSAPP_SUPPORT.md §9 "Consent"): a number that
 * opted out gets no proactive WhatsApp from this academy (messaging rules,
 * system messages). Checked right before each send, so it also stops what is
 * already queued. Support replies to a customer's own message are not proactive
 * and don't ask.
 */
@Injectable()
export class WhatsAppOptOutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService
  ) {}

  async isOptedOut(rawPhone: string | null | undefined): Promise<boolean> {
    const waId = this.whatsapp.normalizeRecipient(rawPhone);
    if (!waId) return false;
    const contact = await this.prisma.whatsAppContact.findFirst({
      select: { id: true },
      where: { optedOutAt: { not: null }, waId }
    });
    return contact !== null;
  }
}

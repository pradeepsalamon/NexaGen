import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { LeadModule } from "../lead/lead.module";
import { MailModule } from "../mail/mail.module";
import { PrismaModule } from "../prisma/prisma.module";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
import { SupportAdminController } from "./support-admin.controller";
import { SupportAdminService } from "./support-admin.service";
import { SupportConversationService } from "./support-conversation.service";
import { SupportFollowUpService } from "./support-follow-up.service";
import { SupportOutboxService } from "./support-outbox.service";
import { SupportSavedRepliesService } from "./support-saved-replies.service";
import { SupportSettingsService } from "./support-settings.service";
import { SupportTicketsService } from "./support-tickets.service";
import { SupportUnansweredService } from "./support-unanswered.service";
import { WhatsAppWebhookController } from "./whatsapp-webhook.controller";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";

/** WhatsApp support bot and staff inbox (docs/WHATSAPP_SUPPORT.md). */
@Module({
  controllers: [SupportAdminController, WhatsAppWebhookController],
  imports: [JwtModule.register({}), LeadModule, MailModule, PrismaModule, WhatsAppModule],
  providers: [
    SupportAdminService,
    SupportConversationService,
    SupportFollowUpService,
    SupportOutboxService,
    SupportSavedRepliesService,
    SupportSettingsService,
    SupportTicketsService,
    SupportUnansweredService,
    WhatsAppWebhookService
  ]
})
export class SupportModule {}

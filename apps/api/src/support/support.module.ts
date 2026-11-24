import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { DemoClassModule } from "../demo-class/demo-class.module";
import { LeadModule } from "../lead/lead.module";
import { MailModule } from "../mail/mail.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PuzzleModule } from "../puzzle/puzzle.module";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
import { SupportAdminController } from "./support-admin.controller";
import { SupportAccountService } from "./support-account.service";
import { SupportAdminService } from "./support-admin.service";
import { SupportAnalyticsService } from "./support-analytics.service";
import { SupportAttachmentsService } from "./support-attachments.service";
import { SupportConversationService } from "./support-conversation.service";
import { SupportDemoRemindersService } from "./support-demo-reminders.service";
import { SupportDemoSlotsService } from "./support-demo-slots.service";
import { SupportFollowUpService } from "./support-follow-up.service";
import { SupportLeadCaptureService } from "./support-lead-capture.service";
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
  imports: [DemoClassModule, JwtModule.register({}), LeadModule, MailModule, PrismaModule, PuzzleModule, WhatsAppModule],
  providers: [
    SupportAccountService,
    SupportAdminService,
    SupportAnalyticsService,
    SupportAttachmentsService,
    SupportConversationService,
    SupportDemoRemindersService,
    SupportDemoSlotsService,
    SupportFollowUpService,
    SupportLeadCaptureService,
    SupportOutboxService,
    SupportSavedRepliesService,
    SupportSettingsService,
    SupportTicketsService,
    SupportUnansweredService,
    WhatsAppWebhookService
  ]
})
export class SupportModule {}

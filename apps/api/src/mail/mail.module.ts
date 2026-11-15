import { Module } from "@nestjs/common";
import { NotificationModule } from "../notification/notification.module";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
import { MailService } from "./mail.service";
import { SystemMessageRenderer } from "./system-message-renderer.service";
import { SystemNotifier } from "./system-notifier.service";

@Module({
  imports: [NotificationModule, WhatsAppModule],
  providers: [MailService, SystemMessageRenderer, SystemNotifier],
  exports: [MailService, SystemMessageRenderer, SystemNotifier]
})
export class MailModule {}

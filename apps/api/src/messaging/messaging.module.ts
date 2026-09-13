import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { NotificationModule } from "../notification/notification.module";
import { PrismaModule } from "../prisma/prisma.module";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
import { MessagingDeliveryWorker } from "./messaging-delivery.worker";
import { MessagingDispatchService } from "./messaging-dispatch.service";
import { MessagingRuleService } from "./messaging-rule.service";
import { MessagingController } from "./messaging.controller";
import { MessagingScheduler } from "./messaging.scheduler";

/**
 * Feature modules import this for {@link MessagingDispatchService} — the one
 * entry point that turns a domain event into messages, per the admin's rules.
 */
@Module({
  controllers: [MessagingController],
  imports: [JwtModule, NotificationModule, PrismaModule, WhatsAppModule],
  providers: [
    MessagingDeliveryWorker,
    MessagingDispatchService,
    MessagingRuleService,
    MessagingScheduler
  ],
  exports: [MessagingDispatchService, MessagingRuleService]
})
export class MessagingModule {}

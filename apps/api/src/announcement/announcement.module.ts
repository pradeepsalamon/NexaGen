import { Module } from "@nestjs/common";
import { MessagingModule } from "../messaging/messaging.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AnnouncementController } from "./announcement.controller";
import { AnnouncementService } from "./announcement.service";
import { TrashModule } from "../trash/trash.module";

@Module({
  controllers: [AnnouncementController],
  imports: [MessagingModule, PrismaModule, TrashModule],
  providers: [AnnouncementService],
  exports: [AnnouncementService]
})
export class AnnouncementModule {}

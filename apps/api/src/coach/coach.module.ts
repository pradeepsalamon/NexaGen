import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { CoachController } from "./coach.controller";
import { CoachService } from "./coach.service";
import { LiveClassModule } from "../live-class/live-class.module";
import { MessagingModule } from "../messaging/messaging.module";

@Module({
  controllers: [CoachController],
  imports: [JwtModule, PrismaModule, LiveClassModule, MessagingModule],
  providers: [CoachService]
})
export class CoachModule {}

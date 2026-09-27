import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MessagingModule } from "../messaging/messaging.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ClassRequestController } from "./class-request.controller";
import { ClassRequestService } from "./class-request.service";

@Module({
  imports: [JwtModule.register({}), MessagingModule, PrismaModule],
  controllers: [ClassRequestController],
  providers: [ClassRequestService]
})
export class ClassRequestModule {}

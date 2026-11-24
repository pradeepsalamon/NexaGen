import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MessagingModule } from "../messaging/messaging.module";
import { PrismaModule } from "../prisma/prisma.module";
import { TrashModule } from "../trash/trash.module";
import { BatchController } from "./batch.controller";
import { BatchService } from "./batch.service";

@Module({
  imports: [JwtModule.register({}), MessagingModule, PrismaModule, TrashModule],
  controllers: [BatchController],
  providers: [BatchService]
})
export class BatchModule {}

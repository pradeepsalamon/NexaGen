import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { FeedbackController } from "./feedback.controller";
import { FeedbackService } from "./feedback.service";
import { TrashModule } from "../trash/trash.module";

@Module({
  imports: [JwtModule.register({}), PrismaModule, TrashModule],
  controllers: [FeedbackController],
  providers: [FeedbackService]
})
export class FeedbackModule {}

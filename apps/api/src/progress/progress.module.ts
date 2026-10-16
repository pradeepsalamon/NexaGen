import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { ActivityHistoryService } from "./activity-history.service";
import { ProgressRecorderService } from "./progress-recorder.service";
import { ProgressController } from "./progress.controller";
import { ProgressService } from "./progress.service";

@Module({
  imports: [JwtModule.register({}), PrismaModule],
  controllers: [ProgressController],
  providers: [ActivityHistoryService, ProgressService, ProgressRecorderService],
  exports: [ProgressRecorderService]
})
export class ProgressModule {}

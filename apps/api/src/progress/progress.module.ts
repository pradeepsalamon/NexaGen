import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { ProgressRecorderService } from "./progress-recorder.service";
import { ProgressController } from "./progress.controller";
import { ProgressService } from "./progress.service";

@Module({
  imports: [JwtModule.register({}), PrismaModule],
  controllers: [ProgressController],
  providers: [ProgressService, ProgressRecorderService],
  exports: [ProgressRecorderService]
})
export class ProgressModule {}

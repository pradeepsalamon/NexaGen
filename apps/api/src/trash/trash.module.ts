import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "../prisma/prisma.module";
import { UploadModule } from "../upload/upload.module";
import { TrashController } from "./trash.controller";
import { TrashRepository } from "./trash.repository";
import { TrashScheduler } from "./trash.scheduler";
import { TrashService } from "./trash.service";

@Module({
  imports: [JwtModule.register({}), PrismaModule, ScheduleModule.forRoot(), UploadModule],
  controllers: [TrashController],
  providers: [TrashRepository, TrashScheduler, TrashService],
  exports: [TrashRepository, TrashService]
})
export class TrashModule {}

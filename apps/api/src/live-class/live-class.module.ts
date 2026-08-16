import { Module, forwardRef } from "@nestjs/common";
import { LiveClassController } from "./live-class.controller";
import { LiveClassService } from "./live-class.service";
import { LiveKitService } from "./livekit.service";
import { PrismaModule } from "../prisma/prisma.module";
import { JwtModule } from "@nestjs/jwt";
import { AttendanceModule } from "../attendance/attendance.module";
import { BackupModule } from "../backup/backup.module";

@Module({
  imports: [
    PrismaModule, 
    JwtModule.register({}),
    forwardRef(() => AttendanceModule),
    BackupModule
  ],
  controllers: [LiveClassController],
  providers: [LiveClassService, LiveKitService],
  exports: [LiveClassService, LiveKitService]
})
export class LiveClassModule {}

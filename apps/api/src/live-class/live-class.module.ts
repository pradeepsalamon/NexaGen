import { Module, forwardRef } from "@nestjs/common";
import { LiveClassController } from "./live-class.controller";
import { LiveClassService } from "./live-class.service";
import { LiveClassSettingsController } from "./live-class-settings.controller";
import { LiveClassSettingsService } from "./live-class-settings.service";
import { LiveClassPresetController } from "./live-class-preset.controller";
import { LiveClassPresetService } from "./live-class-preset.service";
import { LiveKitService } from "./livekit.service";
import { RecordingStorageService } from "./recording-storage.service";
import { PrismaModule } from "../prisma/prisma.module";
import { JwtModule } from "@nestjs/jwt";
import { AttendanceModule } from "../attendance/attendance.module";
import { BackupModule } from "../backup/backup.module";
import { AnalyticsEventModule } from "../analytics/analytics-event.module";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
import { MailModule } from "../mail/mail.module";

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({}),
    forwardRef(() => AttendanceModule),
    BackupModule,
    AnalyticsEventModule,
    WhatsAppModule,
    MailModule
  ],
  controllers: [LiveClassController, LiveClassSettingsController, LiveClassPresetController],
  providers: [
    LiveClassService,
    LiveClassSettingsService,
    LiveClassPresetService,
    LiveKitService,
    RecordingStorageService
  ],
  exports: [LiveClassService, LiveClassSettingsService, LiveKitService, RecordingStorageService]
})
export class LiveClassModule {}

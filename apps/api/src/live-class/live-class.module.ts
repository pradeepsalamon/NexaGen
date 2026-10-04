import { Module, forwardRef } from "@nestjs/common";
import { LiveClassController } from "./live-class.controller";
import { LiveClassService } from "./live-class.service";
import { LiveClassAccessService } from "./live-class-access.service";
import { LiveClassBoardStateService } from "./live-class-board-state.service";
import { LiveClassChatService } from "./live-class-chat.service";
import { LiveClassDemoService } from "./live-class-demo.service";
import { LiveClassModerationService } from "./live-class-moderation.service";
import { LiveClassPullService } from "./live-class-pull.service";
import { LiveClassRecordingService } from "./live-class-recording.service";
import { LiveClassScreenShareService } from "./live-class-screen-share.service";
import { LiveClassWaitingRoomService } from "./live-class-waiting-room.service";
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
    LiveClassAccessService,
    LiveClassBoardStateService,
    LiveClassChatService,
    LiveClassDemoService,
    LiveClassModerationService,
    LiveClassPullService,
    LiveClassRecordingService,
    LiveClassScreenShareService,
    LiveClassWaitingRoomService,
    LiveClassSettingsService,
    LiveClassPresetService,
    LiveKitService,
    RecordingStorageService
  ],
  exports: [
    LiveClassService,
    LiveClassRecordingService,
    LiveClassScreenShareService,
    LiveClassSettingsService,
    LiveKitService,
    RecordingStorageService
  ]
})
export class LiveClassModule {}

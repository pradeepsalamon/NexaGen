import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { WhatsAppCredentialsService } from "./whatsapp-credentials.service";
import { WhatsAppOptOutService } from "./whatsapp-opt-out.service";
import { WhatsAppSettingsController, WhatsAppSettingsService } from "./whatsapp-settings.controller";
import { WhatsAppService } from "./whatsapp.service";

@Module({
  controllers: [WhatsAppSettingsController],
  imports: [JwtModule.register({})],
  providers: [WhatsAppCredentialsService, WhatsAppOptOutService, WhatsAppService, WhatsAppSettingsService],
  exports: [WhatsAppCredentialsService, WhatsAppOptOutService, WhatsAppService]
})
export class WhatsAppModule {}

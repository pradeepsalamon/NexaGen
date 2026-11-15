import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { WhatsAppCredentialsService } from "./whatsapp-credentials.service";
import { WhatsAppOptOutService } from "./whatsapp-opt-out.service";
import { WhatsAppSettingsController, WhatsAppSettingsService } from "./whatsapp-settings.controller";
import { WhatsAppTemplatesController, WhatsAppTemplatesService } from "./whatsapp-templates.controller";
import { WhatsAppService } from "./whatsapp.service";

@Module({
  controllers: [WhatsAppSettingsController, WhatsAppTemplatesController],
  imports: [JwtModule.register({})],
  providers: [WhatsAppCredentialsService, WhatsAppOptOutService, WhatsAppService, WhatsAppSettingsService, WhatsAppTemplatesService],
  exports: [WhatsAppCredentialsService, WhatsAppOptOutService, WhatsAppService]
})
export class WhatsAppModule {}

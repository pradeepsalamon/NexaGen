import { Module } from "@nestjs/common";
import { MailService } from "./mail.service";
import { SystemMessageRenderer } from "./system-message-renderer.service";

@Module({
  providers: [MailService, SystemMessageRenderer],
  exports: [MailService, SystemMessageRenderer]
})
export class MailModule {}

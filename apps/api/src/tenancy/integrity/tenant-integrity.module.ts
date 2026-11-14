import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MailModule } from "../../mail/mail.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { TenantIntegrityController } from "./tenant-integrity.controller";
import { TenantIntegrityService } from "./tenant-integrity.service";

/** Nightly tenant integrity monitoring (docs/SAAS_MULTI_TENANCY.md "Tenant integrity monitoring"). */
@Module({
  controllers: [TenantIntegrityController],
  imports: [JwtModule.register({}), MailModule, PrismaModule],
  providers: [TenantIntegrityService]
})
export class TenantIntegrityModule {}

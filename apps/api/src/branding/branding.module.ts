import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { UploadModule } from "../upload/upload.module";
import { BrandingController, PublicBrandingController } from "./branding.controller";
import { BrandingService } from "./branding.service";
import { LegalPagesController, PublicLegalPagesController } from "./legal-pages.controller";
import { LegalPagesService } from "./legal-pages.service";

/** An academy's look (docs/SAAS_MULTI_TENANCY.md §F). Global: mail reads its sender name. */
@Global()
@Module({
  controllers: [BrandingController, LegalPagesController, PublicBrandingController, PublicLegalPagesController],
  exports: [BrandingService, LegalPagesService],
  imports: [JwtModule.register({}), PrismaModule, UploadModule],
  providers: [BrandingService, LegalPagesService]
})
export class BrandingModule {}

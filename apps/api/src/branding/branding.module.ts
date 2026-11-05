import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { UploadModule } from "../upload/upload.module";
import { BrandingController, PublicBrandingController } from "./branding.controller";
import { BrandingService } from "./branding.service";

/** An academy's look (docs/SAAS_MULTI_TENANCY.md §F). Global: mail reads its sender name. */
@Global()
@Module({
  controllers: [BrandingController, PublicBrandingController],
  exports: [BrandingService],
  imports: [JwtModule.register({}), PrismaModule, UploadModule],
  providers: [BrandingService]
})
export class BrandingModule {}

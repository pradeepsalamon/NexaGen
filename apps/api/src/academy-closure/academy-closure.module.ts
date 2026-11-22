import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MailModule } from "../mail/mail.module";
import { PrismaModule } from "../prisma/prisma.module";
import { TenancyModule } from "../tenancy/tenancy.module";
import { UploadModule } from "../upload/upload.module";
import { AcademyClosureController } from "./academy-closure.controller";
import { AcademyClosureService } from "./academy-closure.service";
import { AcademyExportService } from "./academy-export.service";
import { AcademyPurgeService } from "./academy-purge.service";

/** Closing an academy, its export and the purge of its data (docs/ACADEMY_CLOSURE.md). */
@Module({
  controllers: [AcademyClosureController],
  imports: [JwtModule.register({}), MailModule, PrismaModule, TenancyModule, UploadModule],
  providers: [AcademyClosureService, AcademyExportService, AcademyPurgeService],
  exports: [AcademyPurgeService]
})
export class AcademyClosureModule {}

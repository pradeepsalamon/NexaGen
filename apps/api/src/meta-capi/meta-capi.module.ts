import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { MetaCapiService } from "./meta-capi.service";

/** Meta Conversions API outbox for lead events (docs/AD_MEASUREMENT.md). */
@Module({
  imports: [PrismaModule],
  providers: [MetaCapiService],
  exports: [MetaCapiService]
})
export class MetaCapiModule {}

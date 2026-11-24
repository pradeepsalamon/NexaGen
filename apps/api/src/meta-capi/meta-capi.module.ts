import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { MetaAdsInsightsService } from "./meta-ads-insights.service";
import { MetaCapiService } from "./meta-capi.service";

/** Meta Conversions API outbox for lead events, and read-only ad spend (docs/AD_MEASUREMENT.md). */
@Module({
  imports: [PrismaModule],
  providers: [MetaAdsInsightsService, MetaCapiService],
  exports: [MetaAdsInsightsService, MetaCapiService]
})
export class MetaCapiModule {}

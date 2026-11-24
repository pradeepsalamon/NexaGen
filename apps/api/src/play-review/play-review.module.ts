import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { OUTSIDE_AI_PROVIDER, OpenAiCompatibleProvider, outsideAiConfigFromEnv } from "../ai/outside/outside-ai";
import { PrismaModule } from "../prisma/prisma.module";
import { StockfishModule } from "../stockfish/stockfish.module";
import { AiReviewConsentService } from "./ai-review-consent.service";
import { PlayItemLoader } from "./play-item.loader";
import { PlayReviewController, PlayReviewSettingsController } from "./play-review.controller";
import { PlayReviewJob } from "./play-review.job";
import { PlayReviewService } from "./play-review.service";

/** AI play review: the play feed, the nightly engine review, the outside-AI switch (docs/AI_PLAY_REVIEW.md). */
@Module({
  controllers: [PlayReviewController, PlayReviewSettingsController],
  imports: [JwtModule.register({}), PrismaModule, StockfishModule],
  providers: [
    AiReviewConsentService,
    PlayItemLoader,
    PlayReviewJob,
    PlayReviewService,
    { provide: OUTSIDE_AI_PROVIDER, useFactory: () => new OpenAiCompatibleProvider(outsideAiConfigFromEnv()) }
  ]
})
export class PlayReviewModule {}

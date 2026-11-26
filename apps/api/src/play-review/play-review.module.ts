import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { OUTSIDE_AI_PROVIDER, OpenAiCompatibleProvider } from "../ai/outside/outside-ai";
import { AiProvidersModule } from "../ai/providers/ai-providers.module";
import { AiProvidersService } from "../ai/providers/ai-providers.service";
import { AssignmentModule } from "../assignment/assignment.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PuzzleModule } from "../puzzle/puzzle.module";
import { StockfishModule } from "../stockfish/stockfish.module";
import { AiReviewConsentService } from "./ai-review-consent.service";
import { PlayItemLoader } from "./play-item.loader";
import { PlayReviewController, PlayReviewSettingsController } from "./play-review.controller";
import { PlayReviewJob } from "./play-review.job";
import { PlayReviewService } from "./play-review.service";
import { WeakSpotsService } from "./weak-spots.service";

/** AI play review: the play feed, the nightly engine review, the outside-AI switch (docs/AI_PLAY_REVIEW.md). */
@Module({
  controllers: [PlayReviewController, PlayReviewSettingsController],
  imports: [AiProvidersModule, AssignmentModule, JwtModule.register({}), PrismaModule, PuzzleModule, StockfishModule],
  providers: [
    AiReviewConsentService,
    PlayItemLoader,
    PlayReviewJob,
    PlayReviewService,
    WeakSpotsService,
    {
      inject: [AiProvidersService],
      provide: OUTSIDE_AI_PROVIDER,
      useFactory: (providers: AiProvidersService) => new OpenAiCompatibleProvider(() => providers.routeConfigs("PLAY_REVIEW_COMMENT"))
    }
  ]
})
export class PlayReviewModule {}

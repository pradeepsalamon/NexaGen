import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import { PrismaModule } from "../prisma/prisma.module";
import { AdminAiController } from "./admin-ai.controller";
import { AdminAiService } from "./admin-ai.service";
import { AiRuntimeClient } from "./ai-runtime.client";
import { AI_RUNTIME_CONFIG, aiRuntimeConfigFromEnv } from "./ai-runtime.config";
import { AiRuntimeTokenSigner } from "./ai-runtime.token";

// AI foundation (docs/ai/architecture/PHASE1_SPEC.md). Inert unless
// AI_ENABLED=true; the runtime is never part of /health/*.
@Module({
  controllers: [AdminAiController],
  imports: [JwtModule, PrismaModule],
  providers: [
    AdminAiService,
    AiRuntimeClient,
    AiRuntimeTokenSigner,
    { provide: AI_RUNTIME_CONFIG, useFactory: () => aiRuntimeConfigFromEnv(getApiEnv()) }
  ]
})
export class AiModule {}

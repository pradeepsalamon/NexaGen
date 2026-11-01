import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import { KnowledgeModule } from "../knowledge/knowledge.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AdminAiController } from "./admin-ai.controller";
import { AdminAiService } from "./admin-ai.service";
import { AiRuntimeClient } from "./ai-runtime.client";
import { AI_RUNTIME_CONFIG, aiRuntimeConfigFromEnv } from "./ai-runtime.config";
import { AiRuntimeTokenSigner } from "./ai-runtime.token";
import { AdminAiToolsController } from "./tools/admin-ai-tools.controller";
import { AdminAiToolsService } from "./tools/admin-ai-tools.service";
import { AssistantToolRegistry } from "./tools/assistant-tool.registry";

// AI foundation (docs/ai/architecture/PHASE1_SPEC.md). Inert unless
// AI_ENABLED=true; the runtime is never part of /health/*.
@Module({
  controllers: [AdminAiController, AdminAiToolsController],
  imports: [JwtModule, KnowledgeModule, PrismaModule],
  providers: [
    AdminAiService,
    AdminAiToolsService,
    AssistantToolRegistry,
    AiRuntimeClient,
    AiRuntimeTokenSigner,
    { provide: AI_RUNTIME_CONFIG, useFactory: () => aiRuntimeConfigFromEnv(getApiEnv()) }
  ]
})
export class AiModule {}

import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { localModelConfigFromEnv, OpenAiCompatibleRecapModels, RECAP_MODELS } from "../ai/chat-model";
import { AiProvidersModule } from "../ai/providers/ai-providers.module";
import { AiProvidersService } from "../ai/providers/ai-providers.service";
import { PrismaModule } from "../prisma/prisma.module";
import { ClassRecapController } from "./class-recap.controller";
import { ClassRecapJob } from "./class-recap.job";
import { ClassRecapService } from "./class-recap.service";

/** AI class recaps from the coach's transcript (docs/CLASS_RECAPS.md). */
@Module({
  controllers: [ClassRecapController],
  imports: [AiProvidersModule, JwtModule.register({}), PrismaModule],
  providers: [
    ClassRecapJob,
    ClassRecapService,
    {
      provide: RECAP_MODELS,
      inject: [AiProvidersService],
      useFactory: (providers: AiProvidersService) =>
        new OpenAiCompatibleRecapModels(localModelConfigFromEnv(), () => providers.routeConfigs("CLASS_RECAP"))
    }
  ]
})
export class ClassRecapModule {}

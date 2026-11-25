import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import {
  localModelConfigFromEnv,
  OpenAiCompatibleRecapModels,
  outsideRecapModelConfigFromEnv,
  RECAP_MODELS
} from "../ai/chat-model";
import { PrismaModule } from "../prisma/prisma.module";
import { ClassRecapController } from "./class-recap.controller";
import { ClassRecapJob } from "./class-recap.job";
import { ClassRecapService } from "./class-recap.service";

/** AI class recaps from the coach's transcript (docs/CLASS_RECAPS.md). */
@Module({
  controllers: [ClassRecapController],
  imports: [JwtModule.register({}), PrismaModule],
  providers: [
    ClassRecapJob,
    ClassRecapService,
    {
      provide: RECAP_MODELS,
      useFactory: () => new OpenAiCompatibleRecapModels(localModelConfigFromEnv(), outsideRecapModelConfigFromEnv())
    }
  ]
})
export class ClassRecapModule {}

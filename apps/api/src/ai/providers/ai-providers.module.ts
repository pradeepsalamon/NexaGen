import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../../prisma/prisma.module";
import { AiIntegrationsController } from "./ai-integrations.controller";
import { AiIntegrationsService } from "./ai-integrations.service";
import { AiProvidersService } from "./ai-providers.service";

/**
 * Outside AI providers connected by the platform and the model per feature
 * (docs/AI_PROVIDERS.md). Features import this module and take their route
 * from `AiProvidersService`; only it holds the keys.
 */
@Module({
  controllers: [AiIntegrationsController],
  exports: [AiProvidersService],
  imports: [JwtModule.register({}), PrismaModule],
  providers: [AiIntegrationsService, AiProvidersService]
})
export class AiProvidersModule {}

import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from "@nestjs/common";
import {
  API_ROUTES,
  testAiModelRequestSchema,
  updateAiFeatureRequestSchema,
  updateAiProviderRequestSchema,
  type TestAiModelRequest,
  type UpdateAiFeatureRequest,
  type UpdateAiProviderRequest
} from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../../auth/types";
import { queryString } from "../../common/query-params";
import { ZodBodyPipe } from "../../common/zod-body.pipe";
import { AiIntegrationsService } from "./ai-integrations.service";

/** Platform console, AI tab: outside AI keys and the model per feature (docs/AI_PROVIDERS.md). */
@Controller()
export class AiIntegrationsController {
  constructor(private readonly integrations: AiIntegrationsService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.platform.ai)
  view(@Req() request: Request) {
    return this.integrations.view(this.getAccessToken(request));
  }

  @Put(API_ROUTES.platform.aiProvider())
  updateProvider(
    @Req() request: Request,
    @Param("provider") provider: string,
    @Body(new ZodBodyPipe(updateAiProviderRequestSchema)) body: UpdateAiProviderRequest
  ) {
    return this.integrations.updateProvider(this.getAccessToken(request), provider, body);
  }

  @Delete(API_ROUTES.platform.aiProvider())
  removeProvider(@Req() request: Request, @Param("provider") provider: string) {
    return this.integrations.removeProvider(this.getAccessToken(request), provider);
  }

  @Get(API_ROUTES.platform.aiProviderModels())
  models(@Req() request: Request, @Param("provider") provider: string, @Query("fresh") fresh: unknown) {
    return this.integrations.models(this.getAccessToken(request), provider, queryString(fresh, "fresh") === "1");
  }

  @Put(API_ROUTES.platform.aiFeature())
  updateFeature(
    @Req() request: Request,
    @Param("feature") feature: string,
    @Body(new ZodBodyPipe(updateAiFeatureRequestSchema)) body: UpdateAiFeatureRequest
  ) {
    return this.integrations.updateFeature(this.getAccessToken(request), feature, body);
  }

  @Post(API_ROUTES.platform.aiTest)
  test(@Req() request: Request, @Body(new ZodBodyPipe(testAiModelRequestSchema)) body: TestAiModelRequest) {
    return this.integrations.test(this.getAccessToken(request), body);
  }
}

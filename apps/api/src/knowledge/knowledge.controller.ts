import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import {
  API_ROUTES,
  knowledgeFeedbackSchema,
  knowledgeHelpQuerySchema,
  knowledgeContentSchema,
  suggestKnowledgeSchema,
  type KnowledgeContentInput,
  type KnowledgeFeedbackRequest,
  type KnowledgeHelpQuery,
} from "@nexa-chess/types";
import type { Request } from "express";
import type { z } from "zod";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { KnowledgeService } from "./knowledge.service";

type SuggestBody = z.infer<typeof suggestKnowledgeSchema>;

@Controller()
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.knowledge.help)
  help(@Req() request: Request, @Query(new ZodBodyPipe(knowledgeHelpQuerySchema)) query: KnowledgeHelpQuery) {
    return this.knowledge.help(this.getAccessToken(request), query);
  }

  @Get(API_ROUTES.knowledge.helpArticle())
  article(@Req() request: Request, @Param("slug") slug: string) {
    return this.knowledge.article(this.getAccessToken(request), slug);
  }

  @Put(API_ROUTES.knowledge.feedback())
  feedback(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(knowledgeFeedbackSchema)) body: KnowledgeFeedbackRequest,
  ) {
    return this.knowledge.feedback(this.getAccessToken(request), id, body.helpful);
  }

  @Get(API_ROUTES.knowledge.suggestions)
  mySuggestions(@Req() request: Request) {
    return this.knowledge.mySuggestions(this.getAccessToken(request));
  }

  @Post(API_ROUTES.knowledge.suggestions)
  suggest(@Req() request: Request, @Body(new ZodBodyPipe(suggestKnowledgeSchema)) body: SuggestBody) {
    return this.knowledge.suggest(this.getAccessToken(request), body.articleId, body.content);
  }

  @Patch(API_ROUTES.knowledge.suggestion())
  updateSuggestion(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(knowledgeContentSchema)) body: KnowledgeContentInput,
  ) {
    return this.knowledge.updateSuggestion(this.getAccessToken(request), id, body);
  }

  @Delete(API_ROUTES.knowledge.suggestion())
  @HttpCode(200)
  withdrawSuggestion(@Req() request: Request, @Param("id") id: string) {
    return this.knowledge.withdrawSuggestion(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.knowledge.trends)
  trends(@Req() request: Request) {
    return this.knowledge.coachTrends(this.getAccessToken(request));
  }
}

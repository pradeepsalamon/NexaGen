import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  API_ROUTES,
  createKnowledgeArticleSchema,
  knowledgeAdminListQuerySchema,
  knowledgeCategorySchema,
  knowledgeContentSchema,
  knowledgeImportSchema,
  knowledgePreviewQuerySchema,
  knowledgeSettingsSchema,
  publishKnowledgeSchema,
  rejectKnowledgeSchema,
  resolveKnowledgeQuerySchema,
  rollbackKnowledgeSchema,
  updateKnowledgeCategorySchema,
  type KnowledgeAdminListQuery,
  type KnowledgeContentInput,
  type KnowledgePreviewQuery,
  type KnowledgeSettingsInput,
} from "@nexa-chess/types";
import type { Request } from "express";
import { z } from "zod";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe, parseOrBadRequest } from "../common/zod-body.pipe";
import { KnowledgeAdminService } from "./knowledge-admin.service";
import { KnowledgeService } from "./knowledge.service";

const diffQuerySchema = z.object({ from: z.string().min(1).max(64), to: z.string().min(1).max(64) });

@Controller()
export class KnowledgeAdminController {
  constructor(
    private readonly admin: KnowledgeAdminService,
    private readonly knowledge: KnowledgeService,
  ) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.adminKnowledge.articles)
  list(@Req() request: Request, @Query(new ZodBodyPipe(knowledgeAdminListQuerySchema)) query: KnowledgeAdminListQuery) {
    return this.admin.list(this.getAccessToken(request), query);
  }

  @Post(API_ROUTES.adminKnowledge.articles)
  create(@Req() request: Request, @Body(new ZodBodyPipe(createKnowledgeArticleSchema)) body: z.infer<typeof createKnowledgeArticleSchema>) {
    return this.admin.create(this.getAccessToken(request), body.content, body.settings);
  }

  @Get(API_ROUTES.adminKnowledge.article())
  detail(@Req() request: Request, @Param("id") id: string) {
    return this.admin.detail(this.getAccessToken(request), id);
  }

  @Delete(API_ROUTES.adminKnowledge.article())
  @HttpCode(200)
  remove(@Req() request: Request, @Param("id") id: string) {
    return this.admin.remove(this.getAccessToken(request), id);
  }

  @Put(API_ROUTES.adminKnowledge.draft())
  saveDraft(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(knowledgeContentSchema)) body: KnowledgeContentInput,
  ) {
    return this.admin.saveDraft(this.getAccessToken(request), id, body);
  }

  @Delete(API_ROUTES.adminKnowledge.draft())
  @HttpCode(200)
  discardDraft(@Req() request: Request, @Param("id") id: string) {
    return this.admin.discardDraft(this.getAccessToken(request), id);
  }

  @Patch(API_ROUTES.adminKnowledge.settings())
  updateSettings(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(knowledgeSettingsSchema)) body: KnowledgeSettingsInput,
  ) {
    return this.admin.updateSettings(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.adminKnowledge.publish())
  @HttpCode(200)
  publish(@Req() request: Request, @Param("id") id: string, @Body(new ZodBodyPipe(publishKnowledgeSchema)) body: z.infer<typeof publishKnowledgeSchema>) {
    return this.admin.publish(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.adminKnowledge.unpublish())
  @HttpCode(200)
  unpublish(@Req() request: Request, @Param("id") id: string) {
    return this.admin.unpublish(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.adminKnowledge.archive())
  @HttpCode(200)
  archive(@Req() request: Request, @Param("id") id: string) {
    return this.admin.archive(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.adminKnowledge.restore())
  @HttpCode(200)
  restore(@Req() request: Request, @Param("id") id: string) {
    return this.admin.restore(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.adminKnowledge.rollback())
  @HttpCode(200)
  rollback(@Req() request: Request, @Param("id") id: string, @Body(new ZodBodyPipe(rollbackKnowledgeSchema)) body: z.infer<typeof rollbackKnowledgeSchema>) {
    return this.admin.rollback(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.adminKnowledge.reject())
  @HttpCode(200)
  reject(@Req() request: Request, @Param("id") id: string, @Body(new ZodBodyPipe(rejectKnowledgeSchema)) body: z.infer<typeof rejectKnowledgeSchema>) {
    return this.admin.reject(this.getAccessToken(request), id, body);
  }

  @Get(API_ROUTES.adminKnowledge.diff())
  diff(@Req() request: Request, @Param("id") id: string, @Query() query: unknown) {
    const { from, to } = parseOrBadRequest(diffQuerySchema, query, "query");
    return this.admin.diff(this.getAccessToken(request), id, from, to);
  }

  @Get(API_ROUTES.adminKnowledge.submissions)
  submissions(@Req() request: Request) {
    return this.admin.submissions(this.getAccessToken(request));
  }

  @Get(API_ROUTES.adminKnowledge.categories)
  categories(@Req() request: Request) {
    return this.admin.categories(this.getAccessToken(request));
  }

  @Post(API_ROUTES.adminKnowledge.categories)
  createCategory(@Req() request: Request, @Body(new ZodBodyPipe(knowledgeCategorySchema)) body: z.infer<typeof knowledgeCategorySchema>) {
    return this.admin.createCategory(this.getAccessToken(request), body);
  }

  @Patch(API_ROUTES.adminKnowledge.category())
  updateCategory(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(updateKnowledgeCategorySchema)) body: z.infer<typeof updateKnowledgeCategorySchema>,
  ) {
    return this.admin.updateCategory(this.getAccessToken(request), id, body);
  }

  @Delete(API_ROUTES.adminKnowledge.category())
  @HttpCode(200)
  deleteCategory(@Req() request: Request, @Param("id") id: string) {
    return this.admin.deleteCategory(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.adminKnowledge.preview)
  preview(@Req() request: Request, @Query(new ZodBodyPipe(knowledgePreviewQuerySchema)) query: KnowledgePreviewQuery) {
    return this.knowledge.preview(this.getAccessToken(request), query);
  }

  @Get(API_ROUTES.adminKnowledge.insights)
  insights(@Req() request: Request) {
    return this.admin.insights(this.getAccessToken(request));
  }

  @Post(API_ROUTES.adminKnowledge.resolveQuery)
  @HttpCode(200)
  resolveQuery(@Req() request: Request, @Body(new ZodBodyPipe(resolveKnowledgeQuerySchema)) body: z.infer<typeof resolveKnowledgeQuerySchema>) {
    return this.admin.resolveQuery(this.getAccessToken(request), body);
  }

  @Get(API_ROUTES.adminKnowledge.export)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  exportAll(@Req() request: Request) {
    return this.admin.exportAll(this.getAccessToken(request));
  }

  @Post(API_ROUTES.adminKnowledge.import)
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  importItems(@Req() request: Request, @Body(new ZodBodyPipe(knowledgeImportSchema)) body: z.infer<typeof knowledgeImportSchema>) {
    return this.admin.importItems(this.getAccessToken(request), body);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import {
  API_ROUTES,
  supportNoteRequestSchema,
  supportReplyRequestSchema,
  supportSavedReplyRequestSchema,
  updateSupportTicketRequestSchema,
  type SupportNoteRequest,
  type SupportReplyRequest,
  type SupportSavedReplyInput,
  type UpdateSupportTicketRequest
} from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { SupportAdminService } from "./support-admin.service";
import { SupportSavedRepliesService } from "./support-saved-replies.service";
import { SupportUnansweredService } from "./support-unanswered.service";

/** The WhatsApp support inbox (`/admin/support`). Admins and super admins. */
@Controller()
export class SupportAdminController {
  constructor(
    private readonly savedReplies: SupportSavedRepliesService,
    private readonly support: SupportAdminService,
    private readonly unanswered: SupportUnansweredService
  ) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.adminSupport.tickets)
  list(@Req() request: Request, @Query() query: Record<string, unknown>) {
    return this.support.list(this.getAccessToken(request), query);
  }

  @Get(API_ROUTES.adminSupport.counts)
  counts(@Req() request: Request) {
    return this.support.counts(this.getAccessToken(request));
  }

  @Get(API_ROUTES.adminSupport.agents)
  agents(@Req() request: Request) {
    return this.support.agents(this.getAccessToken(request));
  }

  @Get(API_ROUTES.adminSupport.ticket())
  get(@Req() request: Request, @Param("id") id: string) {
    return this.support.get(this.getAccessToken(request), id);
  }

  @Patch(API_ROUTES.adminSupport.ticket())
  update(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(updateSupportTicketRequestSchema)) body: UpdateSupportTicketRequest
  ) {
    return this.support.update(this.getAccessToken(request), id, body);
  }

  @Get(API_ROUTES.adminSupport.messages())
  messages(@Req() request: Request, @Param("id") id: string, @Query() query: Record<string, unknown>) {
    return this.support.messages(this.getAccessToken(request), id, query);
  }

  @Post(API_ROUTES.adminSupport.reply())
  reply(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(supportReplyRequestSchema)) body: SupportReplyRequest
  ) {
    return this.support.reply(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.adminSupport.notes())
  addNote(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(supportNoteRequestSchema)) body: SupportNoteRequest
  ) {
    return this.support.addNote(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.adminSupport.takeOver())
  takeOver(@Req() request: Request, @Param("id") id: string) {
    return this.support.takeOver(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.adminSupport.returnToBot())
  returnToBot(@Req() request: Request, @Param("id") id: string) {
    return this.support.returnToBot(this.getAccessToken(request), id);
  }

  // ── Saved answers ──

  @Get(API_ROUTES.adminSupport.savedReplies)
  listSavedReplies(@Req() request: Request) {
    return this.savedReplies.list(this.getAccessToken(request));
  }

  @Post(API_ROUTES.adminSupport.savedReplies)
  createSavedReply(
    @Req() request: Request,
    @Body(new ZodBodyPipe(supportSavedReplyRequestSchema)) body: SupportSavedReplyInput
  ) {
    return this.savedReplies.create(this.getAccessToken(request), body);
  }

  @Put(API_ROUTES.adminSupport.savedReply())
  updateSavedReply(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(supportSavedReplyRequestSchema)) body: SupportSavedReplyInput
  ) {
    return this.savedReplies.update(this.getAccessToken(request), id, body);
  }

  @Delete(API_ROUTES.adminSupport.savedReply())
  deleteSavedReply(@Req() request: Request, @Param("id") id: string) {
    return this.savedReplies.remove(this.getAccessToken(request), id);
  }

  // ── Questions the bot couldn't answer ──

  @Get(API_ROUTES.adminSupport.unanswered)
  listUnanswered(@Req() request: Request, @Query() query: Record<string, unknown>) {
    return this.unanswered.list(this.getAccessToken(request), query);
  }

  @Post(API_ROUTES.adminSupport.dismissUnanswered())
  dismissUnanswered(@Req() request: Request, @Param("id") id: string) {
    return this.unanswered.dismiss(this.getAccessToken(request), id);
  }
}

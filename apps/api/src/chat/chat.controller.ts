import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import {
  API_ROUTES,
  chatContactsQuerySchema,
  chatMessagesQuerySchema,
  createChatGroupSchema,
  sendChatMessageSchema,
  startDirectChatSchema,
  updateChatGroupMembersSchema,
  type ChatMessagesQuery,
  type CreateChatGroupRequest,
  type SendChatMessageRequest,
  type StartDirectChatRequest,
  type UpdateChatGroupMembersRequest,
} from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { ChatService } from "./chat.service";
import { RequireFeature } from "../platform/require-feature.decorator";

@RequireFeature("directChat")
@Controller()
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.chat.conversations)
  list(@Req() request: Request) {
    return this.chat.listConversations(this.getAccessToken(request));
  }

  @Get(API_ROUTES.chat.unread)
  unread(@Req() request: Request) {
    return this.chat.unread(this.getAccessToken(request));
  }

  @Get(API_ROUTES.chat.contacts)
  contacts(@Req() request: Request, @Query(new ZodBodyPipe(chatContactsQuerySchema)) query: { q?: string }) {
    return this.chat.contacts(this.getAccessToken(request), query.q);
  }

  @Post(API_ROUTES.chat.startDirect)
  startDirect(@Req() request: Request, @Body(new ZodBodyPipe(startDirectChatSchema)) body: StartDirectChatRequest) {
    return this.chat.startDirect(this.getAccessToken(request), body.userId);
  }

  @Post(API_ROUTES.chat.createGroup)
  createGroup(@Req() request: Request, @Body(new ZodBodyPipe(createChatGroupSchema)) body: CreateChatGroupRequest) {
    return this.chat.createGroup(this.getAccessToken(request), body);
  }

  @Get(API_ROUTES.chat.conversation())
  get(@Req() request: Request, @Param("id") id: string) {
    return this.chat.getConversation(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.chat.messages())
  messages(
    @Req() request: Request,
    @Param("id") id: string,
    @Query(new ZodBodyPipe(chatMessagesQuerySchema)) query: ChatMessagesQuery,
  ) {
    return this.chat.listMessages(this.getAccessToken(request), id, query);
  }

  @Post(API_ROUTES.chat.messages())
  send(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(sendChatMessageSchema)) body: SendChatMessageRequest,
  ) {
    return this.chat.sendMessage(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.chat.markRead())
  markRead(@Req() request: Request, @Param("id") id: string) {
    return this.chat.markRead(this.getAccessToken(request), id);
  }

  @Patch(API_ROUTES.chat.members())
  updateMembers(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(updateChatGroupMembersSchema)) body: UpdateChatGroupMembersRequest,
  ) {
    return this.chat.updateGroupMembers(this.getAccessToken(request), id, body);
  }
}

import { Body, Controller, Get, Param, Post, Put, Query, Req } from "@nestjs/common";
import {
  API_ROUTES,
  messageDeliveryQuerySchema,
  messagingEventSchema,
  testMessagingRuleRequestSchema,
  updateMessagingRuleRequestSchema,
  type MessageDeliveryQuery,
  type MessagingEvent,
  type TestMessagingRuleRequest,
  type UpdateMessagingRuleRequest
} from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { MessagingRuleService } from "./messaging-rule.service";

@Controller()
export class MessagingController {
  constructor(private readonly messagingRuleService: MessagingRuleService) {}

  @Get(API_ROUTES.messaging.rules)
  list(@Req() request: Request) {
    return this.messagingRuleService.list(this.getAccessToken(request));
  }

  @Put(API_ROUTES.messaging.rule())
  update(
    @Param("event", new ZodBodyPipe(messagingEventSchema)) event: MessagingEvent,
    @Body(new ZodBodyPipe(updateMessagingRuleRequestSchema))
    body: UpdateMessagingRuleRequest,
    @Req() request: Request
  ) {
    return this.messagingRuleService.update(
      this.getAccessToken(request),
      event,
      body
    );
  }

  @Post(API_ROUTES.messaging.testRule())
  test(
    @Param("event", new ZodBodyPipe(messagingEventSchema)) event: MessagingEvent,
    @Body(new ZodBodyPipe(testMessagingRuleRequestSchema))
    body: TestMessagingRuleRequest,
    @Req() request: Request
  ) {
    return this.messagingRuleService.testRule(
      this.getAccessToken(request),
      event,
      body
    );
  }

  @Get(API_ROUTES.messaging.deliveries)
  deliveries(
    @Query(new ZodBodyPipe(messageDeliveryQuerySchema)) query: MessageDeliveryQuery,
    @Req() request: Request
  ) {
    return this.messagingRuleService.listDeliveries(this.getAccessToken(request), query);
  }

  @Post(API_ROUTES.messaging.retryDelivery())
  retryDelivery(@Param("id") id: string, @Req() request: Request) {
    return this.messagingRuleService.retryDelivery(this.getAccessToken(request), id);
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}

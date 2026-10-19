import { Controller, Get, Req } from "@nestjs/common";
import type { Request } from "express";
import { API_ROUTES } from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { SubscriptionService } from "./subscription.service";

@Controller()
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.subscription.current)
  getCurrent(@Req() request: Request) {
    return this.subscriptionService.getCurrent(this.getAccessToken(request));
  }

  @Get(API_ROUTES.subscription.admin)
  getAdminView(@Req() request: Request) {
    return this.subscriptionService.getAdminView(this.getAccessToken(request));
  }
}

import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  Body,
  Query,
} from "@nestjs/common";
import type { Request } from "express";
import { LiveClassService } from "./live-class.service";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { API_ROUTES } from "@nexa-chess/types";

@Controller()
export class LiveClassController {
  constructor(private readonly liveClassService: LiveClassService) { }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Post(API_ROUTES.liveClass.start())
  startClass(@Param("id") id: string, @Req() request: Request) {
    return this.liveClassService.startClass(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.liveClass.token())
  getToken(@Param("id") id: string, @Req() request: Request, @Query("clientId") clientId?: string) {
    return this.liveClassService.getToken(this.getAccessToken(request), id, clientId);
  }

  @Post(API_ROUTES.liveClass.end())
  endClass(@Param("id") id: string, @Req() request: Request) {
    return this.liveClassService.endClass(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.liveClass.get())
  getLiveClass(@Param("id") id: string, @Req() request: Request) {
    return this.liveClassService.getLiveClass(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.liveClass.participants())
  getParticipants(@Param("id") id: string, @Req() request: Request) {
    return this.liveClassService.getParticipants(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.liveClass.chat())
  saveChatMessage(@Param("id") id: string, @Req() request: Request, @Body() body: { message: string }) {
    return this.liveClassService.saveChatMessage(this.getAccessToken(request), id, body.message);
  }

  @Get(API_ROUTES.liveClass.chat())
  getChatHistory(@Param("id") id: string, @Req() request: Request) {
    return this.liveClassService.getChatHistory(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.liveClass.demoJoin())
  joinDemoClass(@Param("id") id: string, @Body() body: any) {
    // Expected body: GuestJoinDemoRequest
    return this.liveClassService.joinDemoClass(id, body);
  }
}

import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  Body,
  Query,
} from "@nestjs/common";
import type { Request, Response } from "express";
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
  saveChatMessage(
    @Param("id") id: string,
    @Req() request: Request,
    @Body() body: { message: string; clientMessageId?: string }
  ) {
    return this.liveClassService.saveChatMessage(
      this.getAccessToken(request),
      id,
      body.message,
      body.clientMessageId
    );
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

  @Post(API_ROUTES.liveClass.startRecording())
  startRecording(@Param("id") id: string, @Req() request: Request) {
    return this.liveClassService.startRecording(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.liveClass.stopRecording())
  stopRecording(@Param("id") id: string, @Req() request: Request) {
    return this.liveClassService.stopRecording(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.liveClass.downloadRecording())
  downloadRecording(@Param("id") id: string, @Req() request: Request) {
    return this.liveClassService.downloadRecording(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.liveClass.streamRecording())
  streamRecording(
    @Param("id") id: string,
    @Req() request: Request,
    @Res() response: Response,
    @Query("token") queryToken?: string
  ) {
    const token = this.getAccessToken(request) || queryToken;
    return this.liveClassService.streamRecording(token, id, request, response);
  }

  @Get(API_ROUTES.liveClass.storageUsage())
  getStorageUsage(@Req() request: Request) {
    return this.liveClassService.getRecordingStorageUsage(this.getAccessToken(request));
  }

  @Post(API_ROUTES.liveClass.recordingProgress())
  updateRecordingProgress(
    @Param("id") id: string,
    @Req() request: Request,
    @Body() body: { watchedSeconds: number }
  ) {
    return this.liveClassService.updateRecordingProgress(
      this.getAccessToken(request),
      id,
      body.watchedSeconds
    );
  }
}

import {
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  Res,
  Body,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { LiveClassService } from "./live-class.service";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import {
  API_ROUTES,
  guestJoinDemoRequestSchema,
  moderateAllRequestSchema,
  kickParticipantRequestSchema,
  moderateParticipantRequestSchema,
  resolveScreenShareRequestSchema,
  pullStudentRequestSchema,
  resolveWaitingRoomRequestSchema,
  saveLiveChatMessageRequestSchema,
  updateLiveClassSettingsRequestSchema,
  type GuestJoinDemoRequest,
  type ModerateAllRequest,
  type KickParticipantRequest,
  type ModerateParticipantRequest,
  type ResolveScreenShareRequest,
  type PullStudentRequest,
  type ResolveWaitingRoomRequest,
  type SaveLiveChatMessageRequest,
  type UpdateLiveClassSettingsRequest,
} from "@nexa-chess/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";

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

  @Put(API_ROUTES.liveClass.liveSettings())
  updateLiveSettings(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(updateLiveClassSettingsRequestSchema)) body: UpdateLiveClassSettingsRequest,
  ) {
    return this.liveClassService.updateLiveSettings(this.getAccessToken(request), id, body);
  }

  @Get(API_ROUTES.liveClass.get())
  getLiveClass(@Param("id") id: string, @Req() request: Request) {
    return this.liveClassService.getLiveClass(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.liveClass.participants())
  getParticipants(@Param("id") id: string, @Req() request: Request) {
    return this.liveClassService.getParticipants(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.liveClass.heartbeat())
  heartbeat(
    @Param("id") id: string,
    @Req() request: Request,
    @Body() body: { clientId?: string }
  ) {
    return this.liveClassService.heartbeat(this.getAccessToken(request), id, body?.clientId);
  }

  @Post(API_ROUTES.liveClass.chat())
  saveChatMessage(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(saveLiveChatMessageRequestSchema)) body: SaveLiveChatMessageRequest
  ) {
    return this.liveClassService.saveChatMessage(
      this.getAccessToken(request),
      id,
      body.message,
      body.clientMessageId,
      body.recipientId
    );
  }

  @Get(API_ROUTES.liveClass.pullRoster())
  getPullRoster(@Param("id") id: string, @Query("q") q: string | undefined, @Req() request: Request) {
    return this.liveClassService.getPullRoster(this.getAccessToken(request), id, q);
  }

  @Post(API_ROUTES.liveClass.pullStudent())
  pullStudent(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(pullStudentRequestSchema)) body: PullStudentRequest
  ) {
    return this.liveClassService.pullStudent(this.getAccessToken(request), id, body.studentId);
  }

  @Post(API_ROUTES.liveClass.cancelPull())
  cancelPull(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(pullStudentRequestSchema)) body: PullStudentRequest
  ) {
    return this.liveClassService.cancelPull(this.getAccessToken(request), id, body.studentId);
  }

  @Get(API_ROUTES.liveClass.waitingRoom())
  getWaitingRoom(@Param("id") id: string, @Req() request: Request) {
    return this.liveClassService.getWaitingRoomList(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.liveClass.resolveWaitingRoom())
  resolveWaitingRoom(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(resolveWaitingRoomRequestSchema)) body: ResolveWaitingRoomRequest
  ) {
    return this.liveClassService.resolveWaitingRoomEntry(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.liveClass.requestWaitingRoom())
  requestWaitingRoom(@Param("id") id: string, @Req() request: Request) {
    return this.liveClassService.requestWaitingRoomAdmission(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.liveClass.screenShareRequests())
  getScreenShareRequests(@Param("id") id: string, @Req() request: Request) {
    return this.liveClassService.getScreenShareRequestList(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.liveClass.requestScreenShare())
  requestScreenShare(@Param("id") id: string, @Req() request: Request) {
    return this.liveClassService.requestScreenShare(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.liveClass.resolveScreenShareRequest())
  resolveScreenShareRequest(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(resolveScreenShareRequestSchema)) body: ResolveScreenShareRequest
  ) {
    return this.liveClassService.resolveScreenShareRequest(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.liveClass.endScreenShare())
  endScreenShare(@Param("id") id: string, @Req() request: Request) {
    return this.liveClassService.endScreenShare(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.liveClass.moderate())
  moderateParticipant(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(moderateParticipantRequestSchema)) body: ModerateParticipantRequest
  ) {
    return this.liveClassService.moderateParticipant(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.liveClass.moderateAll())
  moderateAll(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(moderateAllRequestSchema)) body: ModerateAllRequest
  ) {
    return this.liveClassService.moderateAll(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.liveClass.kick())
  kickParticipant(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(kickParticipantRequestSchema)) body: KickParticipantRequest
  ) {
    return this.liveClassService.kickParticipant(this.getAccessToken(request), id, body);
  }

  @Get(API_ROUTES.liveClass.chat())
  getChatHistory(@Param("id") id: string, @Req() request: Request) {
    return this.liveClassService.getChatHistory(this.getAccessToken(request), id);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get(API_ROUTES.liveClass.demoInfo())
  getDemoInfo(@Param("id") id: string, @Query("invite") invite?: string) {
    return this.liveClassService.getDemoInfo(id, invite || undefined);
  }

  // Throttled harder than the global limit so a passcode can't be brute-forced.
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post(API_ROUTES.liveClass.demoJoin())
  joinDemoClass(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(guestJoinDemoRequestSchema)) body: GuestJoinDemoRequest
  ) {
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
  downloadRecording(
    @Param("id") id: string,
    @Req() request: Request,
    @Query("download") download?: string
  ) {
    return this.liveClassService.downloadRecording(
      this.getAccessToken(request),
      id,
      request,
      download === "1" || download === "true"
    );
  }

  @Get(API_ROUTES.liveClass.streamRecording())
  streamRecording(
    @Param("id") id: string,
    @Req() request: Request,
    @Res() response: Response,
    @Query("st") streamToken?: string,
    @Query("dl") download?: string
  ) {
    return this.liveClassService.streamRecording(
      this.getAccessToken(request),
      streamToken,
      id,
      request,
      response,
      download === "1" || download === "true"
    );
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

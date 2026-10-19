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
import { LiveClassBoardStateService } from "./live-class-board-state.service";
import { LiveClassChatService } from "./live-class-chat.service";
import { LiveClassDemoService } from "./live-class-demo.service";
import { LiveClassModerationService } from "./live-class-moderation.service";
import { LiveClassPullService } from "./live-class-pull.service";
import { LiveClassRecordingService } from "./live-class-recording.service";
import { LiveClassScreenShareService } from "./live-class-screen-share.service";
import { LiveClassWaitingRoomService } from "./live-class-waiting-room.service";
import { LiveClassService } from "./live-class.service";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { optionalQueryString } from "../common/query-params";
import {
  API_ROUTES,
  guestJoinDemoRequestSchema,
  liveBoardStateSchema,
  moderateAllRequestSchema,
  kickParticipantRequestSchema,
  liveClassHeartbeatRequestSchema,
  moderateParticipantRequestSchema,
  requestTrackOnRequestSchema,
  resolveScreenShareRequestSchema,
  pullStudentRequestSchema,
  recordingProgressRequestSchema,
  resolveWaitingRoomRequestSchema,
  saveLiveChatMessageRequestSchema,
  updateLiveClassSettingsRequestSchema,
  type GuestJoinDemoRequest,
  type LiveBoardState,
  type ModerateAllRequest,
  type KickParticipantRequest,
  type LiveClassHeartbeatRequest,
  type ModerateParticipantRequest,
  type RequestTrackOnRequest,
  type ResolveScreenShareRequest,
  type PullStudentRequest,
  type RecordingProgressRequest,
  type ResolveWaitingRoomRequest,
  type SaveLiveChatMessageRequest,
  type UpdateLiveClassSettingsRequest,
} from "@nexa-chess/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";

@Controller()
export class LiveClassController {
  constructor(
    private readonly liveClassService: LiveClassService,
    private readonly boardState: LiveClassBoardStateService,
    private readonly chat: LiveClassChatService,
    private readonly demo: LiveClassDemoService,
    private readonly moderation: LiveClassModerationService,
    private readonly pulls: LiveClassPullService,
    private readonly recording: LiveClassRecordingService,
    private readonly screenShare: LiveClassScreenShareService,
    private readonly waitingRoom: LiveClassWaitingRoomService
  ) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Post(API_ROUTES.liveClass.start())
  startClass(@Param("id") id: string, @Req() request: Request) {
    return this.liveClassService.startClass(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.liveClass.token())
  getToken(@Param("id") id: string, @Req() request: Request, @Query("clientId") clientId?: unknown) {
    return this.liveClassService.getToken(
      this.getAccessToken(request),
      id,
      optionalQueryString(clientId, "clientId")
    );
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
    @Body(new ZodBodyPipe(liveClassHeartbeatRequestSchema)) body: LiveClassHeartbeatRequest
  ) {
    return this.liveClassService.heartbeat(this.getAccessToken(request), id, body.clientId);
  }

  @Post(API_ROUTES.liveClass.chat())
  saveChatMessage(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(saveLiveChatMessageRequestSchema)) body: SaveLiveChatMessageRequest
  ) {
    return this.chat.saveChatMessage(
      this.getAccessToken(request),
      id,
      body.message,
      body.clientMessageId,
      body.recipientId
    );
  }

  @Get(API_ROUTES.liveClass.pullRoster())
  getPullRoster(@Param("id") id: string, @Query("q") q: unknown, @Req() request: Request) {
    return this.pulls.getPullRoster(this.getAccessToken(request), id, optionalQueryString(q, "q"));
  }

  @Post(API_ROUTES.liveClass.pullStudent())
  pullStudent(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(pullStudentRequestSchema)) body: PullStudentRequest
  ) {
    return this.pulls.pullStudent(this.getAccessToken(request), id, body.studentId);
  }

  @Post(API_ROUTES.liveClass.cancelPull())
  cancelPull(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(pullStudentRequestSchema)) body: PullStudentRequest
  ) {
    return this.pulls.cancelPull(this.getAccessToken(request), id, body.studentId);
  }

  @Get(API_ROUTES.liveClass.waitingRoom())
  getWaitingRoom(@Param("id") id: string, @Req() request: Request) {
    return this.waitingRoom.getWaitingRoomList(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.liveClass.resolveWaitingRoom())
  resolveWaitingRoom(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(resolveWaitingRoomRequestSchema)) body: ResolveWaitingRoomRequest
  ) {
    return this.waitingRoom.resolveWaitingRoomEntry(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.liveClass.requestWaitingRoom())
  requestWaitingRoom(@Param("id") id: string, @Req() request: Request) {
    return this.waitingRoom.requestWaitingRoomAdmission(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.liveClass.boardState())
  getBoardState(@Param("id") id: string, @Req() request: Request) {
    return this.boardState.getBoardState(this.getAccessToken(request), id);
  }

  @Put(API_ROUTES.liveClass.boardState())
  saveBoardState(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(liveBoardStateSchema)) body: LiveBoardState
  ) {
    return this.boardState.saveBoardState(this.getAccessToken(request), id, body);
  }

  @Get(API_ROUTES.liveClass.screenShareRequests())
  getScreenShareRequests(@Param("id") id: string, @Req() request: Request) {
    return this.screenShare.getScreenShareRequestList(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.liveClass.requestScreenShare())
  requestScreenShare(@Param("id") id: string, @Req() request: Request) {
    return this.screenShare.requestScreenShare(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.liveClass.resolveScreenShareRequest())
  resolveScreenShareRequest(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(resolveScreenShareRequestSchema)) body: ResolveScreenShareRequest
  ) {
    return this.screenShare.resolveScreenShareRequest(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.liveClass.endScreenShare())
  endScreenShare(@Param("id") id: string, @Req() request: Request) {
    return this.screenShare.endScreenShare(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.liveClass.moderate())
  moderateParticipant(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(moderateParticipantRequestSchema)) body: ModerateParticipantRequest
  ) {
    return this.moderation.moderateParticipant(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.liveClass.requestTrackOn())
  requestTrackOn(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(requestTrackOnRequestSchema)) body: RequestTrackOnRequest
  ) {
    return this.moderation.requestTrackOn(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.liveClass.moderateAll())
  moderateAll(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(moderateAllRequestSchema)) body: ModerateAllRequest
  ) {
    return this.moderation.moderateAll(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.liveClass.kick())
  kickParticipant(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(kickParticipantRequestSchema)) body: KickParticipantRequest
  ) {
    return this.moderation.kickParticipant(this.getAccessToken(request), id, body);
  }

  @Get(API_ROUTES.liveClass.chat())
  getChatHistory(@Param("id") id: string, @Req() request: Request) {
    return this.chat.getChatHistory(this.getAccessToken(request), id);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get(API_ROUTES.liveClass.demoInfo())
  getDemoInfo(@Param("id") id: string, @Query("invite") invite?: unknown) {
    return this.demo.getDemoInfo(id, optionalQueryString(invite, "invite"));
  }

  // Throttled harder than the global limit so a passcode can't be brute-forced.
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post(API_ROUTES.liveClass.demoJoin())
  joinDemoClass(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(guestJoinDemoRequestSchema)) body: GuestJoinDemoRequest
  ) {
    return this.demo.joinDemoClass(id, body);
  }

  @Post(API_ROUTES.liveClass.startRecording())
  startRecording(@Param("id") id: string, @Req() request: Request) {
    return this.recording.startRecording(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.liveClass.stopRecording())
  stopRecording(@Param("id") id: string, @Req() request: Request) {
    return this.recording.stopRecording(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.liveClass.downloadRecording())
  downloadRecording(
    @Param("id") id: string,
    @Req() request: Request,
    @Query("download") download?: string
  ) {
    return this.recording.downloadRecording(
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
    @Query("st") rawStreamToken?: unknown,
    @Query("dl") download?: string
  ) {
    return this.recording.streamRecording(
      this.getAccessToken(request),
      optionalQueryString(rawStreamToken, "st"),
      id,
      request,
      response,
      download === "1" || download === "true"
    );
  }

  @Get(API_ROUTES.liveClass.storageUsage())
  getStorageUsage(@Req() request: Request) {
    return this.recording.getRecordingStorageUsage(this.getAccessToken(request));
  }

  @Post(API_ROUTES.liveClass.recordingProgress())
  updateRecordingProgress(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(recordingProgressRequestSchema)) body: RecordingProgressRequest
  ) {
    return this.recording.updateRecordingProgress(
      this.getAccessToken(request),
      id,
      body.watchedSeconds
    );
  }
}

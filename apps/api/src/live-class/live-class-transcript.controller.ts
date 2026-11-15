import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  API_ROUTES,
  appendTranscriptRequestSchema,
  setTranscriptConsentRequestSchema,
  type AppendTranscriptRequest,
  type SetTranscriptConsentRequest
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { optionalQueryString } from "../common/query-params";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { LiveClassTranscriptService } from "./live-class-transcript.service";

@Controller()
export class LiveClassTranscriptController {
  constructor(private readonly transcript: LiveClassTranscriptService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Post(API_ROUTES.liveClass.transcript())
  @HttpCode(HttpStatus.OK)
  append(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(appendTranscriptRequestSchema)) body: AppendTranscriptRequest,
    @Req() request: Request
  ) {
    return this.transcript.append(this.getAccessToken(request), id, body);
  }

  @Get(API_ROUTES.liveClass.transcript())
  read(@Param("id") id: string, @Query("cursor") cursor: unknown, @Req() request: Request) {
    return this.transcript.read(this.getAccessToken(request), id, optionalQueryString(cursor, "cursor"));
  }

  @Get(API_ROUTES.liveClass.transcriptConsent())
  getConsent(@Req() request: Request) {
    return this.transcript.getConsent(this.getAccessToken(request));
  }

  @Put(API_ROUTES.liveClass.transcriptConsent())
  setConsent(
    @Body(new ZodBodyPipe(setTranscriptConsentRequestSchema)) body: SetTranscriptConsentRequest,
    @Req() request: Request
  ) {
    return this.transcript.setConsent(this.getAccessToken(request), body);
  }
}

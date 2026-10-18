import { Body, Controller, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import {
  API_ROUTES,
  importPgnRequestSchema,
  linkExternalAccountRequestSchema,
  syncExternalAccountRequestSchema,
  type LinkExternalAccountRequest,
} from '@nexa-chess/types';
import type { Request } from 'express';
import type { z } from 'zod';
import { AUTH_COOKIE_NAMES } from '../auth/types';
import { ZodBodyPipe } from '../common/zod-body.pipe';
import { GameSourcesService } from './game-sources.service';

@Controller()
export class GameSourcesController {
  constructor(private readonly sources: GameSourcesService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.gameSources.overview)
  overview(@Req() request: Request) {
    return this.sources.overview(this.getAccessToken(request));
  }

  @Post(API_ROUTES.games.importPgn)
  importPgn(@Req() request: Request, @Body(new ZodBodyPipe(importPgnRequestSchema)) body: z.output<typeof importPgnRequestSchema>) {
    return this.sources.importPgn(this.getAccessToken(request), body);
  }

  @Post(API_ROUTES.gameSources.accounts)
  link(@Req() request: Request, @Body(new ZodBodyPipe(linkExternalAccountRequestSchema)) body: LinkExternalAccountRequest) {
    return this.sources.link(this.getAccessToken(request), body);
  }

  @Post(API_ROUTES.gameSources.verify())
  verify(@Req() request: Request, @Param('id') id: string) {
    return this.sources.verify(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.gameSources.sync())
  sync(
    @Req() request: Request,
    @Param('id') id: string,
    @Body(new ZodBodyPipe(syncExternalAccountRequestSchema)) body: z.output<typeof syncExternalAccountRequestSchema>,
  ) {
    return this.sources.sync(this.getAccessToken(request), id, body.analyse);
  }

  @Delete(API_ROUTES.gameSources.account())
  unlink(@Req() request: Request, @Param('id') id: string, @Query('deleteGames') deleteGames?: string) {
    return this.sources.unlink(this.getAccessToken(request), id, deleteGames === 'true');
  }
}

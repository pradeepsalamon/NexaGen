import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from "@nestjs/common";
import {
  API_ROUTES,
  gameLibraryQuerySchema,
  importGameRequestSchema,
  saveGameAnalysisRequestSchema,
  type GameLibraryQuery,
  type ImportGameRequest,
  type SaveGameAnalysisRequest,
} from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { GameLibraryService } from "./game-library.service";
import { RequireFeature } from "../platform/require-feature.decorator";

@RequireFeature("gameLibrary")
@Controller()
export class GameLibraryController {
  constructor(private readonly games: GameLibraryService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.games.list)
  list(@Req() request: Request, @Query(new ZodBodyPipe(gameLibraryQuerySchema)) query: GameLibraryQuery) {
    return this.games.list(this.getAccessToken(request), query);
  }

  @Get(API_ROUTES.games.filterOptions)
  filterOptions(@Req() request: Request) {
    return this.games.filterOptions(this.getAccessToken(request));
  }

  @Post(API_ROUTES.games.import)
  importGame(@Req() request: Request, @Body(new ZodBodyPipe(importGameRequestSchema)) body: ImportGameRequest) {
    return this.games.importGame(this.getAccessToken(request), body);
  }

  @Get(API_ROUTES.games.get())
  get(@Req() request: Request, @Param("id") id: string) {
    return this.games.get(this.getAccessToken(request), id);
  }

  @Put(API_ROUTES.games.saveAnalysis())
  saveAnalysis(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(saveGameAnalysisRequestSchema)) body: SaveGameAnalysisRequest,
  ) {
    return this.games.saveAnalysis(this.getAccessToken(request), id, body);
  }

  @Delete(API_ROUTES.games.delete())
  remove(@Req() request: Request, @Param("id") id: string) {
    return this.games.remove(this.getAccessToken(request), id);
  }
}

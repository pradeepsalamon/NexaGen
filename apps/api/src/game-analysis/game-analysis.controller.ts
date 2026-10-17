import { Body, Controller, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import { API_ROUTES, requestGameAnalysisRequestSchema, type RequestGameAnalysisRequest } from '@nexa-chess/types';
import type { Request } from 'express';
import { AUTH_COOKIE_NAMES } from '../auth/types';
import { ZodBodyPipe } from '../common/zod-body.pipe';
import { GameAnalysisService } from './game-analysis.service';
import { GameInsightsService } from './game-insights.service';
import { GameRevisionService } from './game-revision.service';

@Controller()
export class GameAnalysisController {
  constructor(
    private readonly analysis: GameAnalysisService,
    private readonly insights: GameInsightsService,
    private readonly revision: GameRevisionService,
  ) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.gameAnalysis.forGame())
  state(@Req() request: Request, @Param('id') id: string) {
    return this.analysis.state(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.gameAnalysis.forGame())
  request(
    @Req() request: Request,
    @Param('id') id: string,
    @Body(new ZodBodyPipe(requestGameAnalysisRequestSchema)) body: Required<RequestGameAnalysisRequest>,
  ) {
    return this.analysis.request(this.getAccessToken(request), id, body.depth);
  }

  @Delete(API_ROUTES.gameAnalysis.forGame())
  cancel(@Req() request: Request, @Param('id') id: string) {
    return this.analysis.cancel(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.gameAnalysis.tacticToRevision())
  tacticToRevision(@Req() request: Request, @Param('analysisId') analysisId: string, @Param('ply') ply: string) {
    return this.revision.addTactic(this.getAccessToken(request), analysisId, /^\d{1,4}$/.test(ply) ? Number(ply) : -1);
  }

  @Get(API_ROUTES.gameInsights.mine)
  mine(@Req() request: Request) {
    return this.insights.mine(this.getAccessToken(request));
  }

  @Get(API_ROUTES.gameInsights.gamesMine)
  gamesMine(@Req() request: Request, @Query() query: Record<string, unknown>) {
    return this.insights.gamesMine(this.getAccessToken(request), query);
  }

  @Get(API_ROUTES.gameInsights.student())
  student(@Req() request: Request, @Param('studentId') studentId: string) {
    return this.insights.forStudent(this.getAccessToken(request), studentId);
  }

  @Get(API_ROUTES.gameInsights.games())
  studentGames(@Req() request: Request, @Param('studentId') studentId: string, @Query() query: Record<string, unknown>) {
    return this.insights.games(this.getAccessToken(request), studentId, query);
  }
}

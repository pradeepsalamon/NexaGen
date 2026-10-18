import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  ServiceUnavailableException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import type { StockfishStreamEvent } from '@nexa-chess/types';
import { AUTH_COOKIE_NAMES } from '../auth/types';
import { AnalyzePositionDto } from './dto/analyze-position.dto';
import { normalizeEngineFen, StockfishService } from './stockfish.service';
import { authenticateUser } from '../auth/authenticate';
import { PrismaService } from '../prisma/prisma.service';

const ANALYSIS_ROLES = new Set(['COACH', 'ADMIN', 'SUPER_ADMIN']);

@Controller('stockfish')
export class StockfishController {

  constructor(
    private readonly stockfishService: StockfishService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  private async assertCanAnalyze(request: Request) {
    // Loads the user, so a suspended account or a role change applies at once.
    const user = await authenticateUser(this.jwtService, this.prisma, this.getAccessToken(request));
    if (!ANALYSIS_ROLES.has(user.role)) {
      throw new ForbiddenException(
        'You do not have permission to use engine analysis.',
      );
    }
  }

  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  async analyze(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: AnalyzePositionDto,
  ) {
    await this.assertCanAnalyze(request);

    // An illegal set-up position is a 400 naming the problem; an empty or
    // crashed engine pool is a 503.
    const check = normalizeEngineFen(body.fen);
    if (!check.ok) {
      throw new BadRequestException(check.reason);
    }
    // The panel aborts its fetch whenever the position changes; tell the engine
    // so the stale search stops instead of running out its movetime.
    const abort = new AbortController();
    const onClose = () => {
      if (!response.writableFinished) abort.abort();
    };
    response.once('close', onClose);
    try {
      return await this.stockfishService.analyzePosition(check.fen, {
        mode: body.mode,
        signal: abort.signal,
      });
    } finally {
      response.off('close', onClose);
    }
  }

  /**
   * The same analysis as `POST /analyze`, streamed: an `info` event each time
   * the search deepens (throttled server-side), then `done` with the final
   * result. The first evaluation lands in milliseconds instead of after the
   * full movetime. Closing the connection stops the search.
   */
  @Post('analyze/stream')
  @HttpCode(HttpStatus.OK)
  async analyzeStream(
    @Req() request: Request,
    @Res() response: Response,
    @Body() body: AnalyzePositionDto,
  ) {
    // Everything that can fail with a status code fails before the headers go out.
    await this.assertCanAnalyze(request);
    const check = normalizeEngineFen(body.fen);
    if (!check.ok) {
      throw new BadRequestException(check.reason);
    }
    if (!this.stockfishService.isAvailable()) {
      throw new ServiceUnavailableException('Engine analysis is not available on this server.');
    }

    response.status(HttpStatus.OK);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    // nginx would otherwise buffer the whole stream and defeat the point.
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    const send = (event: StockfishStreamEvent) => {
      if (!response.writableEnded) response.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const abort = new AbortController();
    const onClose = () => {
      if (!response.writableFinished) abort.abort();
    };
    response.once('close', onClose);
    try {
      const result = await this.stockfishService.analyzePosition(check.fen, {
        mode: body.mode,
        signal: abort.signal,
        onUpdate: (partial) => send({ type: 'info', result: partial }),
      });
      send({ type: 'done', result });
    } catch (error) {
      if (!abort.signal.aborted) {
        send({
          type: 'error',
          message:
            error instanceof HttpException ? error.message : 'Engine analysis failed. Please try again.',
        });
      }
    } finally {
      response.off('close', onClose);
      response.end();
    }
  }
}

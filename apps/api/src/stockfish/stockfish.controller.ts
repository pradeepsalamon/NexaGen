import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { validateFen } from 'chess.js';
import type { Request } from 'express';
import { getApiEnv } from '@nexa-chess/config/api';
import type { AccessTokenPayload } from '../auth/types';
import { AUTH_COOKIE_NAMES } from '../auth/types';
import { AnalyzePositionDto } from './dto/analyze-position.dto';
import { StockfishService } from './stockfish.service';

const ANALYSIS_ROLES = new Set(['COACH', 'ADMIN', 'SUPER_ADMIN']);

@Controller('stockfish')
export class StockfishController {
  private readonly env = getApiEnv();

  constructor(
    private readonly stockfishService: StockfishService,
    private readonly jwtService: JwtService,
  ) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  private async assertCanAnalyze(request: Request) {
    const token = this.getAccessToken(request);
    if (!token) {
      throw new UnauthorizedException('Access token is missing.');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }

    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type.');
    }

    if (!ANALYSIS_ROLES.has(payload.role)) {
      throw new ForbiddenException(
        'You do not have permission to use engine analysis.',
      );
    }
  }

  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  async analyze(@Req() request: Request, @Body() body: AnalyzePositionDto) {
    await this.assertCanAnalyze(request);

    if (!validateFen(body.fen).ok) {
      throw new BadRequestException('The position (FEN) is not valid.');
    }

    // A thrown ServiceUnavailableException (engine pool empty / died)
    // propagates as 503 so the client can show a real error state.
    return this.stockfishService.analyzePosition(body.fen);
  }
}

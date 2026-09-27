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
import type { Request } from 'express';
import { getApiEnv } from '@nexa-chess/config/api';
import type { AccessTokenPayload } from '../auth/types';
import { AUTH_COOKIE_NAMES } from '../auth/types';
import { AnalyzePositionDto } from './dto/analyze-position.dto';
import { normalizeEngineFen, StockfishService } from './stockfish.service';

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

    // An illegal set-up position is a 400 naming the problem; an empty or
    // crashed engine pool is a 503.
    const check = normalizeEngineFen(body.fen);
    if (!check.ok) {
      throw new BadRequestException(check.reason);
    }
    return this.stockfishService.analyzePosition(check.fen, { mode: body.mode });
  }
}

import { Controller, Post, Body, HttpCode, HttpStatus, Req, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { StockfishService } from './stockfish.service';
import { AUTH_COOKIE_NAMES } from '../auth/types';
import { JwtService } from '@nestjs/jwt';

export class AnalyzePositionDto {
  fen!: string;
}

@Controller('stockfish')
export class StockfishController {
  constructor(
    private readonly stockfishService: StockfishService,
    private readonly jwtService: JwtService
  ) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  async analyze(@Req() request: Request, @Body() body: AnalyzePositionDto) {
    const token = this.getAccessToken(request);
    if (!token) {
      throw new UnauthorizedException('Access token is missing.');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      if (payload.type !== 'access') {
        throw new UnauthorizedException('Invalid token type.');
      }
      
      const role = payload.role;
      if (role !== 'COACH' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
        throw new ForbiddenException('You do not have permission to access Stockfish.');
      }
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }

    if (!body.fen) {
      return { error: 'FEN is required' };
    }
    try {
      const result = await this.stockfishService.analyzePosition(body.fen);
      return result;
    } catch (e: any) {
      return { error: e.message || 'Failed to analyze position' };
    }
  }
}

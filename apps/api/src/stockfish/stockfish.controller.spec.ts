import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import type { StockfishAnalysisResult } from '@nexa-chess/types';
import { StockfishController } from './stockfish.controller';
import { StockfishService } from './stockfish.service';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const RESULT: StockfishAnalysisResult = {
  evaluation: 0.2,
  mate: null,
  bestMove: 'e4',
  bestMoveUci: 'e2e4',
  depth: 18,
  pv: ['e4', 'e5'],
  pvUci: ['e2e4', 'e7e5'],
};

describe('StockfishController', () => {
  let controller: StockfishController;
  let stockfish: { analyzePosition: jest.Mock };
  let jwt: { verifyAsync: jest.Mock };

  const req = (token?: string) =>
    ({ cookies: token ? { nexa_access_token: token } : {} }) as unknown as Request;

  beforeEach(async () => {
    stockfish = { analyzePosition: jest.fn().mockResolvedValue(RESULT) };
    jwt = {
      verifyAsync: jest.fn().mockResolvedValue({ type: 'access', role: 'COACH' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StockfishController],
      providers: [
        { provide: StockfishService, useValue: stockfish },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    controller = module.get(StockfishController);
  });

  it('rejects a request with no access token', async () => {
    await expect(controller.analyze(req(), { fen: START_FEN })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an invalid / expired token', async () => {
    jwt.verifyAsync.mockRejectedValueOnce(new Error('bad token'));
    await expect(
      controller.analyze(req('t'), { fen: START_FEN }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a non-access token type', async () => {
    jwt.verifyAsync.mockResolvedValueOnce({ type: 'refresh', role: 'COACH' });
    await expect(
      controller.analyze(req('t'), { fen: START_FEN }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('forbids a student', async () => {
    jwt.verifyAsync.mockResolvedValueOnce({ type: 'access', role: 'STUDENT' });
    await expect(
      controller.analyze(req('t'), { fen: START_FEN }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(stockfish.analyzePosition).not.toHaveBeenCalled();
  });

  it('rejects a malformed FEN before touching the engine', async () => {
    await expect(
      controller.analyze(req('t'), { fen: 'not-a-fen' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(stockfish.analyzePosition).not.toHaveBeenCalled();
  });

  it('analyzes a valid position for a coach', async () => {
    const out = await controller.analyze(req('t'), { fen: START_FEN });
    expect(out).toEqual(RESULT);
    expect(stockfish.analyzePosition).toHaveBeenCalledWith(START_FEN);
  });

  it('allows an admin', async () => {
    jwt.verifyAsync.mockResolvedValueOnce({ type: 'access', role: 'ADMIN' });
    await expect(
      controller.analyze(req('t'), { fen: START_FEN }),
    ).resolves.toEqual(RESULT);
  });

  it('propagates a 503 when the engine pool is unavailable', async () => {
    stockfish.analyzePosition.mockRejectedValueOnce(
      new ServiceUnavailableException('Engine analysis is not available on this server.'),
    );
    await expect(
      controller.analyze(req('t'), { fen: START_FEN }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter } from 'events';
import type { Request, Response } from 'express';
import type { StockfishAnalysisResult } from '@nexa-chess/types';
import { PrismaService } from '../prisma/prisma.service';
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
  let stockfish: { analyzePosition: jest.Mock; isAvailable: jest.Mock };
  let jwt: { verifyAsync: jest.Mock };
  let prisma: { user: { findUnique: jest.Mock } };

  const req = (token?: string) =>
    ({ cookies: token ? { nexa_access_token: token } : {} }) as unknown as Request;

  const res = () =>
    Object.assign(new EventEmitter(), { writableFinished: false }) as unknown as Response & EventEmitter;

  /** A response that records what an SSE handler writes. */
  const sseRes = () => {
    const r = Object.assign(new EventEmitter(), {
      writableEnded: false,
      writableFinished: false,
      headers: {} as Record<string, string>,
      chunks: [] as string[],
      status: jest.fn(),
      setHeader(name: string, value: string) {
        r.headers[name] = value;
      },
      flushHeaders: jest.fn(),
      write(chunk: string) {
        r.chunks.push(chunk);
        return true;
      },
      end: jest.fn(() => {
        r.writableEnded = true;
      }),
    });
    return r;
  };
  const events = (r: ReturnType<typeof sseRes>) =>
    r.chunks.map((c) => JSON.parse(c.replace(/^data: /, '').trim()));

  beforeEach(async () => {
    stockfish = {
      analyzePosition: jest.fn().mockResolvedValue(RESULT),
      isAvailable: jest.fn().mockReturnValue(true),
    };
    jwt = {
      verifyAsync: jest.fn().mockResolvedValue({ type: 'access', sub: 'user_1', role: 'COACH' }),
    };

    // The controller loads the user; the stored role is the one in the token.
    prisma = {
      user: {
        findUnique: jest.fn(async () => {
          const payload = await jwt.verifyAsync.mock.results.at(-1)?.value;
          return { id: 'user_1', role: payload?.role, status: 'ACTIVE' };
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StockfishController],
      providers: [
        { provide: StockfishService, useValue: stockfish },
        { provide: JwtService, useValue: jwt },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    controller = module.get(StockfishController);
  });

  it('rejects a request with no access token', async () => {
    await expect(controller.analyze(req(), res(), { fen: START_FEN })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an invalid / expired token', async () => {
    jwt.verifyAsync.mockRejectedValueOnce(new Error('bad token'));
    await expect(
      controller.analyze(req('t'), res(), { fen: START_FEN }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a non-access token type', async () => {
    jwt.verifyAsync.mockResolvedValueOnce({ type: 'refresh', sub: 'user_1', role: 'COACH' });
    await expect(
      controller.analyze(req('t'), res(), { fen: START_FEN }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('forbids a student', async () => {
    jwt.verifyAsync.mockResolvedValueOnce({ type: 'access', sub: 'user_1', role: 'STUDENT' });
    await expect(
      controller.analyze(req('t'), res(), { fen: START_FEN }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(stockfish.analyzePosition).not.toHaveBeenCalled();
  });

  it('rejects a malformed FEN before touching the engine', async () => {
    await expect(
      controller.analyze(req('t'), res(), { fen: 'not-a-fen' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(stockfish.analyzePosition).not.toHaveBeenCalled();
  });

  it('analyzes a valid position for a coach', async () => {
    const out = await controller.analyze(req('t'), res(), { fen: START_FEN });
    expect(out).toEqual(RESULT);
    expect(stockfish.analyzePosition).toHaveBeenCalledWith(START_FEN, {
      mode: undefined,
      signal: expect.any(AbortSignal),
    });
  });

  it('allows an admin', async () => {
    jwt.verifyAsync.mockResolvedValueOnce({ type: 'access', sub: 'user_1', role: 'ADMIN' });
    await expect(
      controller.analyze(req('t'), res(), { fen: START_FEN }),
    ).resolves.toEqual(RESULT);
  });

  it('propagates a 503 when the engine pool is unavailable', async () => {
    stockfish.analyzePosition.mockRejectedValueOnce(
      new ServiceUnavailableException('Engine analysis is not available on this server.'),
    );
    await expect(
      controller.analyze(req('t'), res(), { fen: START_FEN }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('aborts the engine search when the client disconnects before the answer', async () => {
    const response = res();
    let signal!: AbortSignal;
    stockfish.analyzePosition.mockImplementationOnce(
      (_fen: string, opts: { signal: AbortSignal }) => {
        signal = opts.signal;
        return new Promise(() => undefined);
      },
    );
    void controller.analyze(req('t'), response, { fen: START_FEN });
    await new Promise((r) => setImmediate(r));
    expect(signal.aborted).toBe(false);
    response.emit('close');
    expect(signal.aborted).toBe(true);
  });

  it('does not abort once the response has been fully written', async () => {
    const response = res();
    let signal!: AbortSignal;
    stockfish.analyzePosition.mockImplementationOnce(
      async (_fen: string, opts: { signal: AbortSignal }) => {
        signal = opts.signal;
        return RESULT;
      },
    );
    await controller.analyze(req('t'), response, { fen: START_FEN });
    (response as unknown as { writableFinished: boolean }).writableFinished = true;
    response.emit('close');
    expect(signal.aborted).toBe(false);
  });

  describe('analyze/stream', () => {
    const stream = (r: ReturnType<typeof sseRes>, fen = START_FEN) =>
      controller.analyzeStream(req('t'), r as unknown as Response, { fen });

    it('sends info frames as the search deepens, then done', async () => {
      stockfish.analyzePosition.mockImplementationOnce(
        async (_fen: string, opts: { onUpdate: (r: StockfishAnalysisResult) => void }) => {
          opts.onUpdate({ ...RESULT, depth: 5 });
          opts.onUpdate({ ...RESULT, depth: 12 });
          return RESULT;
        },
      );
      const r = sseRes();
      await stream(r);

      expect(r.headers['Content-Type']).toMatch(/^text\/event-stream/);
      expect(r.headers['X-Accel-Buffering']).toBe('no');
      expect(events(r)).toEqual([
        { type: 'info', result: { ...RESULT, depth: 5 } },
        { type: 'info', result: { ...RESULT, depth: 12 } },
        { type: 'done', result: RESULT },
      ]);
      expect(r.end).toHaveBeenCalled();
    });

    it('rejects a bad FEN with a 400 before any stream starts', async () => {
      const r = sseRes();
      await expect(stream(r, 'not-a-fen')).rejects.toBeInstanceOf(BadRequestException);
      expect(r.flushHeaders).not.toHaveBeenCalled();
    });

    it('answers 503 up front when the engine is not configured', async () => {
      stockfish.isAvailable.mockReturnValueOnce(false);
      const r = sseRes();
      await expect(stream(r)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(r.flushHeaders).not.toHaveBeenCalled();
    });

    it('turns a mid-stream engine failure into an error frame', async () => {
      stockfish.analyzePosition.mockRejectedValueOnce(
        new ServiceUnavailableException('The engine stopped unexpectedly. Please try again.'),
      );
      const r = sseRes();
      await stream(r);
      expect(events(r)).toEqual([
        { type: 'error', message: 'The engine stopped unexpectedly. Please try again.' },
      ]);
    });

    it('aborts the search and writes nothing more when the client goes away', async () => {
      let signal!: AbortSignal;
      stockfish.analyzePosition.mockImplementationOnce(
        (_fen: string, opts: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            signal = opts.signal;
            signal.addEventListener('abort', () => reject(new Error('Analysis aborted')));
          }),
      );
      const r = sseRes();
      const done = stream(r);
      await new Promise((resolve) => setImmediate(resolve));
      r.emit('close');
      await done;
      expect(signal.aborted).toBe(true);
      expect(r.chunks).toEqual([]);
    });
  });
});

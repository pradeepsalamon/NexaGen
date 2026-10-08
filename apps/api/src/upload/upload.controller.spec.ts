import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

describe('UploadController — uploadPgn (Save to cloud)', () => {
  let controller: UploadController;
  let uploadService: { uploadPgn: jest.Mock };
  let prisma: { user: { findUnique: jest.Mock } };

  const req = () => ({ cookies: { nexa_access_token: 't' } }) as unknown as Request;

  beforeEach(async () => {
    uploadService = {
      uploadPgn: jest.fn().mockResolvedValue({ secure_url: 'https://cdn/game.pgn' }),
    };
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', role: 'COACH', status: 'ACTIVE' }) },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [
        { provide: UploadService, useValue: uploadService },
        {
          provide: JwtService,
          useValue: {
            verifyAsync: jest.fn().mockResolvedValue({ type: 'access', sub: 'u1' }),
          },
        },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    controller = module.get(UploadController);
  });

  it('uploads a PGN and returns its URL', async () => {
    const out = await controller.uploadPgn('1. e4 e5 *', req(), 'game.pgn');
    expect(out).toEqual({ url: 'https://cdn/game.pgn' });
    expect(uploadService.uploadPgn).toHaveBeenCalledWith('1. e4 e5 *', 'game.pgn');
  });

  it('rejects an empty PGN', async () => {
    await expect(controller.uploadPgn('', req(), undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(uploadService.uploadPgn).not.toHaveBeenCalled();
  });

  it('rejects a PGN over the size cap', async () => {
    const huge = 'x'.repeat(512 * 1024 + 1);
    await expect(controller.uploadPgn(huge, req(), undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(uploadService.uploadPgn).not.toHaveBeenCalled();
  });

  it('rejects a student', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'STUDENT', status: 'ACTIVE' });
    await expect(controller.uploadPgn('1. e4 *', req(), 'game.pgn')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(uploadService.uploadPgn).not.toHaveBeenCalled();
  });
});

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

describe('UploadController — deleteImage', () => {
  const OWN = 'https://res.cloudinary.com/demo/image/upload/v1700000000/nexa_chess/profiles/abc123.jpg';
  const OTHER = 'https://res.cloudinary.com/demo/image/upload/v1700000000/nexa_chess/invoices/inv.png';
  let controller: UploadController;
  let deleteImage: jest.Mock;
  let me: { id: string; role: string; status: string; avatarUrl: string | null };
  let sharedWith: number;

  const req = () => ({ cookies: { nexa_access_token: 't' } }) as unknown as Request;

  beforeEach(async () => {
    deleteImage = jest.fn().mockResolvedValue(undefined);
    me = { avatarUrl: OWN, id: 'u1', role: 'STUDENT', status: 'ACTIVE' };
    sharedWith = 0;
    const user = {
      count: jest.fn(async () => sharedWith),
      findUnique: jest.fn(async () => me),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [
        {
          provide: UploadService,
          useValue: {
            deleteImage,
            isProfileImageUrl: (url: string) => new UploadService().isProfileImageUrl(url),
          },
        },
        { provide: JwtService, useValue: { verifyAsync: jest.fn().mockResolvedValue({ type: 'access', sub: 'u1' }) } },
        { provide: PrismaService, useValue: { user, withDeleted: { user } } },
      ],
    }).compile();
    controller = module.get(UploadController);
  });

  it('deletes the caller’s own profile upload', async () => {
    await expect(controller.deleteImage(OWN, req())).resolves.toEqual({ success: true });
    expect(deleteImage).toHaveBeenCalledWith(OWN);
  });

  it('refuses a URL that is not the caller’s avatar', async () => {
    me.avatarUrl = null;
    await expect(controller.deleteImage(OWN, req())).rejects.toBeInstanceOf(ForbiddenException);
    expect(deleteImage).not.toHaveBeenCalled();
  });

  it('refuses an avatar URL copied from another account', async () => {
    sharedWith = 1;
    await expect(controller.deleteImage(OWN, req())).rejects.toBeInstanceOf(ForbiddenException);
    expect(deleteImage).not.toHaveBeenCalled();
  });

  it('refuses a non-profile Cloudinary asset even when set as the avatar', async () => {
    me.avatarUrl = OTHER;
    await expect(controller.deleteImage(OTHER, req())).rejects.toBeInstanceOf(ForbiddenException);
    expect(deleteImage).not.toHaveBeenCalled();
  });

  it('lets an admin delete any image', async () => {
    me = { avatarUrl: null, id: 'u1', role: 'ADMIN', status: 'ACTIVE' };
    await expect(controller.deleteImage(OTHER, req())).resolves.toEqual({ success: true });
  });
});

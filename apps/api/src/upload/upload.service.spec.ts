import { ServiceUnavailableException } from '@nestjs/common';
import { UPLOADS_NOT_CONFIGURED, UploadService } from './upload.service';

describe('UploadService without Cloudinary credentials', () => {
  const KEYS = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] as const;
  const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};
  const service = new UploadService();
  const file = { buffer: Buffer.from('x') } as Express.Multer.File;

  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it.each([
    ['uploadPgn', () => service.uploadPgn('1. e4 e5', 'game.pgn')],
    ['uploadImage', () => service.uploadImage(file)],
    ['uploadActivityImage', () => service.uploadActivityImage(file)],
  ])('%s is a 503 "not set up", not the SDK error as a 400', (_name, run) => {
    expect(run).toThrow(ServiceUnavailableException);
    expect(run).toThrow(UPLOADS_NOT_CONFIGURED);
  });

  it('one missing key is enough to refuse', () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'demo';
    process.env.CLOUDINARY_API_KEY = 'key';
    expect(() => service.uploadPgn('1. e4', 'g.pgn')).toThrow(ServiceUnavailableException);
  });
});

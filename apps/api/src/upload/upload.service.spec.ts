import { ServiceUnavailableException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Writable } from 'stream';
import { runInTenant } from '../tenancy/tenant-context';
import { UPLOADS_NOT_CONFIGURED, UploadService } from './upload.service';

describe('UploadService without Cloudinary credentials', () => {
  const KEYS = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] as const;
  const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};
  const service = new UploadService({} as never);
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

describe('UploadService storage record', () => {
  const KEYS = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] as const;
  const file = { buffer: Buffer.from('x') } as Express.Multer.File;
  const uploadedFile = { deleteMany: jest.fn(), upsert: jest.fn() };
  const service = new UploadService({ uploadedFile } as never);
  let destroy: jest.SpyInstance;

  beforeEach(() => {
    for (const key of KEYS) process.env[key] = 'test';
    uploadedFile.deleteMany.mockReset().mockResolvedValue({ count: 1 });
    uploadedFile.upsert.mockReset().mockResolvedValue({});
    jest.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation(((options: { folder: string }, done: (e: undefined, r: unknown) => void) => {
      const sink = new Writable({ write: (_chunk, _encoding, next) => next() });
      sink.on('finish', () => done(undefined, { bytes: 4321, public_id: `${options.folder}/abc`, secure_url: 'https://x' }));
      return sink;
    }) as never);
    destroy = jest.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({} as never);
  });

  afterEach(() => {
    for (const key of KEYS) delete process.env[key];
    jest.restoreAllMocks();
  });

  it("records an upload's size under the academy that made it", async () => {
    await runInTenant('tenant_rook', 'spec', () => service.uploadImage(file));
    expect(uploadedFile.upsert).toHaveBeenCalledWith({
      create: { bytes: 4321, publicId: 'tenants/tenant_rook/profiles/abc', tenantId: 'tenant_rook' },
      update: { bytes: 4321 },
      where: { tenantId_publicId: { publicId: 'tenants/tenant_rook/profiles/abc', tenantId: 'tenant_rook' } },
    });
  });

  it('still returns the upload when the record cannot be written', async () => {
    uploadedFile.upsert.mockRejectedValue(new Error('db down'));
    const result = await runInTenant('tenant_rook', 'spec', () => service.uploadImage(file));
    expect(result.secure_url).toBe('https://x');
  });

  it('drops the record when the file is deleted', async () => {
    await service.deleteImage('https://res.cloudinary.com/test/image/upload/v1/tenants/tenant_rook/profiles/abc.png');
    expect(destroy).toHaveBeenCalledWith('tenants/tenant_rook/profiles/abc');
    expect(uploadedFile.deleteMany).toHaveBeenCalledWith({ where: { publicId: 'tenants/tenant_rook/profiles/abc' } });
  });
});

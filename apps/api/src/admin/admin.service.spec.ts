import { Test, TestingModule } from '@nestjs/testing';
import { formatDevDiagnostics } from '@nexa-chess/utils';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: Partial<PrismaService>;

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      } as any,
      coachProfile: {
        update: jest.fn(),
      } as any,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return dev environment status', () => {
    const status = service.getDevStatus();
    expect(status).toBeDefined();
    expect(status.status).toBe('ok');
    expect(status.service).toBe('api');
    expect(status.env).toBeDefined();
  });

  it('should format dev diagnostics string properly', () => {
    const formatted = formatDevDiagnostics({ nodeEnv: 'test', uptimeSeconds: 42 });
    expect(formatted).toContain('[DEV_DIAGNOSTIC]');
    expect(formatted).toContain('Environment: test');
    expect(formatted).toContain('Uptime: 42s');
  });
});



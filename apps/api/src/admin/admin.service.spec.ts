import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { TrashRepository } from '../trash/trash.repository';

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    const prismaService = {
      user: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      coachProfile: { update: jest.fn() },
      coachClass: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn()
      },
      $transaction: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prismaService },
        { provide: TrashRepository, useValue: { softDelete: jest.fn(), log: jest.fn() } }
      ]
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

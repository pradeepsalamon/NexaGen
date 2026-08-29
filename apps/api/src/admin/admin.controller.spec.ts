import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: Partial<AdminService>;
  let jwtService: Partial<JwtService>;
  let prisma: Partial<PrismaService>;

  beforeEach(async () => {
    adminService = {
      getPendingCoaches: jest.fn(),
      updateCoachStatus: jest.fn(),
      createDemoClass: jest.fn(),
      updateDemoClass: jest.fn(),
    };

    jwtService = {
      verifyAsync: jest.fn(),
    };

    prisma = {
      user: {
        findUnique: jest.fn(),
      } as any,
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: adminService },
        { provide: JwtService, useValue: jwtService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

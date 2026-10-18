import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AdminController', () => {
  let controller: AdminController;

  beforeEach(async () => {
    const adminService = {
      getPendingCoaches: jest.fn(),
      updateCoachStatus: jest.fn(),
      createDemoClass: jest.fn(),
      updateDemoClass: jest.fn(),
      cancelDemoClass: jest.fn(),
      restoreDemoClass: jest.fn(),
      listDemoClasses: jest.fn(),
      getDemoClassDetails: jest.fn(),
      listBatchClasses: jest.fn(),
      getBatchClassDetails: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: adminService },
        { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
        {
          provide: PrismaService,
          useValue: { user: { findUnique: jest.fn() } }
        }
      ]
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

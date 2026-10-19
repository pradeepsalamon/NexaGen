import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { TrashRepository } from '../trash/trash.repository';
import { MessagingDispatchService } from '../messaging/messaging-dispatch.service';
import { DemoInviteService } from '../demo-class/demo-invite.service';
import { UNLIMITED_ENTITLEMENTS } from "../platform/entitlement.testing";

describe('AdminService', () => {
  let service: AdminService;
  let prisma: { user: { findMany: jest.Mock; updateMany: jest.Mock } };
  let messaging: { dispatchInBackground: jest.Mock };

  beforeEach(async () => {
    const prismaService = {
      user: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
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
    // Interactive transactions run against the same mock client.
    prismaService.$transaction.mockImplementation((callback: (tx: typeof prismaService) => unknown) =>
      callback(prismaService)
    );
    messaging = { dispatchInBackground: jest.fn() };
    prisma = prismaService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: DemoInviteService, useValue: { addInvitees: jest.fn(), removeInvitee: jest.fn() } },
        { provide: MessagingDispatchService, useValue: messaging },
        { provide: PrismaService, useValue: prismaService },
        UNLIMITED_ENTITLEMENTS,
        {
          provide: TrashRepository,
          useValue: {
            cascadeSoftDelete: jest.fn(),
            log: jest.fn(),
            softDelete: jest.fn()
          }
        }
      ]
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateStudentStatus', () => {
    it('activates a pending student and sends the approval message', async () => {
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 });

      await expect(service.updateStudentStatus('stu-1', { status: 'ACTIVE' })).resolves.toEqual({ ok: true });

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'stu-1', role: 'STUDENT', status: 'PENDING' },
        data: { status: 'ACTIVE' }
      });
      expect(messaging.dispatchInBackground).toHaveBeenCalledWith({ event: 'ACCOUNT_APPROVED', userId: 'stu-1' });
    });

    it('archives a declined student without messaging', async () => {
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.updateStudentStatus('stu-1', { status: 'ARCHIVED' });

      expect(prisma.user.updateMany.mock.calls[0][0].data).toEqual({ status: 'ARCHIVED' });
      expect(messaging.dispatchInBackground).not.toHaveBeenCalled();
    });

    it('rejects a student that is not pending', async () => {
      prisma.user.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.updateStudentStatus('stu-1', { status: 'ACTIVE' })).rejects.toThrow(NotFoundException);
      expect(messaging.dispatchInBackground).not.toHaveBeenCalled();
    });
  });
});

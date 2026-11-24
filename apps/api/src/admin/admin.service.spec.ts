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
        update: jest.fn(),
        count: jest.fn()
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

    it('archives a declined student and sends the declined message', async () => {
      prisma.user.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.updateStudentStatus('stu-1', { status: 'ARCHIVED' });

      expect(prisma.user.updateMany.mock.calls[0][0].data).toEqual({ status: 'ARCHIVED' });
      expect(messaging.dispatchInBackground).toHaveBeenCalledWith({ event: 'ACCOUNT_DECLINED', userId: 'stu-1' });
    });

    it('rejects a student that is not pending', async () => {
      prisma.user.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.updateStudentStatus('stu-1', { status: 'ACTIVE' })).rejects.toThrow(NotFoundException);
      expect(messaging.dispatchInBackground).not.toHaveBeenCalled();
    });
  });

  describe('updateCoachStatus', () => {
    const coach = (status: string) => ({ coachProfile: { userId: 'coach-1' }, id: 'coach-1', role: 'COACH', status });

    it('sends the approval message when a pending coach is approved', async () => {
      (prisma.user as unknown as { findUnique: jest.Mock }).findUnique.mockResolvedValueOnce(coach('PENDING'));

      await service.updateCoachStatus('admin-1', 'coach-1', { status: 'ACTIVE' });

      expect(messaging.dispatchInBackground).toHaveBeenCalledWith({ event: 'ACCOUNT_APPROVED', userId: 'coach-1' });
    });

    it('sends the declined message when a pending coach is declined', async () => {
      (prisma.user as unknown as { findUnique: jest.Mock }).findUnique.mockResolvedValueOnce(coach('PENDING'));

      await service.updateCoachStatus('admin-1', 'coach-1', { status: 'ARCHIVED' });

      expect(messaging.dispatchInBackground).toHaveBeenCalledWith({ event: 'ACCOUNT_DECLINED', userId: 'coach-1' });
    });

    it('says nothing when the status does not really change', async () => {
      (prisma.user as unknown as { findUnique: jest.Mock }).findUnique.mockResolvedValueOnce(coach('ACTIVE'));

      await service.updateCoachStatus('admin-1', 'coach-1', { status: 'ACTIVE' });

      expect(messaging.dispatchInBackground).not.toHaveBeenCalled();
    });
  });

  describe('listDemoClasses', () => {
    const findMany = () => (prisma as unknown as { coachClass: { findMany: jest.Mock; count: jest.Mock } }).coachClass;

    beforeEach(() => {
      findMany().findMany.mockResolvedValue([]);
      findMany().count.mockResolvedValue(0);
    });

    it('limits the list to classes overlapping the [from, to) window', async () => {
      await service.listDemoClasses({
        from: '2026-11-24T00:00:00.000Z',
        status: 'SCHEDULED',
        to: '2026-12-01T00:00:00.000Z'
      });
      const where = findMany().findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        endsAt: { gt: new Date('2026-11-24T00:00:00.000Z') },
        isDemo: true,
        startsAt: { lt: new Date('2026-12-01T00:00:00.000Z') },
        status: 'SCHEDULED'
      });
      expect(findMany().count.mock.calls[0][0].where).toBe(where);
    });

    it('leaves the dates unfiltered without a window and refuses an unreadable one', async () => {
      await service.listDemoClasses({});
      const where = findMany().findMany.mock.calls[0][0].where;
      expect(where.startsAt).toBeUndefined();
      expect(where.endsAt).toBeUndefined();
      await expect(service.listDemoClasses({ from: 'soon' })).rejects.toThrow('from must be an ISO date-time.');
    });
  });
});

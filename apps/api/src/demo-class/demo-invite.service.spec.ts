import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { ClassStatus } from "@prisma/client";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { DemoInviteService, demoInvitePath } from "./demo-invite.service";

describe("DemoInviteService", () => {
  let service: DemoInviteService;
  let prisma: {
    coachClass: { findUnique: jest.Mock };
    lead: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    demoClassRegistration: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
    $transaction: jest.Mock;
  };
  let sendDemoClassInvitation: jest.Mock;
  let trySendText: jest.Mock;

  const DEMO_CLASS = {
    id: "class-1",
    isDemo: true,
    status: ClassStatus.SCHEDULED,
    topic: "Trial",
    startsAt: new Date("2026-10-03T10:00:00Z"),
    coach: { firstName: "Cora", lastName: "Coach" }
  };

  beforeEach(async () => {
    prisma = {
      coachClass: { findUnique: jest.fn().mockResolvedValue(DEMO_CLASS) },
      lead: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), update: jest.fn() },
      demoClassRegistration: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn(),
        delete: jest.fn()
      },
      $transaction: jest.fn()
    };
    prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
    sendDemoClassInvitation = jest.fn().mockResolvedValue(undefined);
    trySendText = jest.fn().mockResolvedValue({ ok: true });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DemoInviteService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: { sendDemoClassInvitation } },
        {
          provide: WhatsAppService,
          useValue: {
            normalizeRecipient: (raw: string) => (raw ? `91${raw.replace(/\D/g, "").slice(-10)}` : null),
            trySendText
          }
        }
      ]
    }).compile();

    service = module.get(DemoInviteService);
  });

  it("normalizes national and +CC phone numbers to the same key", () => {
    expect(service.normalizeContact("PHONE", "+91 98765 43210")).toBe(
      service.normalizeContact("PHONE", "9876543210")
    );
    expect(service.normalizeContact("EMAIL", " Ravi@Example.com ")).toBe("ravi@example.com");
  });

  it("adds a new invitee with a personal token and emails them their link", async () => {
    const result = await service.addInvitees("class-1", "admin-1", {
      invitees: [{ name: "Ravi", contactMethod: "EMAIL", email: "ravi@example.com" }]
    });

    expect(result).toEqual({ added: 1, skipped: 0 });
    const data = prisma.demoClassRegistration.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ source: "INVITE", contactValue: "ravi@example.com", invitedById: "admin-1" });
    expect(data.inviteToken).toEqual(expect.any(String));
    await Promise.resolve();
    expect(sendDemoClassInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ joinUrl: expect.stringContaining(demoInvitePath("class-1", data.inviteToken)) })
    );
  });

  it("does not notify when asked not to", async () => {
    await service.addInvitees("class-1", "admin-1", {
      invitees: [{ name: "Asha", contactMethod: "PHONE", phoneNumber: "9876543210" }],
      notify: false
    });
    await Promise.resolve();
    expect(trySendText).not.toHaveBeenCalled();
  });

  it("approves a guest waiting for admission instead of duplicating them", async () => {
    prisma.demoClassRegistration.findUnique.mockResolvedValue({
      id: "reg-1",
      source: "SELF",
      approval: "PENDING",
      inviteToken: null,
      invitedById: null,
      leadId: null
    });

    const result = await service.addInvitees("class-1", "admin-1", {
      invitees: [{ name: "Asha", contactMethod: "PHONE", phoneNumber: "9876543210" }]
    });

    expect(result).toEqual({ added: 0, skipped: 1 });
    expect(prisma.demoClassRegistration.create).not.toHaveBeenCalled();
    expect(prisma.demoClassRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ approval: "APPROVED", source: "INVITE" }) })
    );
  });

  it("books leads and fails the whole call if one id is unknown", async () => {
    prisma.lead.findMany.mockResolvedValue([{ id: "lead-1", studentName: "Kid", phone: "9876543210", status: "NEW" }]);
    await expect(
      service.addInvitees("class-1", "admin-1", { leadIds: ["lead-1", "lead-404"] })
    ).rejects.toThrow(BadRequestException);

    const result = await service.addInvitees("class-1", "admin-1", { leadIds: ["lead-1"] });
    expect(result.added).toBe(1);
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ assignedClassId: "class-1", status: "DEMO_SCHEDULED" }) })
    );
  });

  it("refuses to invite into a finished class", async () => {
    prisma.coachClass.findUnique.mockResolvedValue({ ...DEMO_CLASS, status: ClassStatus.COMPLETED });
    await expect(
      service.addInvitees("class-1", "admin-1", { leadIds: ["lead-1"] })
    ).rejects.toThrow(BadRequestException);
  });

  it("removes an invitee and unassigns their lead from this class", async () => {
    prisma.demoClassRegistration.findUnique.mockResolvedValue({
      id: "reg-1",
      classId: "class-1",
      leadId: "lead-1",
      joinedAt: null,
      class: { isDemo: true, topic: "Trial" }
    });
    prisma.lead.findUnique.mockResolvedValue({ id: "lead-1", assignedClassId: "class-1" });

    await service.removeInvitee("class-1", "reg-1", "admin-1");

    expect(prisma.demoClassRegistration.delete).toHaveBeenCalledWith({ where: { id: "reg-1" } });
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ assignedClassId: null }) })
    );
  });

  it("keeps a guest who already joined", async () => {
    prisma.demoClassRegistration.findUnique.mockResolvedValue({
      id: "reg-1",
      classId: "class-1",
      joinedAt: new Date(),
      class: { isDemo: true }
    });
    await expect(service.removeInvitee("class-1", "reg-1", "admin-1")).rejects.toThrow(ConflictException);
  });
});

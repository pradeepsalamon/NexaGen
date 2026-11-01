import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ClassStatus, DemoClassAccessMode, DemoGuestApproval, DemoRegistrationContactMethod } from "@prisma/client";
import type { GuestJoinDemoRequest } from "@nexa-chess/types";
import { LiveClassDemoService } from "./live-class-demo.service";
import { LIVE_CLASS_SERVICES } from "./live-class.testing";
import { readDemoGuestToken } from "./demo-guest-token";
import { LiveKitService } from "./livekit.service";
import { AttendanceService } from "../attendance/attendance.service";
import { BackupService } from "../backup/backup.service";
import { RecordingStorageService } from "./recording-storage.service";
import { LiveClassSettingsService } from "./live-class-settings.service";
import { AnalyticsEventService } from "../analytics/analytics-event.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { MailService } from "../mail/mail.service";
import { SystemMessageRenderer } from "../mail/system-message-renderer.service";
import { JobLockService } from "../prisma/job-lock.service";
import { createJobLockStub } from "../prisma/job-lock.testing";
import { PrismaService } from "../prisma/prisma.service";
import { LiveSessionStatus } from "./types/live-class.types";

describe("LiveClassDemoService.joinDemoClass", () => {
  let service: LiveClassDemoService;
  let coachClassFindUnique: jest.Mock;
  let registrationFindUnique: jest.Mock;
  let registrationCreate: jest.Mock;
  let registrationUpdate: jest.Mock;
  let generateAccessToken: jest.Mock;
  let normalizeRecipient: jest.Mock;
  let trySendText: jest.Mock;
  let sendDemoClassRegistrationConfirmation: jest.Mock;
  let broadcastData: jest.Mock;
  let leadUpdateMany: jest.Mock;

  const DEMO_CLASS = {
    id: "class-1",
    isDemo: true,
    status: ClassStatus.SCHEDULED,
    topic: "Rook Endgames",
    title: null,
    startsAt: new Date("2026-09-25T10:00:00.000Z"),
    demoAccessMode: DemoClassAccessMode.PUBLIC as DemoClassAccessMode,
    demoPasscode: null as string | null,
    liveSession: null as { id: string; status: LiveSessionStatus; roomName: string } | null
  };

  const phoneRequest: GuestJoinDemoRequest = {
    guestName: "Asha",
    contactMethod: "PHONE",
    phoneNumber: "+919876543210"
  };

  const emailRequest: GuestJoinDemoRequest = {
    guestName: "Ravi",
    contactMethod: "EMAIL",
    email: "ravi@example.com"
  };

  beforeEach(async () => {
    coachClassFindUnique = jest.fn().mockResolvedValue(DEMO_CLASS);
    registrationFindUnique = jest.fn().mockResolvedValue(null);
    registrationCreate = jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "reg-1", joinedAt: null, createdAt: new Date(), ...data })
    );
    registrationUpdate = jest.fn().mockResolvedValue(undefined);
    generateAccessToken = jest.fn().mockResolvedValue("livekit-token");
    normalizeRecipient = jest.fn().mockImplementation((raw: string) => raw || null);
    trySendText = jest.fn().mockResolvedValue({ ok: true });
    sendDemoClassRegistrationConfirmation = jest.fn().mockResolvedValue(undefined);
    broadcastData = jest.fn().mockResolvedValue(undefined);
    leadUpdateMany = jest.fn().mockResolvedValue({ count: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...LIVE_CLASS_SERVICES,
        { provide: JobLockService, useValue: createJobLockStub() },
        {
          provide: PrismaService,
          useValue: {
            coachClass: { findUnique: coachClassFindUnique },
            demoClassRegistration: {
              findUnique: registrationFindUnique,
              create: registrationCreate,
              update: registrationUpdate
            },
            lead: { updateMany: leadUpdateMany },
            leadActivity: { create: jest.fn().mockResolvedValue(undefined) }
          }
        },
        { provide: JwtService, useValue: new JwtService({}) },
        { provide: LiveKitService, useValue: { generateAccessToken, broadcastData } },
        { provide: AttendanceService, useValue: {} },
        { provide: BackupService, useValue: {} },
        { provide: RecordingStorageService, useValue: {} },
        { provide: LiveClassSettingsService, useValue: {} },
        { provide: AnalyticsEventService, useValue: {} },
        { provide: WhatsAppService, useValue: { normalizeRecipient, trySendText } },
        { provide: MailService, useValue: { sendDemoClassRegistrationConfirmation } },
        { provide: SystemMessageRenderer, useValue: { render: jest.fn().mockResolvedValue({ body: "Registered" }) } }
      ]
    }).compile();

    service = module.get(LiveClassDemoService);
  });

  it("rejects a class that is not a demo class", async () => {
    coachClassFindUnique.mockResolvedValue({ ...DEMO_CLASS, isDemo: false });
    await expect(service.joinDemoClass("class-1", phoneRequest)).rejects.toThrow(NotFoundException);
  });

  it("rejects a cancelled demo class", async () => {
    coachClassFindUnique.mockResolvedValue({ ...DEMO_CLASS, status: ClassStatus.CANCELLED });
    await expect(service.joinDemoClass("class-1", phoneRequest)).rejects.toThrow(NotFoundException);
  });

  it("rejects a completed demo class", async () => {
    coachClassFindUnique.mockResolvedValue({ ...DEMO_CLASS, status: ClassStatus.COMPLETED });
    await expect(service.joinDemoClass("class-1", phoneRequest)).rejects.toThrow(NotFoundException);
  });

  it("registers a phone guest ahead of time and reports it is not joinable yet", async () => {
    const result = await service.joinDemoClass("class-1", phoneRequest);

    expect(result.registered).toBe(true);
    expect(result.joined).toBe(false);
    expect(result.token).toBeNull();
    expect(result.startsAt).toBe(DEMO_CLASS.startsAt.toISOString());
    expect(registrationCreate).toHaveBeenCalledTimes(1);
    expect(registrationCreate.mock.calls[0][0].data).toMatchObject({
      classId: "class-1",
      name: "Asha",
      contactMethod: DemoRegistrationContactMethod.PHONE
    });
    // Best-effort confirmation is fired for a first-time registration.
    await new Promise(setImmediate);
    expect(trySendText).toHaveBeenCalledTimes(1);
    expect(sendDemoClassRegistrationConfirmation).not.toHaveBeenCalled();
  });

  it("registers an email guest and sends the confirmation by email instead of WhatsApp", async () => {
    await service.joinDemoClass("class-1", emailRequest);
    await Promise.resolve();

    expect(registrationCreate.mock.calls[0][0].data).toMatchObject({
      contactMethod: DemoRegistrationContactMethod.EMAIL,
      email: "ravi@example.com"
    });
    expect(sendDemoClassRegistrationConfirmation).toHaveBeenCalledTimes(1);
    expect(trySendText).not.toHaveBeenCalled();
  });

  it("reuses an existing registration for the same class+contact instead of creating a duplicate or re-sending the confirmation", async () => {
    const existing = {
      id: "reg-1",
      name: "Asha",
      contactMethod: DemoRegistrationContactMethod.PHONE,
      contactValue: "+919876543210",
      phoneNumber: "+919876543210",
      email: null,
      joinedAt: null
    };
    registrationFindUnique.mockResolvedValue(existing);

    await service.joinDemoClass("class-1", phoneRequest);
    await Promise.resolve();

    expect(registrationCreate).not.toHaveBeenCalled();
    expect(trySendText).not.toHaveBeenCalled();
  });

  it("mints a LiveKit token and marks the registration joined once the class is live", async () => {
    coachClassFindUnique.mockResolvedValue({
      ...DEMO_CLASS,
      liveSession: { id: "session-1", status: LiveSessionStatus.LIVE, roomName: "room-1" }
    });

    const result = await service.joinDemoClass("class-1", phoneRequest);

    expect(result.joined).toBe(true);
    expect(result.token).toBe("livekit-token");
    // The guest's credential for the in-room routes a guest may call, bound to this class.
    await expect(readDemoGuestToken(new JwtService({}), result.guestToken ?? undefined)).resolves.toMatchObject({
      classId: "class-1",
      sub: "reg-1",
      type: "demo_guest"
    });
    expect(result.roomName).toBe("room-1");
    expect(generateAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ roomName: "room-1", participantName: "Asha", isCoach: false })
    );
    expect(registrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "reg-1" }, data: { joinedAt: expect.any(Date) } })
    );
  });

  it("rejects a demo class whose session has already ended", async () => {
    coachClassFindUnique.mockResolvedValue({
      ...DEMO_CLASS,
      liveSession: { id: "session-1", status: LiveSessionStatus.ENDED, roomName: "room-1" }
    });

    await expect(service.joinDemoClass("class-1", phoneRequest)).rejects.toThrow(NotFoundException);
  });

  const LIVE = { id: "session-1", status: LiveSessionStatus.LIVE, roomName: "room-1" };

  describe("passcode classes", () => {
    beforeEach(() => {
      coachClassFindUnique.mockResolvedValue({
        ...DEMO_CLASS,
        demoAccessMode: DemoClassAccessMode.PASSCODE,
        demoPasscode: "KNIGHT7"
      });
    });

    it("refuses a new guest without the right passcode and registers nothing", async () => {
      await expect(
        service.joinDemoClass("class-1", { ...phoneRequest, passcode: "wrong" })
      ).rejects.toThrow(ForbiddenException);
      await expect(service.joinDemoClass("class-1", phoneRequest)).rejects.toThrow(ForbiddenException);
      expect(registrationCreate).not.toHaveBeenCalled();
    });

    it("accepts the passcode case-insensitively", async () => {
      const result = await service.joinDemoClass("class-1", { ...phoneRequest, passcode: "knight7" });
      expect(result.registered).toBe(true);
      expect(registrationCreate).toHaveBeenCalledTimes(1);
    });

    it("lets an already-registered (e.g. invited) contact in without the passcode", async () => {
      registrationFindUnique.mockResolvedValue({ id: "reg-1", name: "Asha", approval: DemoGuestApproval.APPROVED, joinedAt: null });
      const result = await service.joinDemoClass("class-1", phoneRequest);
      expect(result.registered).toBe(true);
    });
  });

  describe("invite-only classes", () => {
    it("files an uninvited guest as PENDING and asks the coach instead of minting a token", async () => {
      coachClassFindUnique.mockResolvedValue({
        ...DEMO_CLASS,
        demoAccessMode: DemoClassAccessMode.INVITE_ONLY,
        liveSession: LIVE
      });

      const result = await service.joinDemoClass("class-1", phoneRequest);

      expect(result.awaitingApproval).toBe(true);
      expect(result.token).toBeNull();
      expect(registrationCreate.mock.calls[0][0].data).toMatchObject({ approval: DemoGuestApproval.PENDING });
      expect(generateAccessToken).not.toHaveBeenCalled();
      expect(broadcastData).toHaveBeenCalledTimes(1);
      // No confirmation goes out for a request the coach hasn't accepted.
      await Promise.resolve();
      expect(trySendText).not.toHaveBeenCalled();
    });

    it("does not re-announce a pending guest who is polling", async () => {
      coachClassFindUnique.mockResolvedValue({
        ...DEMO_CLASS,
        demoAccessMode: DemoClassAccessMode.INVITE_ONLY,
        liveSession: LIVE
      });
      registrationFindUnique.mockResolvedValue({
        id: "reg-1", name: "Asha", approval: DemoGuestApproval.PENDING, createdAt: new Date(), joinedAt: null
      });

      const result = await service.joinDemoClass("class-1", phoneRequest);
      expect(result.awaitingApproval).toBe(true);
      expect(broadcastData).not.toHaveBeenCalled();
    });

    it("joins a guest the coach admitted", async () => {
      coachClassFindUnique.mockResolvedValue({
        ...DEMO_CLASS,
        demoAccessMode: DemoClassAccessMode.INVITE_ONLY,
        liveSession: LIVE
      });
      registrationFindUnique.mockResolvedValue({
        id: "reg-1", name: "Asha", approval: DemoGuestApproval.APPROVED, joinedAt: null, leadId: null
      });

      const result = await service.joinDemoClass("class-1", phoneRequest);
      expect(result.joined).toBe(true);
    });

    it("refuses a guest the coach denied", async () => {
      registrationFindUnique.mockResolvedValue({ id: "reg-1", name: "Asha", approval: DemoGuestApproval.DENIED, joinedAt: null });
      await expect(service.joinDemoClass("class-1", phoneRequest)).rejects.toThrow(ForbiddenException);
    });
  });

  describe("personal invite links", () => {
    it("admits by token with no contact details, using the invited name", async () => {
      coachClassFindUnique.mockResolvedValue({
        ...DEMO_CLASS,
        demoAccessMode: DemoClassAccessMode.INVITE_ONLY,
        liveSession: LIVE
      });
      registrationFindUnique.mockResolvedValue({
        id: "reg-9", classId: "class-1", name: "Meera", approval: DemoGuestApproval.APPROVED, joinedAt: null, leadId: "lead-1"
      });

      const result = await service.joinDemoClass("class-1", { inviteToken: "tok" });

      expect(registrationFindUnique).toHaveBeenCalledWith({ where: { inviteToken: "tok" } });
      expect(result.joined).toBe(true);
      expect(generateAccessToken).toHaveBeenCalledWith(expect.objectContaining({ participantName: "Meera" }));
      // A booked lead who actually joins moves to DEMO_ATTENDED.
      await Promise.resolve();
      expect(leadUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: "lead-1" }), data: expect.objectContaining({ status: "DEMO_ATTENDED" }) })
      );
    });

    it("rejects a token that belongs to a different class", async () => {
      registrationFindUnique.mockResolvedValue({ id: "reg-9", classId: "other-class", name: "Meera" });
      await expect(service.joinDemoClass("class-1", { inviteToken: "tok" })).rejects.toThrow(ForbiddenException);
    });
  });
});

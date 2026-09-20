import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ClassStatus, DemoRegistrationContactMethod } from "@prisma/client";
import type { GuestJoinDemoRequest } from "@nexa-chess/types";
import { LiveClassService } from "./live-class.service";
import { LiveKitService } from "./livekit.service";
import { AttendanceService } from "../attendance/attendance.service";
import { BackupService } from "../backup/backup.service";
import { RecordingStorageService } from "./recording-storage.service";
import { LiveClassSettingsService } from "./live-class-settings.service";
import { AnalyticsEventService } from "../analytics/analytics-event.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { LiveSessionStatus } from "./types/live-class.types";

describe("LiveClassService.joinDemoClass", () => {
  let service: LiveClassService;
  let coachClassFindUnique: jest.Mock;
  let registrationFindUnique: jest.Mock;
  let registrationCreate: jest.Mock;
  let registrationUpdate: jest.Mock;
  let generateAccessToken: jest.Mock;
  let normalizeRecipient: jest.Mock;
  let trySendText: jest.Mock;
  let sendDemoClassRegistrationConfirmation: jest.Mock;

  const DEMO_CLASS = {
    id: "class-1",
    isDemo: true,
    status: ClassStatus.SCHEDULED,
    topic: "Rook Endgames",
    title: null,
    startsAt: new Date("2026-09-25T10:00:00.000Z"),
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
      Promise.resolve({ id: "reg-1", joinedAt: null, ...data })
    );
    registrationUpdate = jest.fn().mockResolvedValue(undefined);
    generateAccessToken = jest.fn().mockResolvedValue("livekit-token");
    normalizeRecipient = jest.fn().mockImplementation((raw: string) => raw || null);
    trySendText = jest.fn().mockResolvedValue({ ok: true });
    sendDemoClassRegistrationConfirmation = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiveClassService,
        {
          provide: PrismaService,
          useValue: {
            coachClass: { findUnique: coachClassFindUnique },
            demoClassRegistration: {
              findUnique: registrationFindUnique,
              create: registrationCreate,
              update: registrationUpdate
            }
          }
        },
        { provide: JwtService, useValue: {} },
        { provide: LiveKitService, useValue: { generateAccessToken } },
        { provide: AttendanceService, useValue: {} },
        { provide: BackupService, useValue: {} },
        { provide: RecordingStorageService, useValue: {} },
        { provide: LiveClassSettingsService, useValue: {} },
        { provide: AnalyticsEventService, useValue: {} },
        { provide: WhatsAppService, useValue: { normalizeRecipient, trySendText } },
        { provide: MailService, useValue: { sendDemoClassRegistrationConfirmation } }
      ]
    }).compile();

    service = module.get<LiveClassService>(LiveClassService);
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
    await Promise.resolve();
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
});

import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ClassStatus, UserRole, UserStatus } from "@prisma/client";
import { CLASS_EARLY_START_MINUTES } from "@nexa-chess/types";
import { LiveClassService } from "./live-class.service";
import { LIVE_CLASS_SERVICES } from "./live-class.testing";
import { LiveKitService } from "./livekit.service";
import { AttendanceService } from "../attendance/attendance.service";
import { BackupService } from "../backup/backup.service";
import { RecordingStorageService } from "./recording-storage.service";
import { LiveClassSettingsService } from "./live-class-settings.service";
import { AnalyticsEventService } from "../analytics/analytics-event.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { MailService } from "../mail/mail.service";
import { JobLockService } from "../prisma/job-lock.service";
import { createJobLockStub } from "../prisma/job-lock.testing";
import { PrismaService } from "../prisma/prisma.service";

const MINUTE = 60_000;

describe("LiveClassService.startClass start window", () => {
  let service: LiveClassService;
  let classFindUnique: jest.Mock;
  let classUpdate: jest.Mock;
  let sessionCreate: jest.Mock;

  const scheduled = (startsInMs: number, status: ClassStatus = ClassStatus.SCHEDULED) => ({
    id: "class-1",
    batchId: "batch-1",
    coachId: "coach-1",
    status,
    startsAt: new Date(Date.now() + startsInMs),
    endsAt: new Date(Date.now() + startsInMs + 60 * MINUTE)
  });

  beforeEach(async () => {
    classFindUnique = jest.fn();
    classUpdate = jest.fn().mockResolvedValue({});
    sessionCreate = jest.fn().mockResolvedValue({ id: "session-1", settingsSnapshotAt: new Date() });

    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "coach-1",
          role: UserRole.COACH,
          status: UserStatus.ACTIVE
        })
      },
      coachClass: { findUnique: classFindUnique, update: classUpdate },
      liveSession: { findUnique: jest.fn().mockResolvedValue(null), create: sessionCreate }
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...LIVE_CLASS_SERVICES,
        { provide: JobLockService, useValue: createJobLockStub() },
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { verifyAsync: jest.fn().mockResolvedValue({ sub: "coach-1", type: "access" }) } },
        {
          provide: LiveKitService,
          useValue: {
            createRoom: jest.fn().mockResolvedValue({ sid: "RM_1" }),
            generateRoomName: jest.fn().mockReturnValue("room-1")
          }
        },
        { provide: AttendanceService, useValue: {} },
        { provide: BackupService, useValue: {} },
        { provide: RecordingStorageService, useValue: {} },
        { provide: WhatsAppService, useValue: {} },
        { provide: MailService, useValue: {} },
        { provide: LiveClassSettingsService, useValue: {} },
        { provide: AnalyticsEventService, useValue: {} }
      ]
    }).compile();

    service = module.get(LiveClassService);
  });

  it("refuses a class that is days away, so it can never end up COMPLETED early", async () => {
    classFindUnique.mockResolvedValue(scheduled(2 * 24 * 60 * MINUTE));

    await expect(service.startClass("token", "class-1")).rejects.toBeInstanceOf(BadRequestException);
    expect(sessionCreate).not.toHaveBeenCalled();
    expect(classUpdate).not.toHaveBeenCalled();
  });

  it("reports when the room opens", async () => {
    const cls = scheduled(3 * 60 * MINUTE);
    classFindUnique.mockResolvedValue(cls);

    const error = await service.startClass("token", "class-1").catch((e: BadRequestException) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: "CLASS_START_TOO_EARLY",
      opensAt: new Date(cls.startsAt.getTime() - CLASS_EARLY_START_MINUTES * MINUTE).toISOString()
    });
  });

  it("starts inside the early-start window", async () => {
    classFindUnique.mockResolvedValue(scheduled((CLASS_EARLY_START_MINUTES - 5) * MINUTE));

    await service.startClass("token", "class-1");

    expect(classUpdate).toHaveBeenCalledWith({
      where: { id: "class-1" },
      data: { status: ClassStatus.LIVE }
    });
  });

  it("refuses a class whose scheduled window has already passed", async () => {
    classFindUnique.mockResolvedValue(scheduled(-2 * 60 * MINUTE));

    const error = await service.startClass("token", "class-1").catch((e: BadRequestException) => e);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: "CLASS_START_WINDOW_PASSED"
    });
  });
});

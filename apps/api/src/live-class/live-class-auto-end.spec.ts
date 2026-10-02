import { Test, TestingModule } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
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

type SweepInternals = {
  env: Record<string, unknown>;
  internalEndClass: (classId: string, sessionId: string, roomName: string) => Promise<void>;
  sweepStaleClasses: () => Promise<void>;
};

const MINUTE = 60_000;

describe("LiveClassService auto-end sweep", () => {
  let internals: SweepInternals;
  let endSpy: jest.SpyInstance;
  let findMany: jest.Mock;
  let update: jest.Mock;
  let listParticipants: jest.Mock;

  const session = (overrides: { endsInMs: number; coachAbsentSince?: Date | null }) => ({
    id: "session-1",
    classId: "class-1",
    coachId: "coach-1",
    roomName: "room-1",
    coachAbsentSince: overrides.coachAbsentSince ?? null,
    class: { endsAt: new Date(Date.now() + overrides.endsInMs) }
  });

  beforeEach(async () => {
    findMany = jest.fn();
    update = jest.fn().mockResolvedValue({});
    listParticipants = jest.fn().mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiveClassService,
        { provide: PrismaService, useValue: { liveSession: { findMany, update } } },
        { provide: JwtService, useValue: {} },
        { provide: LiveKitService, useValue: { listParticipants } },
        { provide: AttendanceService, useValue: {} },
        { provide: BackupService, useValue: {} },
        { provide: RecordingStorageService, useValue: {} },
        { provide: WhatsAppService, useValue: {} },
        { provide: MailService, useValue: {} },
        { provide: LiveClassSettingsService, useValue: {} },
        { provide: AnalyticsEventService, useValue: {} }
      ]
    }).compile();

    internals = module.get(LiveClassService) as unknown as SweepInternals;
    internals.env = {
      ...internals.env,
      LIVE_CLASS_COACH_ABSENT_GRACE_MINUTES: 10,
      LIVE_CLASS_MAX_OVERRUN_MINUTES: 60
    };
    endSpy = jest.spyOn(internals, "internalEndClass").mockResolvedValue(undefined);
  });

  it("starts the absence clock the first time the coach is missing mid-class", async () => {
    findMany.mockResolvedValue([session({ endsInMs: 30 * MINUTE })]);

    await internals.sweepStaleClasses();

    expect(update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: { coachAbsentSince: expect.any(Date) }
    });
    expect(endSpy).not.toHaveBeenCalled();
  });

  it("keeps the class open while the coach is inside the grace period", async () => {
    findMany.mockResolvedValue([
      session({ endsInMs: 30 * MINUTE, coachAbsentSince: new Date(Date.now() - 5 * MINUTE) })
    ]);

    await internals.sweepStaleClasses();

    expect(endSpy).not.toHaveBeenCalled();
  });

  it("ends the class once the coach has been gone past the grace period", async () => {
    findMany.mockResolvedValue([
      session({ endsInMs: 30 * MINUTE, coachAbsentSince: new Date(Date.now() - 11 * MINUTE) })
    ]);

    await internals.sweepStaleClasses();

    expect(endSpy).toHaveBeenCalledWith("class-1", "session-1", "room-1");
  });

  it("clears the absence clock when the coach comes back", async () => {
    listParticipants.mockResolvedValue([{ identity: "coach-1_tab2" }]);
    findMany.mockResolvedValue([
      session({ endsInMs: 30 * MINUTE, coachAbsentSince: new Date(Date.now() - 11 * MINUTE) })
    ]);

    await internals.sweepStaleClasses();

    expect(update).toHaveBeenCalledWith({ where: { id: "session-1" }, data: { coachAbsentSince: null } });
    expect(endSpy).not.toHaveBeenCalled();
  });

  it("ends immediately after the scheduled end when the coach is gone", async () => {
    findMany.mockResolvedValue([session({ endsInMs: -1 * MINUTE })]);

    await internals.sweepStaleClasses();

    expect(endSpy).toHaveBeenCalled();
  });

  it("ends a class past the maximum overrun even with the coach present", async () => {
    listParticipants.mockResolvedValue([{ identity: "coach-1" }]);
    findMany.mockResolvedValue([session({ endsInMs: -61 * MINUTE })]);

    await internals.sweepStaleClasses();

    expect(endSpy).toHaveBeenCalled();
  });

  it("does not treat a LiveKit outage as an empty room", async () => {
    listParticipants.mockRejectedValue(new Error("livekit down"));
    findMany.mockResolvedValue([
      session({ endsInMs: 30 * MINUTE, coachAbsentSince: new Date(Date.now() - 30 * MINUTE) })
    ]);

    await internals.sweepStaleClasses();

    expect(endSpy).not.toHaveBeenCalled();
  });

  it("never auto-ends mid-class when the grace period is disabled", async () => {
    internals.env = { ...internals.env, LIVE_CLASS_COACH_ABSENT_GRACE_MINUTES: 0 };
    findMany.mockResolvedValue([
      session({ endsInMs: 30 * MINUTE, coachAbsentSince: new Date(Date.now() - 300 * MINUTE) })
    ]);

    await internals.sweepStaleClasses();

    expect(endSpy).not.toHaveBeenCalled();
  });
});

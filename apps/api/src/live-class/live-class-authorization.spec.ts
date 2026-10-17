import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole, UserStatus } from "@prisma/client";
import { liveClassSettingsSchema } from "@nexa-chess/types";
import { LiveClassService } from "./live-class.service";
import { LiveClassChatService } from "./live-class-chat.service";
import { LiveClassModerationService } from "./live-class-moderation.service";
import { LiveClassScreenShareService } from "./live-class-screen-share.service";
import { LiveClassWaitingRoomService } from "./live-class-waiting-room.service";
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

const ACCESS_TOKEN = "access-token";

describe("LiveClassChatService chat authorization", () => {
  let service: LiveClassChatService;
  let jwtService: { verifyAsync: jest.Mock };
  let userFindUnique: jest.Mock;
  let liveSessionFindUnique: jest.Mock;
  let chatFindMany: jest.Mock;
  let chatCreate: jest.Mock;

  // Who exists in the test world. `user.findUnique` answers by id so a private
  // message's recipient resolves to a different role than its sender.
  const DIRECTORY: Record<string, UserRole> = {
    "coach-1": UserRole.COACH,
    "coach-2": UserRole.COACH,
    "student-1": UserRole.STUDENT,
    "student-2": UserRole.STUDENT,
    "student-3": UserRole.STUDENT,
    "admin-1": UserRole.SUPER_ADMIN
  };

  const authenticateAs = (id: string, role: UserRole) => {
    jwtService.verifyAsync.mockResolvedValue({ sub: id, type: "access" });
    userFindUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      const found = where.id === id ? role : DIRECTORY[where.id];
      if (!found) return Promise.resolve(null);
      return Promise.resolve({
        id: where.id,
        role: found,
        status: UserStatus.ACTIVE,
        firstName: "Test",
        lastName: "User"
      });
    });
  };

  // A session owned by coach-1, for a batch containing student-1 and student-3.
  const session = {
    id: "session-1",
    classId: "class-1",
    coachId: "coach-1",
    roomName: "room-1",
    batch: { students: [{ studentId: "student-1" }, { studentId: "student-3" }] }
  };

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    userFindUnique = jest.fn();
    liveSessionFindUnique = jest.fn().mockResolvedValue(session);
    chatFindMany = jest.fn().mockResolvedValue([]);
    chatCreate = jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: "msg-1",
        senderName: "Test",
        senderRole: UserRole.STUDENT,
        recipientId: null,
        clientMessageId: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        ...data
      })
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...LIVE_CLASS_SERVICES,
        { provide: JobLockService, useValue: createJobLockStub() },
        {
          provide: PrismaService,
          useValue: {
            liveClassPull: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
            liveChatMessage: { create: chatCreate, findMany: chatFindMany },
            liveSession: { findUnique: liveSessionFindUnique },
            user: { findUnique: userFindUnique }
          }
        },
        { provide: JwtService, useValue: jwtService },
        { provide: LiveKitService, useValue: {} },
        { provide: AttendanceService, useValue: {} },
        { provide: BackupService, useValue: {} },
        { provide: RecordingStorageService, useValue: {} },
        { provide: WhatsAppService, useValue: {} },
        { provide: MailService, useValue: {} },
        {
          provide: LiveClassSettingsService,
          useValue: { resolveForClass: jest.fn().mockResolvedValue({ resolved: {} }) }
        },
        {
          provide: AnalyticsEventService,
          useValue: {
            record: jest.fn().mockResolvedValue(undefined),
            recordRecordingWatchOncePerDay: jest.fn().mockResolvedValue(undefined)
          }
        }
      ]
    }).compile();

    service = module.get(LiveClassChatService);
  });

  describe("getChatHistory", () => {
    it("rejects a student who is not enrolled in the batch", async () => {
      authenticateAs("student-2", UserRole.STUDENT);

      await expect(
        service.getChatHistory(ACCESS_TOKEN, "class-1")
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(chatFindMany).not.toHaveBeenCalled();
    });

    it("rejects a coach who does not own the class", async () => {
      authenticateAs("coach-2", UserRole.COACH);

      await expect(
        service.getChatHistory(ACCESS_TOKEN, "class-1")
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("allows an enrolled student", async () => {
      authenticateAs("student-1", UserRole.STUDENT);

      await expect(
        service.getChatHistory(ACCESS_TOKEN, "class-1")
      ).resolves.toEqual([]);
    });

    it("allows the owning coach and admins", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      await expect(
        service.getChatHistory(ACCESS_TOKEN, "class-1")
      ).resolves.toEqual([]);

      authenticateAs("admin-1", UserRole.SUPER_ADMIN);
      await expect(
        service.getChatHistory(ACCESS_TOKEN, "class-1")
      ).resolves.toEqual([]);
    });

    it("still 404s when there is no live session", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      liveSessionFindUnique.mockResolvedValue(null);

      await expect(
        service.getChatHistory(ACCESS_TOKEN, "class-1")
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("saveChatMessage", () => {
    it("rejects an outsider posting into the class", async () => {
      authenticateAs("student-2", UserRole.STUDENT);

      await expect(
        service.saveChatMessage(ACCESS_TOKEN, "class-1", "hello")
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(chatCreate).not.toHaveBeenCalled();
    });

    it("allows an enrolled student", async () => {
      authenticateAs("student-1", UserRole.STUDENT);

      await service.saveChatMessage(ACCESS_TOKEN, "class-1", "hello");

      expect(chatCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            liveSessionId: "session-1",
            message: "hello",
            senderId: "student-1",
            recipientId: null
          })
        })
      );
    });
  });

  describe("private messages (student <-> coach only)", () => {
    it("lets a student message the coach", async () => {
      authenticateAs("student-1", UserRole.STUDENT);

      await service.saveChatMessage(ACCESS_TOKEN, "class-1", "psst", undefined, "coach-1");

      expect(chatCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ senderId: "student-1", recipientId: "coach-1" })
        })
      );
    });

    it("lets the coach message a student back", async () => {
      authenticateAs("coach-1", UserRole.COACH);

      await service.saveChatMessage(ACCESS_TOKEN, "class-1", "sure", undefined, "student-1");

      expect(chatCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ senderId: "coach-1", recipientId: "student-1" })
        })
      );
    });

    it("refuses one student messaging another, even in the same batch", async () => {
      authenticateAs("student-1", UserRole.STUDENT);

      await expect(
        service.saveChatMessage(ACCESS_TOKEN, "class-1", "hey", undefined, "student-3")
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(chatCreate).not.toHaveBeenCalled();
    });

    it("refuses a recipient who is not in this class", async () => {
      authenticateAs("coach-1", UserRole.COACH);

      await expect(
        service.saveChatMessage(ACCESS_TOKEN, "class-1", "hey", undefined, "student-2")
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(chatCreate).not.toHaveBeenCalled();
    });

    it("refuses messaging yourself", async () => {
      authenticateAs("student-1", UserRole.STUDENT);

      await expect(
        service.saveChatMessage(ACCESS_TOKEN, "class-1", "hey", undefined, "student-1")
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("only reads back the threads the caller is party to", async () => {
      authenticateAs("student-1", UserRole.STUDENT);

      await service.getChatHistory(ACCESS_TOKEN, "class-1");

      expect(chatFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            liveSessionId: "session-1",
            OR: [
              { recipientId: null },
              { recipientId: "student-1" },
              { senderId: "student-1", recipientId: { not: null } }
            ]
          })
        })
      );
    });
  });
});

describe("LiveClassModerationService.moderateParticipant (coach force-mute)", () => {
  let service: LiveClassModerationService;
  let jwtService: { verifyAsync: jest.Mock };
  let userFindUnique: jest.Mock;
  let liveSessionFindUnique: jest.Mock;
  let listParticipants: jest.Mock;
  let muteParticipantTrack: jest.Mock;
  let broadcastData: jest.Mock;

  const authenticateAs = (id: string, role: UserRole) => {
    jwtService.verifyAsync.mockResolvedValue({ sub: id, type: "access" });
    userFindUnique.mockResolvedValue({
      id,
      role,
      status: UserStatus.ACTIVE,
      firstName: "Ada",
      lastName: "Coach"
    });
  };

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    userFindUnique = jest.fn();
    liveSessionFindUnique = jest.fn().mockResolvedValue({
      id: "session-1",
      classId: "class-1",
      coachId: "coach-1",
      roomName: "room-1",
      status: "LIVE"
    });
    // source 1 = CAMERA, 2 = MICROPHONE in the LiveKit TrackSource enum.
    listParticipants = jest.fn().mockResolvedValue([
      { identity: "coach-1", metadata: JSON.stringify({ role: "COACH" }), tracks: [] },
      {
        identity: "student-1_tab-a",
        metadata: JSON.stringify({ role: "STUDENT" }),
        tracks: [
          { sid: "TR_mic", source: 2, muted: false },
          { sid: "TR_cam", source: 1, muted: false }
        ]
      }
    ]);
    muteParticipantTrack = jest.fn().mockResolvedValue(undefined);
    broadcastData = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...LIVE_CLASS_SERVICES,
        { provide: JobLockService, useValue: createJobLockStub() },
        {
          provide: PrismaService,
          useValue: {
            liveClassPull: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
            liveSession: { findUnique: liveSessionFindUnique },
            user: { findUnique: userFindUnique }
          }
        },
        { provide: JwtService, useValue: jwtService },
        { provide: LiveKitService, useValue: { listParticipants, muteParticipantTrack, broadcastData } },
        { provide: AttendanceService, useValue: {} },
        { provide: BackupService, useValue: {} },
        { provide: RecordingStorageService, useValue: {} },
        { provide: WhatsAppService, useValue: {} },
        { provide: MailService, useValue: {} },
        { provide: LiveClassSettingsService, useValue: {} },
        {
          provide: AnalyticsEventService,
          useValue: { record: jest.fn(), recordRecordingWatchOncePerDay: jest.fn() }
        }
      ]
    }).compile();

    service = module.get(LiveClassModerationService);
  });

  it("mutes only the requested source and announces it", async () => {
    authenticateAs("coach-1", UserRole.COACH);

    const result = await service.moderateParticipant(ACCESS_TOKEN, "class-1", {
      identity: "student-1_tab-a",
      source: "microphone"
    });

    expect(result).toEqual({ muted: true, identity: "student-1_tab-a", source: "microphone" });
    expect(muteParticipantTrack).toHaveBeenCalledTimes(1);
    expect(muteParticipantTrack).toHaveBeenCalledWith("room-1", "student-1_tab-a", "TR_mic");
    expect(broadcastData).toHaveBeenCalledWith("room-1", expect.any(Uint8Array), "moderation");
  });

  it("reports no-op rather than failing when the source is already off", async () => {
    authenticateAs("coach-1", UserRole.COACH);
    listParticipants.mockResolvedValue([
      {
        identity: "student-1_tab-a",
        metadata: JSON.stringify({ role: "STUDENT" }),
        tracks: [{ sid: "TR_mic", source: 2, muted: true }]
      }
    ]);

    const result = await service.moderateParticipant(ACCESS_TOKEN, "class-1", {
      identity: "student-1_tab-a",
      source: "microphone"
    });

    expect(result.muted).toBe(false);
    expect(muteParticipantTrack).not.toHaveBeenCalled();
    expect(broadcastData).not.toHaveBeenCalled();
  });

  it("mute-all switches the chosen sources off for students only, never the coach", async () => {
    authenticateAs("coach-1", UserRole.COACH);
    listParticipants.mockResolvedValue([
      {
        identity: "coach-1",
        metadata: JSON.stringify({ role: "COACH" }),
        tracks: [{ sid: "TR_coach_mic", source: 2, muted: false }]
      },
      {
        identity: "student-1_tab-a",
        metadata: JSON.stringify({ role: "STUDENT" }),
        tracks: [
          { sid: "TR_mic", source: 2, muted: false },
          { sid: "TR_cam", source: 1, muted: false }
        ]
      },
      {
        identity: "student-2_tab-b",
        metadata: JSON.stringify({ role: "STUDENT" }),
        tracks: [{ sid: "TR_mic2", source: 2, muted: true }]
      }
    ]);

    const result = await service.moderateAll(ACCESS_TOKEN, "class-1", { sources: ["microphone"] });

    expect(result).toEqual({ mutedCount: 1 });
    expect(muteParticipantTrack).toHaveBeenCalledTimes(1);
    expect(muteParticipantTrack).toHaveBeenCalledWith("room-1", "student-1_tab-a", "TR_mic");
    expect(broadcastData).toHaveBeenCalledTimes(1);
  });

  it("mute-all can switch both mic and camera off", async () => {
    authenticateAs("coach-1", UserRole.COACH);

    const result = await service.moderateAll(ACCESS_TOKEN, "class-1", {
      sources: ["microphone", "camera"]
    });

    expect(result).toEqual({ mutedCount: 1 });
    expect(muteParticipantTrack).toHaveBeenCalledWith("room-1", "student-1_tab-a", "TR_mic");
    expect(muteParticipantTrack).toHaveBeenCalledWith("room-1", "student-1_tab-a", "TR_cam");
  });

  it("rejects a student trying to mute everyone", async () => {
    authenticateAs("student-2", UserRole.STUDENT);

    await expect(
      service.moderateAll(ACCESS_TOKEN, "class-1", { sources: ["microphone"] })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(muteParticipantTrack).not.toHaveBeenCalled();
  });

  it("rejects a student trying to mute someone", async () => {
    authenticateAs("student-2", UserRole.STUDENT);

    await expect(
      service.moderateParticipant(ACCESS_TOKEN, "class-1", {
        identity: "student-1_tab-a",
        source: "microphone"
      })
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(muteParticipantTrack).not.toHaveBeenCalled();
  });

  it("rejects a coach who does not own the class", async () => {
    authenticateAs("coach-2", UserRole.COACH);

    await expect(
      service.moderateParticipant(ACCESS_TOKEN, "class-1", {
        identity: "student-1_tab-a",
        source: "microphone"
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects when the class is not live", async () => {
    authenticateAs("coach-1", UserRole.COACH);
    liveSessionFindUnique.mockResolvedValue({
      id: "session-1",
      classId: "class-1",
      coachId: "coach-1",
      roomName: "room-1",
      status: "ENDED"
    });

    await expect(
      service.moderateParticipant(ACCESS_TOKEN, "class-1", {
        identity: "student-1_tab-a",
        source: "microphone"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuses to target the coach's own participant", async () => {
    authenticateAs("coach-1", UserRole.COACH);

    await expect(
      service.moderateParticipant(ACCESS_TOKEN, "class-1", {
        identity: "coach-1",
        source: "microphone"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("404s for a participant who has already left", async () => {
    authenticateAs("coach-1", UserRole.COACH);

    await expect(
      service.moderateParticipant(ACCESS_TOKEN, "class-1", {
        identity: "student-9_tab-z",
        source: "microphone"
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe("requestTrackOn (ask to unmute / start video)", () => {
    const mutedStudent = {
      identity: "student-1_tab-a",
      metadata: JSON.stringify({ role: "STUDENT" }),
      tracks: [{ sid: "TR_mic", source: 2, muted: true }]
    };

    it("asks only that participant, and never unmutes anything itself", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      listParticipants.mockResolvedValue([mutedStudent]);

      const result = await service.requestTrackOn(ACCESS_TOKEN, "class-1", {
        identity: "student-1_tab-a",
        source: "microphone"
      });

      expect(result).toEqual({ sent: true, identity: "student-1_tab-a", source: "microphone" });
      expect(muteParticipantTrack).not.toHaveBeenCalled();
      expect(broadcastData).toHaveBeenCalledWith("room-1", expect.any(Uint8Array), "moderation", [
        "student-1_tab-a"
      ]);
      const notice = JSON.parse(new TextDecoder().decode(broadcastData.mock.calls[0][1]));
      expect(notice).toEqual({
        type: "REQUEST_ON",
        identity: "student-1_tab-a",
        source: "microphone",
        byName: "Ada Coach"
      });
    });

    it("asks a participant with no camera published at all", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      listParticipants.mockResolvedValue([mutedStudent]);

      const result = await service.requestTrackOn(ACCESS_TOKEN, "class-1", {
        identity: "student-1_tab-a",
        source: "camera"
      });
      expect(result.sent).toBe(true);
    });

    it("sends nothing when that source is already on", async () => {
      authenticateAs("coach-1", UserRole.COACH);

      const result = await service.requestTrackOn(ACCESS_TOKEN, "class-1", {
        identity: "student-1_tab-a",
        source: "camera"
      });
      expect(result.sent).toBe(false);
      expect(broadcastData).not.toHaveBeenCalled();
    });

    it("refuses while the class settings lock student microphones off", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      listParticipants.mockResolvedValue([mutedStudent]);
      const locked = liveClassSettingsSchema.parse({ student: { mic: "FORCED_OFF" } });
      liveSessionFindUnique.mockResolvedValue({
        id: "session-1",
        classId: "class-1",
        coachId: "coach-1",
        roomName: "room-1",
        status: "LIVE",
        effectiveSettings: locked
      });

      await expect(
        service.requestTrackOn(ACCESS_TOKEN, "class-1", { identity: "student-1_tab-a", source: "microphone" })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(broadcastData).not.toHaveBeenCalled();
    });

    it("is coach-owner only", async () => {
      authenticateAs("student-2", UserRole.STUDENT);
      await expect(
        service.requestTrackOn(ACCESS_TOKEN, "class-1", { identity: "student-1_tab-a", source: "microphone" })
      ).rejects.toBeInstanceOf(ForbiddenException);

      authenticateAs("coach-2", UserRole.COACH);
      await expect(
        service.requestTrackOn(ACCESS_TOKEN, "class-1", { identity: "student-1_tab-a", source: "microphone" })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("surfaces a failed delivery instead of claiming it was sent", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      listParticipants.mockResolvedValue([mutedStudent]);
      broadcastData.mockRejectedValue(new Error("livekit down"));

      await expect(
        service.requestTrackOn(ACCESS_TOKEN, "class-1", { identity: "student-1_tab-a", source: "microphone" })
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it("404s for a participant who has already left", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      await expect(
        service.requestTrackOn(ACCESS_TOKEN, "class-1", { identity: "student-9_tab-z", source: "camera" })
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

describe("LiveClassService.getToken coach-presence gate", () => {
  let service: LiveClassService;
  let jwtService: { verifyAsync: jest.Mock };
  let userFindUnique: jest.Mock;
  let coachClassFindUnique: jest.Mock;
  let liveSessionFindUnique: jest.Mock;
  let listParticipants: jest.Mock;
  let generateAccessToken: jest.Mock;
  let recordJoinEvent: jest.Mock;
  let waitingFindUnique: jest.Mock;
  let pullFindFirst: jest.Mock;

  const authenticateAs = (id: string, role: UserRole) => {
    jwtService.verifyAsync.mockResolvedValue({ sub: id, type: "access" });
    userFindUnique.mockResolvedValue({
      id,
      role,
      status: UserStatus.ACTIVE,
      firstName: "Test",
      lastName: "User"
    });
  };

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    userFindUnique = jest.fn();
    coachClassFindUnique = jest.fn().mockResolvedValue({ id: "class-1", status: "LIVE" });
    liveSessionFindUnique = jest.fn().mockResolvedValue({
      id: "session-1",
      classId: "class-1",
      coachId: "coach-1",
      roomName: "room-1",
      status: "LIVE",
      batch: { students: [{ studentId: "student-1" }] },
      class: { topic: "Endgames" }
    });
    listParticipants = jest.fn().mockResolvedValue([]);
    generateAccessToken = jest.fn().mockResolvedValue("livekit-token");
    recordJoinEvent = jest.fn().mockResolvedValue(undefined);
    waitingFindUnique = jest.fn().mockResolvedValue(null);
    pullFindFirst = jest.fn().mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...LIVE_CLASS_SERVICES,
        { provide: JobLockService, useValue: createJobLockStub() },
        {
          provide: PrismaService,
          useValue: {
            liveClassPull: { findFirst: pullFindFirst, updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
            liveClassWaitingParticipant: { findUnique: waitingFindUnique },
            coachClass: { findUnique: coachClassFindUnique },
            liveSession: { findUnique: liveSessionFindUnique },
            user: { findUnique: userFindUnique },
            liveClassScreenShareRequest: { findUnique: jest.fn().mockResolvedValue(null) }
          }
        },
        { provide: JwtService, useValue: jwtService },
        { provide: LiveKitService, useValue: { listParticipants, generateAccessToken } },
        { provide: AttendanceService, useValue: { recordJoinEvent } },
        { provide: BackupService, useValue: {} },
        { provide: RecordingStorageService, useValue: {} },
        { provide: WhatsAppService, useValue: {} },
        { provide: MailService, useValue: {} },
        {
          provide: LiveClassSettingsService,
          useValue: { resolveForClass: jest.fn().mockResolvedValue({ resolved: {} }) }
        },
        {
          provide: AnalyticsEventService,
          useValue: {
            record: jest.fn().mockResolvedValue(undefined),
            recordRecordingWatchOncePerDay: jest.fn().mockResolvedValue(undefined)
          }
        }
      ]
    }).compile();

    service = module.get<LiveClassService>(LiveClassService);
  });

  it("keeps a student waiting when nobody is in the room", async () => {
    authenticateAs("student-1", UserRole.STUDENT);
    await expect(service.getToken(ACCESS_TOKEN, "class-1")).rejects.toMatchObject({
      response: { code: "COACH_NOT_JOINED" }
    });
  });

  it("admits the student when the coach is present with a tab-suffixed identity (AUDIT M23)", async () => {
    authenticateAs("student-1", UserRole.STUDENT);
    listParticipants.mockResolvedValue([{ identity: "coach-1_tab-abc123" }]);

    const res = await service.getToken(ACCESS_TOKEN, "class-1", "tab-xyz");

    expect(res.token).toBe("livekit-token");
    expect(recordJoinEvent).toHaveBeenCalled();
  });

  it("admits the student when the coach joined without a suffix", async () => {
    authenticateAs("student-1", UserRole.STUDENT);
    listParticipants.mockResolvedValue([{ identity: "coach-1" }]);

    await expect(service.getToken(ACCESS_TOKEN, "class-1")).resolves.toMatchObject({
      token: "livekit-token"
    });
  });

  it("refuses a student the coach removed (no waiting room)", async () => {
    authenticateAs("student-1", UserRole.STUDENT);
    listParticipants.mockResolvedValue([{ identity: "coach-1" }]);
    waitingFindUnique.mockResolvedValue({ status: "DENIED" });

    await expect(service.getToken(ACCESS_TOKEN, "class-1")).rejects.toMatchObject({
      response: { code: "REMOVED_FROM_CLASS" }
    });
  });

  it("admits a student from another batch who was pulled in, as a STUDENT", async () => {
    authenticateAs("student-9", UserRole.STUDENT);
    listParticipants.mockResolvedValue([{ identity: "coach-1" }]);
    pullFindFirst.mockResolvedValue({ id: "pull-1" });

    await expect(service.getToken(ACCESS_TOKEN, "class-1")).resolves.toMatchObject({
      token: "livekit-token"
    });
    expect(generateAccessToken).toHaveBeenCalledWith(expect.objectContaining({ isCoach: false }));
  });

  it("refuses a student outside the batch who was not pulled in", async () => {
    authenticateAs("student-9", UserRole.STUDENT);
    await expect(service.getToken(ACCESS_TOKEN, "class-1")).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it("does not treat another student as the coach", async () => {
    authenticateAs("student-1", UserRole.STUDENT);
    listParticipants.mockResolvedValue([{ identity: "student-2_tab-abc" }]);

    await expect(service.getToken(ACCESS_TOKEN, "class-1")).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  describe("pre-class settings enforcement", () => {
    const withSnapshot = (settings: unknown) => {
      liveSessionFindUnique.mockResolvedValue({
        id: "session-1",
        classId: "class-1",
        coachId: "coach-1",
        roomName: "room-1",
        status: "LIVE",
        batch: { students: [{ studentId: "student-1" }] },
        class: { topic: "Endgames" },
        effectiveSettings: settings
      });
    };

    it("withholds the microphone source from a FORCED_OFF student's token", async () => {
      authenticateAs("student-1", UserRole.STUDENT);
      listParticipants.mockResolvedValue([{ identity: "coach-1" }]);
      withSnapshot(
        liveClassSettingsSchema.parse({
          student: { mic: "FORCED_OFF", screenShare: "DISABLED" }
        })
      );

      const res = await service.getToken(ACCESS_TOKEN, "class-1");

      const grants = generateAccessToken.mock.calls[0][0].grants;
      expect(grants.canPublishSources).not.toContain("microphone");
      expect(grants.canPublishSources).not.toContain("screen_share");
      expect(grants.canPublishSources).toContain("camera");
      expect(grants.roomAdmin).toBe(false);
      expect(res.settings?.student.mic).toBe("FORCED_OFF");
    });

    it("gives the owning coach full grants regardless of the snapshot", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      withSnapshot(liveClassSettingsSchema.parse({ student: { mic: "FORCED_OFF" } }));

      await service.getToken(ACCESS_TOKEN, "class-1");

      const grants = generateAccessToken.mock.calls[0][0].grants;
      expect(grants.roomAdmin).toBe(true);
      expect(grants.canPublishSources).toEqual(
        expect.arrayContaining(["microphone", "camera", "screen_share"])
      );
    });

    it("falls back to default grants (no policy) for a class started before the feature", async () => {
      authenticateAs("student-1", UserRole.STUDENT);
      listParticipants.mockResolvedValue([{ identity: "coach-1" }]);
      // default liveSession from the outer beforeEach has no effectiveSettings

      const res = await service.getToken(ACCESS_TOKEN, "class-1");

      expect(generateAccessToken.mock.calls[0][0].grants).toBeUndefined();
      expect(res.settings).toBeNull();
    });
  });
});

describe("LiveClassService.updateLiveSettings (mid-class change)", () => {
  let service: LiveClassService;
  let jwtService: { verifyAsync: jest.Mock };
  let userFindUnique: jest.Mock;
  let liveSessionFindUnique: jest.Mock;
  let liveSessionUpdate: jest.Mock;
  let listParticipants: jest.Mock;
  let updateParticipantPermissions: jest.Mock;
  let muteParticipantTrack: jest.Mock;
  let broadcastData: jest.Mock;
  let updateSettingsForClass: jest.Mock;
  let resolveForClass: jest.Mock;
  let getSettingsForClass: jest.Mock;

  const authenticateAs = (id: string, role: UserRole) => {
    jwtService.verifyAsync.mockResolvedValue({ sub: id, type: "access" });
    userFindUnique.mockResolvedValue({ id, role, status: UserStatus.ACTIVE, firstName: "T", lastName: "U" });
  };

  const forcedOffMic = liveClassSettingsSchema.parse({ student: { mic: "FORCED_OFF" } });

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    userFindUnique = jest.fn();
    liveSessionFindUnique = jest.fn().mockResolvedValue({
      id: "session-1",
      classId: "class-1",
      coachId: "coach-1",
      roomName: "room-1",
      status: "LIVE",
    });
    liveSessionUpdate = jest.fn().mockResolvedValue({});
    listParticipants = jest.fn().mockResolvedValue([
      { identity: "coach-1", metadata: JSON.stringify({ role: "COACH" }), tracks: [] },
      {
        identity: "student-1_tab-a",
        metadata: JSON.stringify({ role: "STUDENT" }),
        tracks: [{ sid: "TR_mic", source: 2, muted: false }],
      },
    ]);
    updateParticipantPermissions = jest.fn().mockResolvedValue(undefined);
    muteParticipantTrack = jest.fn().mockResolvedValue(undefined);
    broadcastData = jest.fn().mockResolvedValue(undefined);
    updateSettingsForClass = jest.fn().mockResolvedValue(undefined);
    resolveForClass = jest.fn().mockResolvedValue({ resolved: forcedOffMic });
    getSettingsForClass = jest.fn().mockResolvedValue({ resolved: forcedOffMic });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...LIVE_CLASS_SERVICES,
        { provide: JobLockService, useValue: createJobLockStub() },
        {
          provide: PrismaService,
          useValue: {
            liveClassPull: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
            liveSession: { findUnique: liveSessionFindUnique, update: liveSessionUpdate },
            user: { findUnique: userFindUnique },
          },
        },
        { provide: JwtService, useValue: jwtService },
        {
          provide: LiveKitService,
          useValue: { listParticipants, updateParticipantPermissions, muteParticipantTrack, broadcastData },
        },
        { provide: AttendanceService, useValue: {} },
        { provide: BackupService, useValue: {} },
        { provide: RecordingStorageService, useValue: {} },
        { provide: WhatsAppService, useValue: {} },
        { provide: MailService, useValue: {} },
        {
          provide: LiveClassSettingsService,
          useValue: { updateSettingsForClass, resolveForClass, getSettingsForClass },
        },
        {
          provide: AnalyticsEventService,
          useValue: { record: jest.fn(), recordRecordingWatchOncePerDay: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<LiveClassService>(LiveClassService);
  });

  it("rejects a coach who does not own the class", async () => {
    authenticateAs("coach-2", UserRole.COACH);
    await expect(
      service.updateLiveSettings(ACCESS_TOKEN, "class-1", { liveClassSettings: null }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(updateSettingsForClass).not.toHaveBeenCalled();
  });

  it("rejects when the class is not live", async () => {
    authenticateAs("coach-1", UserRole.COACH);
    liveSessionFindUnique.mockResolvedValue({
      id: "session-1", classId: "class-1", coachId: "coach-1", roomName: "room-1", status: "ENDED",
    });
    await expect(
      service.updateLiveSettings(ACCESS_TOKEN, "class-1", { liveClassSettings: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refreezes the snapshot, re-pushes student grants, mutes a now-forbidden track and broadcasts", async () => {
    authenticateAs("coach-1", UserRole.COACH);

    await service.updateLiveSettings(ACCESS_TOKEN, "class-1", {
      liveClassSettings: { student: { mic: "FORCED_OFF" } },
    });

    expect(updateSettingsForClass).toHaveBeenCalledWith(
      ACCESS_TOKEN,
      "class-1",
      { liveClassSettings: { student: { mic: "FORCED_OFF" } } },
    );
    expect(liveSessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ effectiveSettings: forcedOffMic }) }),
    );
    // Only the student is clamped, not the coach.
    expect(updateParticipantPermissions).toHaveBeenCalledTimes(1);
    expect(updateParticipantPermissions.mock.calls[0][1]).toBe("student-1_tab-a");
    expect(updateParticipantPermissions.mock.calls[0][2].canPublishSources).not.toContain("microphone");
    // The live, unmuted mic track is force-muted.
    expect(muteParticipantTrack).toHaveBeenCalledWith("room-1", "student-1_tab-a", "TR_mic");
    expect(broadcastData).toHaveBeenCalledWith(
      "room-1",
      expect.any(Uint8Array),
      "live_class_settings",
    );
  });
});

describe("LiveClassService waiting room", () => {
  let service: LiveClassService;
  let waitingRoom: LiveClassWaitingRoomService;
  let jwtService: { verifyAsync: jest.Mock };
  let userFindUnique: jest.Mock;
  let coachClassFindUnique: jest.Mock;
  let liveSessionFindUnique: jest.Mock;
  let listParticipants: jest.Mock;
  let generateAccessToken: jest.Mock;
  let broadcastData: jest.Mock;
  let waitingFindUnique: jest.Mock;
  let waitingCreate: jest.Mock;
  let waitingUpdateMany: jest.Mock;
  let waitingFindUniqueOrThrow: jest.Mock;

  const authenticateAs = (id: string, role: UserRole) => {
    jwtService.verifyAsync.mockResolvedValue({ sub: id, type: "access" });
    userFindUnique.mockResolvedValue({
      id,
      role,
      status: UserStatus.ACTIVE,
      firstName: "Test",
      lastName: "User"
    });
  };

  const waitingRoomSettings = liveClassSettingsSchema.parse({ waitingRoom: "ENABLED" });
  const student = { firstName: "Stu", lastName: "Dent", avatarUrl: null };

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    userFindUnique = jest.fn();
    coachClassFindUnique = jest.fn().mockResolvedValue({ id: "class-1", status: "LIVE" });
    liveSessionFindUnique = jest.fn().mockResolvedValue({
      id: "session-1",
      classId: "class-1",
      coachId: "coach-1",
      roomName: "room-1",
      status: "LIVE",
      batch: { students: [{ studentId: "student-1" }] },
      class: { topic: "Endgames" },
      effectiveSettings: waitingRoomSettings
    });
    listParticipants = jest.fn().mockResolvedValue([{ identity: "coach-1" }]);
    generateAccessToken = jest.fn().mockResolvedValue("livekit-token");
    broadcastData = jest.fn().mockResolvedValue(undefined);
    waitingFindUnique = jest.fn().mockResolvedValue(null);
    waitingCreate = jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: "wait-1",
        status: "PENDING",
        requestedAt: new Date("2026-01-01T00:00:00.000Z"),
        studentId: data.studentId,
        student
      })
    );
    waitingUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    waitingFindUniqueOrThrow = jest.fn().mockResolvedValue({
      id: "wait-1",
      status: "ADMITTED",
      requestedAt: new Date("2026-01-01T00:00:00.000Z"),
      studentId: "student-1",
      student
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...LIVE_CLASS_SERVICES,
        { provide: JobLockService, useValue: createJobLockStub() },
        {
          provide: PrismaService,
          useValue: {
            liveClassPull: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
            coachClass: { findUnique: coachClassFindUnique },
            liveSession: { findUnique: liveSessionFindUnique },
            user: { findUnique: userFindUnique },
            liveClassWaitingParticipant: {
              findUnique: waitingFindUnique,
              create: waitingCreate,
              updateMany: waitingUpdateMany,
              findUniqueOrThrow: waitingFindUniqueOrThrow
            },
            liveClassScreenShareRequest: { findUnique: jest.fn().mockResolvedValue(null) }
          }
        },
        { provide: JwtService, useValue: jwtService },
        { provide: LiveKitService, useValue: { listParticipants, generateAccessToken, broadcastData } },
        { provide: AttendanceService, useValue: { recordJoinEvent: jest.fn() } },
        { provide: BackupService, useValue: {} },
        { provide: RecordingStorageService, useValue: {} },
        { provide: WhatsAppService, useValue: {} },
        { provide: MailService, useValue: {} },
        { provide: LiveClassSettingsService, useValue: {} },
        {
          provide: AnalyticsEventService,
          useValue: { record: jest.fn(), recordRecordingWatchOncePerDay: jest.fn() }
        }
      ]
    }).compile();

    service = module.get<LiveClassService>(LiveClassService);

    waitingRoom = module.get(LiveClassWaitingRoomService);
  });

  describe("getToken", () => {
    it("creates a PENDING row and blocks with WAITING_FOR_ADMIT on first request", async () => {
      authenticateAs("student-1", UserRole.STUDENT);

      await expect(service.getToken(ACCESS_TOKEN, "class-1")).rejects.toMatchObject({
        response: { code: "WAITING_FOR_ADMIT" }
      });

      expect(waitingCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { liveSessionId: "session-1", studentId: "student-1" } })
      );
      expect(broadcastData).toHaveBeenCalledWith("room-1", expect.any(Uint8Array), "waiting_room");
      expect(generateAccessToken).not.toHaveBeenCalled();
    });

    it("blocks again without re-announcing once the row is already PENDING", async () => {
      authenticateAs("student-1", UserRole.STUDENT);
      waitingFindUnique.mockResolvedValue({ status: "PENDING" });

      await expect(service.getToken(ACCESS_TOKEN, "class-1")).rejects.toMatchObject({
        response: { code: "WAITING_FOR_ADMIT" }
      });

      expect(waitingCreate).not.toHaveBeenCalled();
      expect(broadcastData).not.toHaveBeenCalled();
    });

    it("mints a token once the row is ADMITTED", async () => {
      authenticateAs("student-1", UserRole.STUDENT);
      waitingFindUnique.mockResolvedValue({ status: "ADMITTED" });

      await expect(service.getToken(ACCESS_TOKEN, "class-1")).resolves.toMatchObject({
        token: "livekit-token"
      });
    });

    it("rejects with JOIN_DENIED once the row is DENIED", async () => {
      authenticateAs("student-1", UserRole.STUDENT);
      waitingFindUnique.mockResolvedValue({ status: "DENIED" });

      await expect(service.getToken(ACCESS_TOKEN, "class-1")).rejects.toMatchObject({
        response: { code: "JOIN_DENIED" }
      });
      expect(generateAccessToken).not.toHaveBeenCalled();
    });

    it("never gates the coach", async () => {
      authenticateAs("coach-1", UserRole.COACH);

      await expect(service.getToken(ACCESS_TOKEN, "class-1")).resolves.toMatchObject({
        token: "livekit-token"
      });
      expect(waitingFindUnique).not.toHaveBeenCalled();
    });
  });

  describe("resolveWaitingRoomEntry", () => {
    it("admits a pending student and broadcasts the resolution", async () => {
      authenticateAs("coach-1", UserRole.COACH);

      const result = await waitingRoom.resolveWaitingRoomEntry(ACCESS_TOKEN, "class-1", {
        studentId: "student-1",
        action: "ADMIT"
      });

      expect(waitingUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { liveSessionId: "session-1", studentId: "student-1", status: "PENDING" },
          data: expect.objectContaining({ status: "ADMITTED", resolvedById: "coach-1" })
        })
      );
      expect(result.status).toBe("ADMITTED");
      expect(broadcastData).toHaveBeenCalledWith("room-1", expect.any(Uint8Array), "waiting_room");
    });

    it("404s (idempotency guard) when the row is already resolved", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      waitingUpdateMany.mockResolvedValue({ count: 0 });

      await expect(
        waitingRoom.resolveWaitingRoomEntry(ACCESS_TOKEN, "class-1", {
          studentId: "student-1",
          action: "ADMIT"
        })
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(waitingFindUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("rejects a coach who does not own the class", async () => {
      authenticateAs("coach-2", UserRole.COACH);

      await expect(
        waitingRoom.resolveWaitingRoomEntry(ACCESS_TOKEN, "class-1", {
          studentId: "student-1",
          action: "ADMIT"
        })
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(waitingUpdateMany).not.toHaveBeenCalled();
    });
  });
});

describe("LiveClassService screen-share requests", () => {
  let service: LiveClassService;
  let screenShare: LiveClassScreenShareService;
  let jwtService: { verifyAsync: jest.Mock };
  let userFindUnique: jest.Mock;
  let coachClassFindUnique: jest.Mock;
  let liveSessionFindUnique: jest.Mock;
  let liveSessionUpdateMany: jest.Mock;
  let coachClassUpdate: jest.Mock;
  let listParticipants: jest.Mock;
  let generateAccessToken: jest.Mock;
  let broadcastData: jest.Mock;
  let updateParticipantPermissions: jest.Mock;
  let muteParticipantTrack: jest.Mock;
  let deleteRoom: jest.Mock;
  let shareFindUnique: jest.Mock;
  let shareUpsert: jest.Mock;
  let shareUpdateMany: jest.Mock;
  let shareFindUniqueOrThrow: jest.Mock;

  const authenticateAs = (id: string, role: UserRole) => {
    jwtService.verifyAsync.mockResolvedValue({ sub: id, type: "access" });
    userFindUnique.mockResolvedValue({
      id,
      role,
      status: UserStatus.ACTIVE,
      firstName: "Test",
      lastName: "User"
    });
  };

  const defaultSettings = liveClassSettingsSchema.parse({});
  const allowedSettings = liveClassSettingsSchema.parse({ student: { screenShare: "ALLOWED" } });
  const student = { firstName: "Stu", lastName: "Dent", avatarUrl: null };

  const shareRow = (overrides: Record<string, unknown> = {}) => ({
    id: "share-1",
    status: "PENDING",
    requestedAt: new Date("2026-01-01T00:00:00.000Z"),
    studentId: "student-1",
    student,
    ...overrides
  });

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    userFindUnique = jest.fn();
    coachClassFindUnique = jest.fn().mockResolvedValue({ id: "class-1", status: "LIVE" });
    liveSessionFindUnique = jest.fn().mockResolvedValue({
      id: "session-1",
      classId: "class-1",
      coachId: "coach-1",
      roomName: "room-1",
      status: "LIVE",
      batch: { students: [{ studentId: "student-1" }] },
      class: { topic: "Endgames" },
      effectiveSettings: defaultSettings
    });
    liveSessionUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    coachClassUpdate = jest.fn().mockResolvedValue({});
    listParticipants = jest.fn().mockResolvedValue([
      { identity: "coach-1", tracks: [] },
      { identity: "student-1_client-a", tracks: [] }
    ]);
    generateAccessToken = jest.fn().mockResolvedValue("livekit-token");
    broadcastData = jest.fn().mockResolvedValue(undefined);
    updateParticipantPermissions = jest.fn().mockResolvedValue(undefined);
    muteParticipantTrack = jest.fn().mockResolvedValue(undefined);
    deleteRoom = jest.fn().mockResolvedValue(undefined);
    shareFindUnique = jest.fn().mockResolvedValue(null);
    shareUpsert = jest.fn().mockImplementation(({ create }: { create: Record<string, unknown> }) =>
      Promise.resolve(shareRow({ studentId: create.studentId }))
    );
    shareUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    shareFindUniqueOrThrow = jest.fn().mockResolvedValue(shareRow({ status: "APPROVED" }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...LIVE_CLASS_SERVICES,
        { provide: JobLockService, useValue: createJobLockStub() },
        {
          provide: PrismaService,
          useValue: {
            liveClassPull: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
            liveClassWaitingParticipant: { findUnique: jest.fn().mockResolvedValue(null) },
            coachClass: { findUnique: coachClassFindUnique, update: coachClassUpdate },
            liveSession: { findUnique: liveSessionFindUnique, updateMany: liveSessionUpdateMany },
            user: { findUnique: userFindUnique },
            liveClassScreenShareRequest: {
              findUnique: shareFindUnique,
              upsert: shareUpsert,
              updateMany: shareUpdateMany,
              findUniqueOrThrow: shareFindUniqueOrThrow
            }
          }
        },
        { provide: JwtService, useValue: jwtService },
        {
          provide: LiveKitService,
          useValue: {
            listParticipants,
            generateAccessToken,
            broadcastData,
            updateParticipantPermissions,
            muteParticipantTrack,
            deleteRoom
          }
        },
        { provide: AttendanceService, useValue: { recordJoinEvent: jest.fn(), finalizeClassAttendance: jest.fn() } },
        { provide: BackupService, useValue: {} },
        { provide: RecordingStorageService, useValue: {} },
        { provide: WhatsAppService, useValue: {} },
        { provide: MailService, useValue: {} },
        { provide: LiveClassSettingsService, useValue: {} },
        {
          provide: AnalyticsEventService,
          useValue: { record: jest.fn(), recordRecordingWatchOncePerDay: jest.fn() }
        }
      ]
    }).compile();

    service = module.get<LiveClassService>(LiveClassService);

    screenShare = module.get(LiveClassScreenShareService);
  });

  describe("requestScreenShare", () => {
    it("rejects when the class already allows screen sharing", async () => {
      authenticateAs("student-1", UserRole.STUDENT);
      liveSessionFindUnique.mockResolvedValue({
        id: "session-1",
        classId: "class-1",
        coachId: "coach-1",
        roomName: "room-1",
        status: "LIVE",
        batch: { students: [{ studentId: "student-1" }] },
        effectiveSettings: allowedSettings
      });

      await expect(screenShare.requestScreenShare(ACCESS_TOKEN, "class-1")).rejects.toBeInstanceOf(BadRequestException);
      expect(shareUpsert).not.toHaveBeenCalled();
    });

    it("creates a PENDING row and announces on first request", async () => {
      authenticateAs("student-1", UserRole.STUDENT);

      const entry = await screenShare.requestScreenShare(ACCESS_TOKEN, "class-1");

      expect(shareUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: { liveSessionId: "session-1", studentId: "student-1" } })
      );
      expect(entry.status).toBe("PENDING");
      expect(broadcastData).toHaveBeenCalledWith("room-1", expect.any(Uint8Array), "screen_share_request");
    });

    it("resets a DENIED row back to PENDING on re-request", async () => {
      authenticateAs("student-1", UserRole.STUDENT);
      shareFindUnique.mockResolvedValue(shareRow({ status: "DENIED" }));

      await screenShare.requestScreenShare(ACCESS_TOKEN, "class-1");

      expect(shareUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { status: "PENDING", resolvedAt: null, resolvedById: null }
        })
      );
    });

    it("is idempotent (no re-announce) when already PENDING or APPROVED", async () => {
      authenticateAs("student-1", UserRole.STUDENT);
      shareFindUnique.mockResolvedValue(shareRow({ status: "PENDING" }));

      const entry = await screenShare.requestScreenShare(ACCESS_TOKEN, "class-1");

      expect(entry.status).toBe("PENDING");
      expect(shareUpsert).not.toHaveBeenCalled();
      expect(broadcastData).not.toHaveBeenCalled();
    });
  });

  describe("resolveScreenShareRequest", () => {
    it("approves a pending request and widens the student's LiveKit grant", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      shareFindUniqueOrThrow.mockResolvedValue(shareRow({ status: "APPROVED" }));

      const result = await screenShare.resolveScreenShareRequest(ACCESS_TOKEN, "class-1", {
        studentId: "student-1",
        action: "APPROVE"
      });

      expect(shareUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { liveSessionId: "session-1", studentId: "student-1", status: "PENDING" },
          data: expect.objectContaining({ status: "APPROVED" })
        })
      );
      expect(updateParticipantPermissions).toHaveBeenCalledWith(
        "room-1",
        "student-1_client-a",
        expect.objectContaining({
          canPublish: true,
          canPublishSources: expect.arrayContaining(["screen_share", "screen_share_audio"])
        })
      );
      expect(result.status).toBe("APPROVED");
      expect(broadcastData).toHaveBeenCalledWith("room-1", expect.any(Uint8Array), "screen_share_request");
    });

    it("404s (idempotency guard) on a double-resolve", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      shareUpdateMany.mockResolvedValue({ count: 0 });

      await expect(
        screenShare.resolveScreenShareRequest(ACCESS_TOKEN, "class-1", { studentId: "student-1", action: "APPROVE" })
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(shareFindUniqueOrThrow).not.toHaveBeenCalled();
      expect(updateParticipantPermissions).not.toHaveBeenCalled();
    });

    it("denies a pending request without touching LiveKit grants", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      shareFindUniqueOrThrow.mockResolvedValue(shareRow({ status: "DENIED" }));

      const result = await screenShare.resolveScreenShareRequest(ACCESS_TOKEN, "class-1", {
        studentId: "student-1",
        action: "DENY"
      });

      expect(result.status).toBe("DENIED");
      expect(updateParticipantPermissions).not.toHaveBeenCalled();
    });

    it("revokes an approved request, narrows the grant, and mutes a live screen-share track", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      listParticipants.mockResolvedValue([
        {
          identity: "student-1_client-a",
          tracks: [{ sid: "track-1", source: 3 /* TrackSource.SCREEN_SHARE */, muted: false }]
        }
      ]);
      shareFindUniqueOrThrow.mockResolvedValue(shareRow({ status: "REVOKED" }));

      const result = await screenShare.resolveScreenShareRequest(ACCESS_TOKEN, "class-1", {
        studentId: "student-1",
        action: "REVOKE"
      });

      expect(shareUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { liveSessionId: "session-1", studentId: "student-1", status: "APPROVED" }
        })
      );
      expect(updateParticipantPermissions).toHaveBeenCalledWith(
        "room-1",
        "student-1_client-a",
        expect.objectContaining({ canPublishSources: expect.not.arrayContaining(["screen_share"]) })
      );
      expect(muteParticipantTrack).toHaveBeenCalledWith("room-1", "student-1_client-a", "track-1");
      expect(result.status).toBe("REVOKED");
    });
  });

  describe("endScreenShare", () => {
    it("self-revokes an approved request and narrows the grant", async () => {
      authenticateAs("student-1", UserRole.STUDENT);
      shareFindUniqueOrThrow.mockResolvedValue(shareRow({ status: "REVOKED" }));

      const result = await screenShare.endScreenShare(ACCESS_TOKEN, "class-1");

      expect(shareUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { liveSessionId: "session-1", studentId: "student-1", status: "APPROVED" }
        })
      );
      expect(updateParticipantPermissions).toHaveBeenCalled();
      expect(result.status).toBe("REVOKED");
    });

    it("is a no-op success when nothing was approved (coach revoked first)", async () => {
      authenticateAs("student-1", UserRole.STUDENT);
      shareUpdateMany.mockResolvedValue({ count: 0 });
      shareFindUniqueOrThrow.mockResolvedValue(shareRow({ status: "DENIED" }));

      const result = await screenShare.endScreenShare(ACCESS_TOKEN, "class-1");

      expect(result.status).toBe("DENIED");
      expect(updateParticipantPermissions).not.toHaveBeenCalled();
      expect(broadcastData).not.toHaveBeenCalled();
    });
  });

  describe("getToken reconnect", () => {
    it("merges screen_share/screen_share_audio back in for an APPROVED student even though the class policy is DISABLED", async () => {
      authenticateAs("student-1", UserRole.STUDENT);
      shareFindUnique.mockResolvedValue({ status: "APPROVED" });

      await service.getToken(ACCESS_TOKEN, "class-1");

      expect(generateAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({
          grants: expect.objectContaining({
            canPublishSources: expect.arrayContaining(["screen_share", "screen_share_audio"])
          })
        })
      );
    });

    it("leaves grants alone when there is no request row", async () => {
      authenticateAs("student-1", UserRole.STUDENT);

      await service.getToken(ACCESS_TOKEN, "class-1");

      expect(generateAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({
          grants: expect.objectContaining({
            canPublishSources: expect.not.arrayContaining(["screen_share"])
          })
        })
      );
    });
  });

  describe("endClass sweep", () => {
    it("sweeps lingering PENDING/APPROVED screen-share requests to REVOKED", async () => {
      authenticateAs("coach-1", UserRole.COACH);

      await service.endClass(ACCESS_TOKEN, "class-1");

      expect(shareUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { liveSessionId: "session-1", status: { in: ["PENDING", "APPROVED"] } },
          data: expect.objectContaining({ status: "REVOKED" })
        })
      );
    });
  });
});

describe("LiveClassModerationService.kickParticipant", () => {
  let service: LiveClassModerationService;
  let jwtService: { verifyAsync: jest.Mock };
  let userFindUnique: jest.Mock;
  let userFindFirst: jest.Mock;
  let waitingUpsert: jest.Mock;
  let pullUpdateMany: jest.Mock;
  let removeParticipant: jest.Mock;
  let waitingFindUnique: jest.Mock;

  beforeEach(async () => {
    waitingFindUnique = jest.fn().mockResolvedValue(null);
    jwtService = { verifyAsync: jest.fn().mockResolvedValue({ sub: "coach-1", type: "access" }) };
    waitingFindUnique = jest.fn().mockResolvedValue(null);
    userFindUnique = jest.fn().mockResolvedValue({
      id: "coach-1",
      role: UserRole.COACH,
      status: UserStatus.ACTIVE,
      firstName: "Ada",
      lastName: "Coach"
    });
    userFindFirst = jest.fn().mockResolvedValue({ id: "student-1" });
    waitingUpsert = jest.fn().mockResolvedValue({});
    pullUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    removeParticipant = jest.fn().mockResolvedValue(undefined);

    const prisma = {
      liveSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: "session-1",
          classId: "class-1",
          coachId: "coach-1",
          roomName: "room-1",
          status: "LIVE"
        })
      },
      user: { findUnique: userFindUnique, findFirst: userFindFirst },
      liveClassWaitingParticipant: { upsert: waitingUpsert, findUnique: waitingFindUnique },
      liveClassPull: { updateMany: pullUpdateMany },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops))
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...LIVE_CLASS_SERVICES,
        { provide: JobLockService, useValue: createJobLockStub() },
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        {
          provide: LiveKitService,
          useValue: {
            listParticipants: jest.fn().mockResolvedValue([
              { identity: "coach-1" },
              { identity: "student-1_tab-a" },
              { identity: "student-1_tab-b" },
              { identity: "student-2_tab-c" }
            ]),
            removeParticipant
          }
        },
        { provide: AttendanceService, useValue: {} },
        { provide: BackupService, useValue: {} },
        { provide: RecordingStorageService, useValue: {} },
        { provide: WhatsAppService, useValue: {} },
        { provide: MailService, useValue: {} },
        { provide: LiveClassSettingsService, useValue: {} },
        {
          provide: AnalyticsEventService,
          useValue: { record: jest.fn(), recordRecordingWatchOncePerDay: jest.fn() }
        }
      ]
    }).compile();

    service = module.get(LiveClassModerationService);
  });

  it("disconnects every tab of the student and blocks their rejoin", async () => {
    const res = await service.kickParticipant(ACCESS_TOKEN, "class-1", { identity: "student-1_tab-a" });

    expect(res.removed).toBe(2);
    expect(removeParticipant.mock.calls.map((c) => c[1])).toEqual(["student-1_tab-a", "student-1_tab-b"]);
    expect(waitingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ status: "DENIED" }) })
    );
    expect(pullUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CANCELLED" }) })
    );
  });

  it("refuses to remove the coach", async () => {
    await expect(
      service.kickParticipant(ACCESS_TOKEN, "class-1", { identity: "coach-1_tab-x" })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(removeParticipant).not.toHaveBeenCalled();
  });

  it("refuses to remove someone who is not a student", async () => {
    userFindFirst.mockResolvedValue(null);
    await expect(
      service.kickParticipant(ACCESS_TOKEN, "class-1", { identity: "admin-1_tab-x" })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe("enforceRemovalOnJoin (participant_joined webhook)", () => {
    const session = { id: "session-1", roomName: "room-1" };

    it("puts a removed student back out when they reconnect with an old token", async () => {
      waitingFindUnique.mockResolvedValue({ status: "DENIED" });
      await expect(service.enforceRemovalOnJoin(session, "student-1", "student-1_tab-a")).resolves.toBe(true);
      expect(removeParticipant).toHaveBeenCalledWith("room-1", "student-1_tab-a");
    });

    it("leaves an admitted student alone", async () => {
      waitingFindUnique.mockResolvedValue({ status: "ADMITTED" });
      await expect(service.enforceRemovalOnJoin(session, "student-1", "student-1_tab-a")).resolves.toBe(false);
      expect(removeParticipant).not.toHaveBeenCalled();
    });

    it("leaves a student with no waiting-room row alone", async () => {
      await expect(service.enforceRemovalOnJoin(session, "student-1", "student-1_tab-a")).resolves.toBe(false);
      expect(removeParticipant).not.toHaveBeenCalled();
    });
  });
});

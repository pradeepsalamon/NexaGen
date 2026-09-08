import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole, UserStatus } from "@prisma/client";
import { liveClassSettingsSchema } from "@nexa-chess/types";
import { LiveClassService } from "./live-class.service";
import { LiveKitService } from "./livekit.service";
import { AttendanceService } from "../attendance/attendance.service";
import { BackupService } from "../backup/backup.service";
import { RecordingStorageService } from "./recording-storage.service";
import { LiveClassSettingsService } from "./live-class-settings.service";
import { AnalyticsEventService } from "../analytics/analytics-event.service";
import { PrismaService } from "../prisma/prisma.service";

const ACCESS_TOKEN = "access-token";

describe("LiveClassService chat authorization", () => {
  let service: LiveClassService;
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
        LiveClassService,
        {
          provide: PrismaService,
          useValue: {
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

describe("LiveClassService.moderateParticipant (coach force-mute)", () => {
  let service: LiveClassService;
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
        LiveClassService,
        {
          provide: PrismaService,
          useValue: {
            liveSession: { findUnique: liveSessionFindUnique },
            user: { findUnique: userFindUnique }
          }
        },
        { provide: JwtService, useValue: jwtService },
        { provide: LiveKitService, useValue: { listParticipants, muteParticipantTrack, broadcastData } },
        { provide: AttendanceService, useValue: {} },
        { provide: BackupService, useValue: {} },
        { provide: RecordingStorageService, useValue: {} },
        { provide: LiveClassSettingsService, useValue: {} },
        {
          provide: AnalyticsEventService,
          useValue: { record: jest.fn(), recordRecordingWatchOncePerDay: jest.fn() }
        }
      ]
    }).compile();

    service = module.get<LiveClassService>(LiveClassService);
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiveClassService,
        {
          provide: PrismaService,
          useValue: {
            coachClass: { findUnique: coachClassFindUnique },
            liveSession: { findUnique: liveSessionFindUnique },
            user: { findUnique: userFindUnique }
          }
        },
        { provide: JwtService, useValue: jwtService },
        { provide: LiveKitService, useValue: { listParticipants, generateAccessToken } },
        { provide: AttendanceService, useValue: { recordJoinEvent } },
        { provide: BackupService, useValue: {} },
        { provide: RecordingStorageService, useValue: {} },
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
        LiveClassService,
        {
          provide: PrismaService,
          useValue: {
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

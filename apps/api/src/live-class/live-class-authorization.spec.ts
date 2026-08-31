import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole, UserStatus } from "@prisma/client";
import { LiveClassService } from "./live-class.service";
import { LiveKitService } from "./livekit.service";
import { AttendanceService } from "../attendance/attendance.service";
import { BackupService } from "../backup/backup.service";
import { RecordingStorageService } from "./recording-storage.service";
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

  // A session owned by coach-1, for a batch containing student-1 only.
  const session = {
    id: "session-1",
    classId: "class-1",
    coachId: "coach-1",
    roomName: "room-1",
    batch: { students: [{ studentId: "student-1" }] }
  };

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    userFindUnique = jest.fn();
    liveSessionFindUnique = jest.fn().mockResolvedValue(session);
    chatFindMany = jest.fn().mockResolvedValue([]);
    chatCreate = jest.fn().mockResolvedValue({ id: 1 });

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
            senderId: "student-1"
          })
        })
      );
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
});

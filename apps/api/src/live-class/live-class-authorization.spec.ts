import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole, UserStatus } from "@prisma/client";
import { LiveClassService } from "./live-class.service";
import { LiveKitService } from "./livekit.service";
import { AttendanceService } from "../attendance/attendance.service";
import { BackupService } from "../backup/backup.service";
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
        { provide: BackupService, useValue: {} }
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

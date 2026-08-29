import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole, UserStatus } from "@prisma/client";
import { LiveSessionStatus } from "./types/live-class.types";
import { LiveClassService } from "./live-class.service";
import { LiveKitService } from "./livekit.service";
import { AttendanceService } from "../attendance/attendance.service";
import { BackupService } from "../backup/backup.service";
import { PrismaService } from "../prisma/prisma.service";

const ACCESS_TOKEN = "test-access-token";

describe("LiveClassService recording feature", () => {
  let service: LiveClassService;
  let jwtService: { verifyAsync: jest.Mock };
  let livekitService: { startRecording: jest.Mock; stopRecording: jest.Mock };
  let backupService: { getDownloadUrl: jest.Mock };
  let userFindUnique: jest.Mock;
  let liveSessionFindUnique: jest.Mock;
  let liveSessionFindMany: jest.Mock;
  let liveSessionUpdate: jest.Mock;

  const authenticateAs = (id: string, role: UserRole) => {
    jwtService.verifyAsync.mockResolvedValue({ sub: id, type: "access" });
    userFindUnique.mockResolvedValue({
      id,
      role,
      status: UserStatus.ACTIVE,
      firstName: "Test",
      lastName: "User",
    });
  };

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    livekitService = {
      startRecording: jest.fn().mockResolvedValue("egress_test_123"),
      stopRecording: jest.fn().mockResolvedValue(undefined),
    };
    backupService = {
      getDownloadUrl: jest.fn().mockResolvedValue({ url: "https://signed.download.url" }),
    };
    userFindUnique = jest.fn();
    liveSessionFindUnique = jest.fn();
    liveSessionFindMany = jest.fn().mockResolvedValue([]);
    liveSessionUpdate = jest.fn().mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiveClassService,
        {
          provide: PrismaService,
          useValue: {
            liveSession: {
              findUnique: liveSessionFindUnique,
              findMany: liveSessionFindMany,
              update: liveSessionUpdate,
            },
            user: { findUnique: userFindUnique },
            liveChatMessage: { create: jest.fn(), findMany: jest.fn() },
            coachClass: { update: jest.fn() },
          },
        },
        { provide: JwtService, useValue: jwtService },
        { provide: LiveKitService, useValue: livekitService },
        { provide: AttendanceService, useValue: {} },
        { provide: BackupService, useValue: backupService },
      ],
    }).compile();

    service = module.get<LiveClassService>(LiveClassService);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // startRecording
  // ─────────────────────────────────────────────────────────────────────────────
  describe("startRecording", () => {
    it("rejects unauthorized roles like student", async () => {
      authenticateAs("student-1", UserRole.STUDENT);

      await expect(
        service.startRecording(ACCESS_TOKEN, "class-1")
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(livekitService.startRecording).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when live session is not found", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      liveSessionFindUnique.mockResolvedValue(null);

      await expect(
        service.startRecording(ACCESS_TOKEN, "class-1")
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws BadRequestException when class is not LIVE", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      liveSessionFindUnique.mockResolvedValue({
        id: "session-1",
        classId: "class-1",
        status: LiveSessionStatus.SCHEDULED,
        roomName: "class_class-1",
        metadata: {},
      });

      await expect(
        service.startRecording(ACCESS_TOKEN, "class-1")
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("throws BadRequestException when recording is already in progress", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      liveSessionFindUnique.mockResolvedValue({
        id: "session-1",
        classId: "class-1",
        status: LiveSessionStatus.LIVE,
        roomName: "class_class-1",
        metadata: { egressId: "egress-active-999" },
      });

      await expect(
        service.startRecording(ACCESS_TOKEN, "class-1")
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("starts recording successfully for a coach", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      liveSessionFindUnique.mockResolvedValue({
        id: "session-1",
        classId: "class-1",
        status: LiveSessionStatus.LIVE,
        roomName: "class_class-1",
        metadata: {},
      });

      const result = await service.startRecording(ACCESS_TOKEN, "class-1");

      expect(result.success).toBe(true);
      expect(result.egressId).toBe("egress_test_123");
      expect(result.filepath).toMatch(/^recordings\/class_class-1-\d+\.mp4$/);
      expect(livekitService.startRecording).toHaveBeenCalledWith(
        "class_class-1",
        expect.stringMatching(/^recordings\/class_class-1-\d+\.mp4$/)
      );
      expect(liveSessionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "session-1" },
          data: {
            metadata: expect.objectContaining({
              egressId: "egress_test_123",
              recordingStatus: "RECORDING",
            }),
          },
        })
      );
    });

    it("starts recording successfully for an admin", async () => {
      authenticateAs("admin-1", UserRole.ADMIN);
      liveSessionFindUnique.mockResolvedValue({
        id: "session-1",
        classId: "class-1",
        status: LiveSessionStatus.LIVE,
        roomName: "class_class-1",
        metadata: {},
      });

      const result = await service.startRecording(ACCESS_TOKEN, "class-1");
      expect(result.success).toBe(true);
      expect(livekitService.startRecording).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // stopRecording
  // ─────────────────────────────────────────────────────────────────────────────
  describe("stopRecording", () => {
    it("rejects unauthorized roles like student", async () => {
      authenticateAs("student-1", UserRole.STUDENT);

      await expect(
        service.stopRecording(ACCESS_TOKEN, "class-1")
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(livekitService.stopRecording).not.toHaveBeenCalled();
    });

    it("throws BadRequestException when no active recording exists", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      liveSessionFindUnique.mockResolvedValue({
        id: "session-1",
        classId: "class-1",
        status: LiveSessionStatus.LIVE,
        roomName: "class_class-1",
        metadata: {},
      });

      await expect(
        service.stopRecording(ACCESS_TOKEN, "class-1")
      ).rejects.toThrow("No active recording found for this class.");
    });

    it("stops recording successfully and marks STOPPING in metadata", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      liveSessionFindUnique.mockResolvedValue({
        id: "session-1",
        classId: "class-1",
        status: LiveSessionStatus.LIVE,
        roomName: "class_class-1",
        metadata: {
          egressId: "egress_test_123",
          recordingFilepath: "recordings/class_class-1-123.mp4",
          recordingStatus: "RECORDING",
        },
      });

      const result = await service.stopRecording(ACCESS_TOKEN, "class-1");

      expect(result.success).toBe(true);
      expect(livekitService.stopRecording).toHaveBeenCalledWith("egress_test_123");
      expect(liveSessionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "session-1" },
          data: {
            metadata: {
              recordingFilepath: "recordings/class_class-1-123.mp4",
              recordingStatus: "STOPPING",
            },
          },
        })
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // handleEgressEnded (Webhook Lifecycle)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("handleEgressEnded", () => {
    it("updates metadata to RECORDING when egress_started arrives", async () => {
      liveSessionFindUnique.mockResolvedValue({
        id: "session-1",
        roomName: "class_class-1",
        metadata: {},
      });

      await service.handleEgressEnded({
        eventType: "egress_started",
        egressId: "egress-123",
        roomName: "class_class-1",
        status: 1, // EGRESS_ACTIVE
      });

      expect(liveSessionUpdate).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: {
          metadata: {
            egressId: "egress-123",
            recordingStatus: "RECORDING",
          },
        },
      });
    });

    it("updates metadata to STOPPING when egress_updated has ending status", async () => {
      liveSessionFindUnique.mockResolvedValue({
        id: "session-1",
        roomName: "class_class-1",
        metadata: { recordingStatus: "RECORDING" },
      });

      await service.handleEgressEnded({
        eventType: "egress_updated",
        egressId: "egress-123",
        roomName: "class_class-1",
        status: 2, // EGRESS_ENDING
      });

      expect(liveSessionUpdate).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: {
          metadata: {
            recordingStatus: "STOPPING",
          },
        },
      });
    });

    it("finalizes recording on successful egress completion and normalizes key", async () => {
      liveSessionFindUnique.mockResolvedValue({
        id: "session-1",
        roomName: "class_class-1",
        metadata: {
          egressId: "egress-123",
          recordingFilepath: "recordings/class_class-1-100.mp4",
          recordingStatus: "STOPPING",
        },
      });

      await service.handleEgressEnded({
        eventType: "egress_ended",
        egressId: "egress-123",
        roomName: "class_class-1",
        status: 3, // EGRESS_COMPLETE
        fileResults: [
          {
            location: "https://compat.objectstorage.us-ashburn-1.oci.customer-oci.com/recordings/class_class-1-100.mp4",
            filename: "recordings/class_class-1-100.mp4",
          },
        ],
      });

      expect(liveSessionUpdate).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: {
          recordingUrl: "recordings/class_class-1-100.mp4",
          metadata: {
            recordingFilepath: "recordings/class_class-1-100.mp4",
            recordingStatus: "COMPLETED",
          },
        },
      });
    });

    it("marks recording FAILED when egress status is failed or aborted", async () => {
      liveSessionFindUnique.mockResolvedValue({
        id: "session-1",
        roomName: "class_class-1",
        metadata: {
          egressId: "egress-123",
          recordingFilepath: "recordings/class_class-1-100.mp4",
          recordingStatus: "STOPPING",
        },
      });

      await service.handleEgressEnded({
        eventType: "egress_ended",
        egressId: "egress-123",
        roomName: "class_class-1",
        status: 4, // EGRESS_FAILED
      });

      expect(liveSessionUpdate).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: {
          recordingUrl: null,
          metadata: {
            recordingFilepath: "recordings/class_class-1-100.mp4",
            recordingStatus: "FAILED",
          },
        },
      });
    });

    it("finds session by metadata egressId if roomName is not in the webhook payload", async () => {
      liveSessionFindUnique.mockResolvedValue(null);
      liveSessionFindMany.mockResolvedValue([
        {
          id: "session-matched",
          roomName: "class_class-matched",
          metadata: { egressId: "egress-matching-key" },
        },
      ]);

      await service.handleEgressEnded({
        eventType: "egress_ended",
        egressId: "egress-matching-key",
        status: 3,
        file: { filename: "recordings/matched.mp4" },
      });

      expect(liveSessionUpdate).toHaveBeenCalledWith({
        where: { id: "session-matched" },
        data: {
          recordingUrl: "recordings/matched.mp4",
          metadata: {
            recordingFilepath: "recordings/matched.mp4",
            recordingStatus: "COMPLETED",
          },
        },
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // downloadRecording
  // ─────────────────────────────────────────────────────────────────────────────
  describe("downloadRecording", () => {
    const liveSessionWithRecording = {
      id: "session-1",
      classId: "class-1",
      coachId: "coach-1",
      recordingUrl: "recordings/class_class-1-123.mp4",
      batch: {
        students: [
          { studentId: "student-enrolled", isDeleted: false },
          { studentId: "student-deleted", isDeleted: true },
        ],
      },
    };

    it("allows Super Admin to download recording", async () => {
      authenticateAs("admin-super", UserRole.SUPER_ADMIN);
      liveSessionFindUnique.mockResolvedValue(liveSessionWithRecording);

      const res = await service.downloadRecording(ACCESS_TOKEN, "class-1");
      expect(res).toEqual({ url: "https://signed.download.url" });
      expect(backupService.getDownloadUrl).toHaveBeenCalledWith(
        "recordings/class_class-1-123.mp4"
      );
    });

    it("allows Admin to download recording", async () => {
      authenticateAs("admin-1", UserRole.ADMIN);
      liveSessionFindUnique.mockResolvedValue(liveSessionWithRecording);

      const res = await service.downloadRecording(ACCESS_TOKEN, "class-1");
      expect(res).toEqual({ url: "https://signed.download.url" });
    });

    it("allows the owning Coach to download recording", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      liveSessionFindUnique.mockResolvedValue(liveSessionWithRecording);

      const res = await service.downloadRecording(ACCESS_TOKEN, "class-1");
      expect(res).toEqual({ url: "https://signed.download.url" });
    });

    it("allows an active enrolled Student in the batch to download recording", async () => {
      authenticateAs("student-enrolled", UserRole.STUDENT);
      liveSessionFindUnique.mockResolvedValue(liveSessionWithRecording);

      const res = await service.downloadRecording(ACCESS_TOKEN, "class-1");
      expect(res).toEqual({ url: "https://signed.download.url" });
    });

    it("rejects another Coach who does not own the class", async () => {
      authenticateAs("coach-intruder", UserRole.COACH);
      liveSessionFindUnique.mockResolvedValue(liveSessionWithRecording);

      await expect(
        service.downloadRecording(ACCESS_TOKEN, "class-1")
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("rejects an unenrolled Student", async () => {
      authenticateAs("student-stranger", UserRole.STUDENT);
      liveSessionFindUnique.mockResolvedValue(liveSessionWithRecording);

      await expect(
        service.downloadRecording(ACCESS_TOKEN, "class-1")
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("rejects a soft-deleted Student in the batch", async () => {
      authenticateAs("student-deleted", UserRole.STUDENT);
      liveSessionFindUnique.mockResolvedValue(liveSessionWithRecording);

      await expect(
        service.downloadRecording(ACCESS_TOKEN, "class-1")
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("throws NotFoundException when recording is missing", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      liveSessionFindUnique.mockResolvedValue({
        ...liveSessionWithRecording,
        recordingUrl: null,
      });

      await expect(
        service.downloadRecording(ACCESS_TOKEN, "class-1")
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

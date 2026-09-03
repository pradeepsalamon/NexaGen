import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole, UserStatus } from "@prisma/client";
import { LiveClassSettingsService } from "./live-class-settings.service";
import { PrismaService } from "../prisma/prisma.service";

const TOKEN = "access-token";

describe("LiveClassSettingsService", () => {
  let service: LiveClassSettingsService;
  let jwt: { verifyAsync: jest.Mock };
  let prisma: {
    user: { findUnique: jest.Mock };
    liveClassPolicy: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    coachClass: { findUnique: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    batch: { findFirst: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    liveClassPreset: { findUnique: jest.Mock };
    trashAuditLog: { create: jest.Mock; findMany: jest.Mock };
  };

  const authAs = (id: string, role: UserRole) => {
    jwt.verifyAsync.mockResolvedValue({ sub: id, type: "access" });
    prisma.user.findUnique.mockResolvedValue({ id, role, status: UserStatus.ACTIVE });
  };

  beforeEach(async () => {
    jwt = { verifyAsync: jest.fn() };
    prisma = {
      user: { findUnique: jest.fn() },
      liveClassPolicy: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({
          id: "policy-1",
          name: data.name,
          settings: data.settings,
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        })),
        update: jest.fn().mockImplementation(({ data }) => ({
          id: "policy-1",
          name: "Default Live Class Policy",
          settings: data.settings,
          updatedAt: new Date("2026-01-02T00:00:00Z"),
        })),
      },
      coachClass: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      batch: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      liveClassPreset: { findUnique: jest.fn() },
      trashAuditLog: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiveClassSettingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    service = module.get(LiveClassSettingsService);
  });

  describe("system policy", () => {
    it("lazily creates the singleton with safe defaults", async () => {
      authAs("admin-1", UserRole.ADMIN);
      const res = await service.getPolicy(TOKEN);
      expect(prisma.liveClassPolicy.create).toHaveBeenCalled();
      expect(res.settings.student.mic).toBe("JOIN_MUTED");
      expect(res.settings.student.camera).toBe("JOIN_OFF");
      expect(res.settings.student.screenShare).toBe("DISABLED");
    });

    it("rejects a non-admin updating the policy", async () => {
      authAs("coach-1", UserRole.COACH);
      await expect(
        service.updatePolicy(TOKEN, { settings: { student: { chat: "DISABLED" } } }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("merges an admin override onto current defaults and audits it", async () => {
      authAs("admin-1", UserRole.SUPER_ADMIN);
      const res = await service.updatePolicy(TOKEN, {
        settings: { student: { mic: "JOIN_UNMUTED" } },
      });
      expect(res.settings.student.mic).toBe("JOIN_UNMUTED");
      expect(res.settings.student.camera).toBe("JOIN_OFF");
      expect(prisma.trashAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "LIVE_SETTINGS_CHANGE", entity: "LiveClassPolicy" }),
        }),
      );
    });
  });

  describe("per-class resolution", () => {
    it("resolves system -> batch -> class with last layer winning", async () => {
      prisma.coachClass.findUnique.mockResolvedValue({
        id: "class-1",
        coachId: "coach-1",
        liveClassSettings: { student: { screenShare: "ALLOWED" } },
        batch: { id: "batch-1", liveClassSettings: { student: { mic: "JOIN_UNMUTED", screenShare: "DISABLED" } } },
        liveSession: null,
      });

      const { resolved } = await service.resolveForClass("class-1");
      // batch loosened mic, class re-loosened screenShare over the batch value
      expect(resolved.student.mic).toBe("JOIN_UNMUTED");
      expect(resolved.student.screenShare).toBe("ALLOWED");
      // untouched keys fall through to system defaults
      expect(resolved.student.camera).toBe("JOIN_OFF");
    });

    it("blocks a coach who does not own the class", async () => {
      authAs("coach-2", UserRole.COACH);
      prisma.coachClass.findUnique.mockResolvedValue({
        id: "class-1",
        coachId: "coach-1",
        liveClassSettings: null,
        batch: null,
        liveSession: null,
      });
      await expect(service.getSettingsForClass(TOKEN, "class-1")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("copies a preset into the class override when presetId is supplied", async () => {
      authAs("coach-1", UserRole.COACH);
      prisma.coachClass.findUnique.mockResolvedValue({
        id: "class-1",
        coachId: "coach-1",
        liveClassSettings: null,
        batch: null,
        liveSession: null,
      });
      prisma.liveClassPreset.findUnique.mockResolvedValue({
        id: "preset-1",
        scope: "ORG",
        isSystem: true,
        ownerId: null,
        settings: { student: { camera: "JOIN_ON" } },
      });

      await service.updateSettingsForClass(TOKEN, "class-1", { liveClassSettings: null, presetId: "preset-1" });

      expect(prisma.coachClass.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { liveClassSettings: { student: { camera: "JOIN_ON" } } },
        }),
      );
    });
  });

  describe("audit log", () => {
    it("rejects a non-admin", async () => {
      authAs("coach-1", UserRole.COACH);
      await expect(service.getAuditLog(TOKEN)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("returns recent LIVE_SETTINGS_CHANGE rows with resolved names and a field diff", async () => {
      authAs("admin-1", UserRole.ADMIN);
      prisma.trashAuditLog.findMany.mockResolvedValue([
        {
          id: "audit-1",
          entity: "CoachClass",
          entityId: "class-1",
          createdAt: new Date("2026-02-01T00:00:00Z"),
          user: { firstName: "Ada", lastName: "Coach" },
          metadata: {
            scope: "CLASS",
            before: { student: { mic: "JOIN_MUTED" } },
            after: { student: { mic: "FORCED_OFF" } },
          },
        },
      ]);
      prisma.coachClass.findMany.mockResolvedValue([{ id: "class-1", title: "Endgames", topic: null }]);

      const { entries } = await service.getAuditLog(TOKEN);

      expect(prisma.trashAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { action: "LIVE_SETTINGS_CHANGE" } }),
      );
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        entity: "CoachClass",
        entityName: "Endgames",
        actorName: "Ada Coach",
        scope: "CLASS",
        before: { student: { mic: "JOIN_MUTED" } },
        after: { student: { mic: "FORCED_OFF" } },
      });
    });
  });

  describe("batch defaults", () => {
    it("lets a coach in the batch read but not edit", async () => {
      authAs("coach-1", UserRole.COACH);
      prisma.batch.findFirst.mockResolvedValue({
        id: "batch-1",
        liveClassSettings: null,
        coaches: [{ coachId: "coach-1" }],
      });
      const res = await service.getSettingsForBatch(TOKEN, "batch-1");
      expect(res.canEdit).toBe(false);

      await expect(
        service.updateSettingsForBatch(TOKEN, "batch-1", { liveClassSettings: {} }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("preset visibility", () => {
    it("rejects using another coach's personal preset", async () => {
      prisma.liveClassPreset.findUnique.mockResolvedValue({
        id: "preset-x",
        scope: "PERSONAL",
        isSystem: false,
        ownerId: "coach-9",
        settings: {},
      });
      await expect(
        service.presetOverrideById("preset-x", { id: "coach-1", role: UserRole.COACH }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it("surfaces validation issues as a BadRequest", async () => {
    authAs("admin-1", UserRole.ADMIN);
    // waitingRoom only has DISABLED in v1, so this cannot actually trip today —
    // guard the wiring instead by spying.
    jest
      .spyOn(service as unknown as { assertValid: (s: unknown) => void }, "assertValid")
      .mockImplementation(() => {
        throw new BadRequestException(["bad"]);
      });
    await expect(
      service.updatePolicy(TOKEN, { settings: {} }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

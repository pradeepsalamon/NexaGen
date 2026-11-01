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
    liveClassPolicy: { findFirst: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    coachClass: { findUnique: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    batch: { findFirst: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    liveClassPreset: { findUnique: jest.Mock };
    trashAuditLog: { create: jest.Mock; findMany: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
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
        findUnique: jest.fn(),
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
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(),
    };
    // The row re-read under lock sees whatever the active-policy lookup (or its lazy create) returned.
    prisma.liveClassPolicy.findUnique = jest.fn().mockImplementation(
      async () =>
        (await prisma.liveClassPolicy.findFirst()) ?? prisma.liveClassPolicy.create.mock.results.at(-1)?.value,
    );
    prisma.$transaction.mockImplementation((run: (tx: unknown) => unknown) => run(prisma));

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

  // V1 (docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md §2.5): admin locks.
  describe("locks", () => {
    const academyPolicy = (settings: Record<string, unknown>) =>
      prisma.liveClassPolicy.findFirst.mockResolvedValue({
        id: "policy-1",
        name: "Default Live Class Policy",
        settings,
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      });
    const ownClass = (over: Record<string, unknown> = {}) =>
      prisma.coachClass.findUnique.mockResolvedValue({
        id: "class-1",
        coachId: "coach-1",
        liveClassSettings: null,
        batch: { id: "batch-1", liveClassSettings: null },
        liveSession: null,
        ...over,
      });

    it("refuses a coach changing an academy-locked field, and writes nothing", async () => {
      authAs("coach-1", UserRole.COACH);
      academyPolicy({ recording: "DISABLED", locks: ["recording"] });
      ownClass();

      await expect(
        service.updateSettingsForClass(TOKEN, "class-1", { liveClassSettings: { recording: "AUTO_START" } }),
      ).rejects.toThrow(/Locked by academy policy: Recording/);
      expect(prisma.coachClass.update).not.toHaveBeenCalled();
    });

    it("refuses a coach changing a batch-locked field (waiting room)", async () => {
      authAs("coach-1", UserRole.COACH);
      ownClass({ batch: { id: "batch-1", liveClassSettings: { waitingRoom: "ENABLED", locks: ["waitingRoom"] } } });

      await expect(
        service.updateSettingsForClass(TOKEN, "class-1", { liveClassSettings: { waitingRoom: "DISABLED" } }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("binds an admin editing one class too (change it at the locking layer)", async () => {
      authAs("admin-1", UserRole.ADMIN);
      academyPolicy({ student: { camera: "FORCED_OFF" }, locks: ["student.camera"] });
      ownClass();

      await expect(
        service.updateSettingsForClass(TOKEN, "class-1", {
          liveClassSettings: { student: { camera: "JOIN_ON" } },
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("still saves unlocked fields, stripping a stale locked value", async () => {
      authAs("coach-1", UserRole.COACH);
      academyPolicy({ recording: "DISABLED", locks: ["recording"] });
      ownClass({ liveClassSettings: { recording: "MANUAL" } }); // saved before the lock existed

      await service.updateSettingsForClass(TOKEN, "class-1", {
        liveClassSettings: { recording: "MANUAL", student: { chat: "DISABLED" } },
      });

      expect(prisma.coachClass.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { liveClassSettings: { student: { chat: "DISABLED" } } } }),
      );
    });

    it("drops a preset's locked fields instead of applying them", async () => {
      authAs("coach-1", UserRole.COACH);
      academyPolicy({ student: { screenShare: "DISABLED" }, locks: ["student.screenShare"] });
      ownClass();
      prisma.liveClassPreset.findUnique.mockResolvedValue({
        id: "preset-1",
        scope: "ORG",
        isSystem: false,
        ownerId: null,
        settings: { student: { screenShare: "ALLOWED", reactions: "DISABLED" } },
      });

      await service.updateSettingsForClass(TOKEN, "class-1", { liveClassSettings: null, presetId: "preset-1" });

      expect(prisma.coachClass.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { liveClassSettings: { student: { reactions: "DISABLED" } } } }),
      );
    });

    it("resolves the class (snapshot and tokens) with locks applied and reports them", async () => {
      authAs("coach-1", UserRole.COACH);
      academyPolicy({ recording: "DISABLED", locks: ["recording"] });
      ownClass({
        liveClassSettings: { recording: "AUTO_START", student: { camera: "JOIN_ON" } },
        batch: { id: "batch-1", liveClassSettings: { locks: ["student.mic"] } },
      });

      const res = await service.getSettingsForClass(TOKEN, "class-1");
      expect(res.resolved.recording).toBe("DISABLED");
      expect(res.resolved.student.camera).toBe("JOIN_ON");
      expect(res.systemLocks).toEqual(["recording"]);
      expect(res.batchLocks).toEqual(["student.mic"]);
    });

    it("lets an admin set academy locks, stored beside the settings and audited", async () => {
      authAs("admin-1", UserRole.ADMIN);
      const res = await service.updatePolicy(TOKEN, {
        settings: { waitingRoom: "ENABLED" },
        locks: ["waitingRoom", "recording"],
      });

      expect(res.locks).toEqual(["recording", "waitingRoom"]);
      const stored = prisma.liveClassPolicy.update.mock.calls[0][0].data.settings;
      expect(stored.locks).toEqual(["recording", "waitingRoom"]);
      expect(stored.waitingRoom).toBe("ENABLED");
      expect(prisma.trashAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({ locksAfter: ["recording", "waitingRoom"], locksBefore: [] }),
          }),
        }),
      );
    });

    it("keeps academy locks when a policy save omits them", async () => {
      authAs("admin-1", UserRole.ADMIN);
      academyPolicy({ recording: "DISABLED", locks: ["recording"] });
      const res = await service.updatePolicy(TOKEN, { settings: { student: { chat: "DISABLED" } } });
      expect(res.locks).toEqual(["recording"]);
    });

    it("never lets a coach set locks (policy or batch)", async () => {
      authAs("coach-1", UserRole.COACH);
      await expect(service.updatePolicy(TOKEN, { settings: {}, locks: [] })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        service.updateSettingsForBatch(TOKEN, "batch-1", { liveClassSettings: null, locks: [] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("stores batch locks, refuses a batch default that changes an academy-locked field", async () => {
      authAs("admin-1", UserRole.ADMIN);
      academyPolicy({ recording: "DISABLED", locks: ["recording"] });
      prisma.batch.findFirst.mockResolvedValue({
        id: "batch-1",
        liveClassSettings: null,
        coaches: [],
      });

      await expect(
        service.updateSettingsForBatch(TOKEN, "batch-1", { liveClassSettings: { recording: "MANUAL" } }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      await service.updateSettingsForBatch(TOKEN, "batch-1", {
        liveClassSettings: { waitingRoom: "ENABLED" },
        locks: ["waitingRoom", "recording"],
      });
      // "recording" is already locked academy-wide, so the batch doesn't re-lock it.
      expect(prisma.batch.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { liveClassSettings: { waitingRoom: "ENABLED", locks: ["waitingRoom"] } } }),
      );
    });

    it("keeps a batch lock and value that predate an academy lock on the same field", async () => {
      authAs("admin-1", UserRole.ADMIN);
      academyPolicy({ recording: "DISABLED", locks: ["recording"] });
      prisma.batch.findFirst.mockResolvedValue({
        id: "batch-1",
        liveClassSettings: { recording: "MANUAL", locks: ["recording"] },
        coaches: [],
      });

      // The editor omits the academy-locked field and its lock entirely.
      await service.updateSettingsForBatch(TOKEN, "batch-1", {
        liveClassSettings: { waitingRoom: "ENABLED" },
        locks: ["waitingRoom"],
      });

      expect(prisma.batch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            liveClassSettings: { waitingRoom: "ENABLED", recording: "MANUAL", locks: ["recording", "waitingRoom"] },
          },
        }),
      );
    });

    it("keeps a batch-locked field at the batch value when the class overrides it", async () => {
      authAs("coach-1", UserRole.COACH);
      ownClass({
        liveClassSettings: { student: { mic: "JOIN_UNMUTED" } },
        batch: { id: "batch-1", liveClassSettings: { student: { mic: "JOIN_MUTED" }, locks: ["student.mic"] } },
      });

      const res = await service.getSettingsForClass(TOKEN, "class-1");
      expect(res.resolved.student.mic).toBe("JOIN_MUTED");
    });

    it("names the batch, not the academy, when a batch lock refuses a class change", async () => {
      authAs("coach-1", UserRole.COACH);
      academyPolicy({ recording: "DISABLED", locks: ["recording"] });
      ownClass({ batch: { id: "batch-1", liveClassSettings: { waitingRoom: "ENABLED", locks: ["waitingRoom"] } } });

      const attempt = service.updateSettingsForClass(TOKEN, "class-1", {
        liveClassSettings: { waitingRoom: "DISABLED", recording: "AUTO_START" },
      });
      await expect(attempt).rejects.toThrow(
        "Locked by academy policy: Recording. Locked by batch settings: Waiting room. Ask an admin to change it.",
      );
    });

    it("re-reads the lock lists under row locks, in policy → batch → class order", async () => {
      authAs("coach-1", UserRole.COACH);
      ownClass({ batchId: "batch-1" });

      await service.updateSettingsForClass(TOKEN, "class-1", { liveClassSettings: { student: { chat: "DISABLED" } } });

      const sql = prisma.$queryRaw.mock.calls.map((call: [TemplateStringsArray]) => call[0].join("?"));
      expect(sql[0]).toContain('"live_class_policies"');
      expect(sql[1]).toContain('"batches"');
      expect(sql[2]).toContain('"classes"');
      expect(sql[2]).toContain("FOR UPDATE");
      expect(prisma.coachClass.update.mock.invocationCallOrder[0]).toBeGreaterThan(
        prisma.$queryRaw.mock.invocationCallOrder[2],
      );
    });

    it("rolls back (propagates) when the audit row can't be written", async () => {
      authAs("admin-1", UserRole.ADMIN);
      prisma.trashAuditLog.create.mockRejectedValue(new Error("audit insert failed"));

      await expect(service.updatePolicy(TOKEN, { settings: {}, locks: ["recording"] })).rejects.toThrow(
        "audit insert failed",
      );
      expect(prisma.$transaction).toHaveBeenCalled();
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

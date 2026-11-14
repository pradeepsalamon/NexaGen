import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole, UserStatus } from "@prisma/client";
import { LiveClassPresetService } from "./live-class-preset.service";
import { PrismaService } from "../prisma/prisma.service";

const TOKEN = "access-token";

describe("LiveClassPresetService authorization", () => {
  let service: LiveClassPresetService;
  let jwt: { verifyAsync: jest.Mock };
  let prisma: {
    user: { findUnique: jest.Mock };
    liveClassPreset: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const authAs = (id: string, role: UserRole) => {
    jwt.verifyAsync.mockResolvedValue({ sub: id, type: "access" });
    prisma.user.findUnique.mockResolvedValue({ id, role, status: UserStatus.ACTIVE });
  };

  const preset = (over: Partial<Record<string, unknown>> = {}) => ({
    id: "preset-1",
    ownerId: "coach-1",
    name: "My preset",
    description: null,
    scope: "PERSONAL",
    isSystem: false,
    isDefault: false,
    settings: {},
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    owner: { firstName: "C", lastName: "One" },
    ...over,
  });

  beforeEach(async () => {
    jwt = { verifyAsync: jest.fn() };
    prisma = {
      user: { findUnique: jest.fn() },
      liveClassPreset: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => preset(data)),
        update: jest.fn().mockImplementation(({ data }) => preset(data)),
        delete: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn().mockImplementation((cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiveClassPresetService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    service = module.get(LiveClassPresetService);
  });

  describe("create", () => {
    it("blocks a coach from creating an organisation preset", async () => {
      authAs("coach-1", UserRole.COACH);
      await expect(
        service.create(TOKEN, { name: "Org", scope: "ORG", settings: {} }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("lets an admin create an organisation preset with a null owner", async () => {
      authAs("admin-1", UserRole.ADMIN);
      await service.create(TOKEN, { name: "Org", scope: "ORG", settings: {} });
      expect(prisma.liveClassPreset.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ownerId: null, scope: "ORG" }) }),
      );
    });

    it("blocks a student from creating any preset", async () => {
      authAs("student-1", UserRole.STUDENT);
      await expect(
        service.create(TOKEN, { name: "x", scope: "PERSONAL", settings: {} }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("update", () => {
    it("rejects a coach editing another coach's personal preset", async () => {
      authAs("coach-2", UserRole.COACH);
      prisma.liveClassPreset.findUnique.mockResolvedValue(preset({ ownerId: "coach-1" }));
      await expect(service.update(TOKEN, "preset-1", { name: "hijack" })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("rejects a coach editing an organisation preset", async () => {
      authAs("coach-1", UserRole.COACH);
      prisma.liveClassPreset.findUnique.mockResolvedValue(
        preset({ ownerId: null, scope: "ORG" }),
      );
      await expect(service.update(TOKEN, "preset-1", { name: "x" })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("lets an admin edit an organisation preset", async () => {
      authAs("admin-1", UserRole.SUPER_ADMIN);
      prisma.liveClassPreset.findUnique.mockResolvedValue(
        preset({ ownerId: null, scope: "ORG" }),
      );
      await service.update(TOKEN, "preset-1", { name: "renamed" });
      expect(prisma.liveClassPreset.update).toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("never deletes a system preset, even for an admin", async () => {
      authAs("admin-1", UserRole.SUPER_ADMIN);
      prisma.liveClassPreset.findUnique.mockResolvedValue(
        preset({ isSystem: true, scope: "ORG", ownerId: null }),
      );
      await expect(service.remove(TOKEN, "preset-1")).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.liveClassPreset.delete).not.toHaveBeenCalled();
    });

    it("404s an unknown preset", async () => {
      authAs("admin-1", UserRole.ADMIN);
      prisma.liveClassPreset.findUnique.mockResolvedValue(null);
      await expect(service.remove(TOKEN, "nope")).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("list", () => {
    it("scopes a coach to their own + organisation presets", async () => {
      authAs("coach-1", UserRole.COACH);
      await service.list(TOKEN);
      expect(prisma.liveClassPreset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ scope: "ORG" }, { ownerId: "coach-1" }] },
        }),
      );
    });

    it("gives an admin every preset", async () => {
      authAs("admin-1", UserRole.ADMIN);
      await service.list(TOKEN);
      expect(prisma.liveClassPreset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });
});

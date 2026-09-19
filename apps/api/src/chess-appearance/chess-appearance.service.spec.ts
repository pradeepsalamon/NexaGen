import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole, UserStatus } from "@prisma/client";
import { ChessAppearanceService } from "./chess-appearance.service";
import { PrismaService } from "../prisma/prisma.service";

const TOKEN = "access-token";

describe("ChessAppearanceService", () => {
  let service: ChessAppearanceService;
  let jwt: { verifyAsync: jest.Mock };
  let prisma: {
    user: { findUnique: jest.Mock };
    chessAppearanceSettings: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    userChessAppearancePreference: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  const authAs = (id: string, role: UserRole) => {
    jwt.verifyAsync.mockResolvedValue({ sub: id, type: "access" });
    prisma.user.findUnique.mockResolvedValue({ id, role, status: UserStatus.ACTIVE });
  };

  beforeEach(async () => {
    jwt = { verifyAsync: jest.fn() };
    prisma = {
      user: { findUnique: jest.fn() },
      chessAppearanceSettings: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({
          id: "settings-1",
          name: data.name,
          settings: data.settings,
          disabledBoardThemeIds: [],
          disabledPieceSetIds: [],
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        })),
        update: jest.fn().mockImplementation(({ data }) => ({
          id: "settings-1",
          name: "Default Chess Appearance Settings",
          settings: data.settings,
          disabledBoardThemeIds: data.disabledBoardThemeIds ?? [],
          disabledPieceSetIds: data.disabledPieceSetIds ?? [],
          updatedAt: new Date("2026-01-02T00:00:00Z"),
        })),
      },
      userChessAppearancePreference: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChessAppearanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    service = module.get(ChessAppearanceService);
  });

  describe("resolved appearance", () => {
    it("a new user with no admin override gets the Nexa Classic system default", async () => {
      authAs("student-1", UserRole.STUDENT);
      const res = await service.getResolvedAppearance(TOKEN);
      expect(prisma.chessAppearanceSettings.create).toHaveBeenCalled();
      expect(res.source).toBe("system-default");
      expect(res.config.boardThemeId).toBe("nexa-classic");
      expect(res.config.pieceSetId).toBe("classic");
    });

    it("a new user picks up the admin global default", async () => {
      authAs("student-1", UserRole.STUDENT);
      prisma.chessAppearanceSettings.findFirst.mockResolvedValue({
        id: "settings-1",
        settings: { boardThemeId: "classic-green" },
        disabledBoardThemeIds: [],
        disabledPieceSetIds: [],
        updatedAt: new Date(),
      });
      const res = await service.getResolvedAppearance(TOKEN);
      expect(res.source).toBe("admin-default");
      expect(res.config.boardThemeId).toBe("classic-green");
    });

    it("a user's own preference wins over the admin default", async () => {
      authAs("student-1", UserRole.STUDENT);
      prisma.chessAppearanceSettings.findFirst.mockResolvedValue({
        id: "settings-1",
        settings: { boardThemeId: "classic-green" },
        disabledBoardThemeIds: [],
        disabledPieceSetIds: [],
        updatedAt: new Date(),
      });
      prisma.userChessAppearancePreference.findUnique.mockResolvedValue({
        settings: { boardThemeId: "dark", pieceSetId: "modern" },
      });
      const res = await service.getResolvedAppearance(TOKEN);
      expect(res.source).toBe("user");
      expect(res.config.boardThemeId).toBe("dark");
      expect(res.config.pieceSetId).toBe("modern");
    });
  });

  describe("user preference", () => {
    it("saves a partial preference via upsert", async () => {
      authAs("student-1", UserRole.STUDENT);
      await service.updateMyPreference(TOKEN, { settings: { boardThemeId: "blue" } });
      expect(prisma.userChessAppearancePreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "student-1" },
          create: { userId: "student-1", settings: { boardThemeId: "blue" } },
          update: { settings: { boardThemeId: "blue" } },
        }),
      );
    });

    it("merges a single-field patch onto an existing preference without clobbering other fields", async () => {
      authAs("student-1", UserRole.STUDENT);
      prisma.userChessAppearancePreference.findUnique.mockResolvedValue({
        settings: { boardThemeId: "dark", pieceSetId: "modern" },
      });
      const res = await service.updateMyPreference(TOKEN, { settings: { showCoordinates: false } });
      expect(prisma.userChessAppearancePreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: {
            userId: "student-1",
            settings: { boardThemeId: "dark", pieceSetId: "modern", showCoordinates: false },
          },
          update: {
            settings: { boardThemeId: "dark", pieceSetId: "modern", showCoordinates: false },
          },
        }),
      );
      expect(res.config.boardThemeId).toBe("dark");
      expect(res.config.pieceSetId).toBe("modern");
      expect(res.config.showCoordinates).toBe(false);
    });

    it("reset removes the preference row so the admin default applies again", async () => {
      authAs("student-1", UserRole.STUDENT);
      prisma.chessAppearanceSettings.findFirst.mockResolvedValue({
        id: "settings-1",
        settings: { boardThemeId: "classic-green" },
        disabledBoardThemeIds: [],
        disabledPieceSetIds: [],
        updatedAt: new Date(),
      });
      const res = await service.resetMyPreference(TOKEN);
      expect(prisma.userChessAppearancePreference.deleteMany).toHaveBeenCalledWith({
        where: { userId: "student-1" },
      });
      expect(res.source).toBe("admin-default");
      expect(res.config.boardThemeId).toBe("classic-green");
    });
  });

  describe("catalog", () => {
    it("filters out admin-disabled themes and piece sets", async () => {
      authAs("coach-1", UserRole.COACH);
      prisma.chessAppearanceSettings.findFirst.mockResolvedValue({
        id: "settings-1",
        settings: {},
        disabledBoardThemeIds: ["dark"],
        disabledPieceSetIds: ["wooden"],
        updatedAt: new Date(),
      });
      const res = await service.getCatalog(TOKEN);
      expect(res.boardThemes.map((t) => t.id)).not.toContain("dark");
      expect(res.pieceSets.map((p) => p.id)).not.toContain("wooden");
      expect(res.boardThemes.length).toBe(5);
      expect(res.pieceSets.length).toBe(4);
    });
  });

  describe("admin global default", () => {
    it("rejects a non-admin reading the global settings", async () => {
      authAs("coach-1", UserRole.COACH);
      await expect(service.getGlobalSettings(TOKEN)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("rejects a student updating the global settings", async () => {
      authAs("student-1", UserRole.STUDENT);
      await expect(
        service.updateGlobalSettings(TOKEN, { settings: { boardThemeId: "blue" } }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("an admin can update the global default and disabled-id lists", async () => {
      authAs("admin-1", UserRole.SUPER_ADMIN);
      const res = await service.updateGlobalSettings(TOKEN, {
        settings: { boardThemeId: "brown" },
        disabledBoardThemeIds: ["minimal"],
      });
      expect(res.settings.boardThemeId).toBe("brown");
      expect(res.disabledBoardThemeIds).toEqual(["minimal"]);
      expect(res.resolved.boardThemeId).toBe("brown");
    });

    it("merges a single-field patch onto the existing global default without clobbering other fields", async () => {
      authAs("admin-1", UserRole.ADMIN);
      prisma.chessAppearanceSettings.findFirst.mockResolvedValue({
        id: "settings-1",
        settings: { boardThemeId: "dark", pieceSetId: "modern" },
        disabledBoardThemeIds: [],
        disabledPieceSetIds: [],
        updatedAt: new Date(),
      });
      const res = await service.updateGlobalSettings(TOKEN, { settings: { showCoordinates: false } });
      expect(res.settings).toEqual({ boardThemeId: "dark", pieceSetId: "modern", showCoordinates: false });
      expect(res.resolved.boardThemeId).toBe("dark");
      expect(res.resolved.pieceSetId).toBe("modern");
    });

    it("reset clears the override and disabled-id lists", async () => {
      authAs("admin-1", UserRole.ADMIN);
      const res = await service.resetGlobalSettings(TOKEN);
      expect(res.settings).toEqual({});
      expect(res.disabledBoardThemeIds).toEqual([]);
      expect(res.resolved.boardThemeId).toBe("nexa-classic");
    });
  });
});

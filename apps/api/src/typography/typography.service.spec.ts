import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole, UserStatus } from "@prisma/client";
import { DEFAULT_TYPOGRAPHY } from "@nexa-chess/types";
import { TypographyService } from "./typography.service";
import { PrismaService } from "../prisma/prisma.service";

const TOKEN = "access-token";

describe("TypographyService", () => {
  let service: TypographyService;
  let jwt: { verifyAsync: jest.Mock };
  let settingsRow: { id: string; settings: unknown; locked: boolean; updatedAt: Date } | null;
  let prisma: {
    user: { findUnique: jest.Mock };
    typographySettings: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    userTypographyPreference: { findUnique: jest.Mock; upsert: jest.Mock; deleteMany: jest.Mock };
  };

  const authAs = (id: string, role: UserRole) => {
    jwt.verifyAsync.mockResolvedValue({ sub: id, type: "access" });
    prisma.user.findUnique.mockResolvedValue({ id, role, status: UserStatus.ACTIVE });
  };

  beforeEach(async () => {
    settingsRow = null;
    jwt = { verifyAsync: jest.fn() };
    prisma = {
      user: { findUnique: jest.fn() },
      typographySettings: {
        findFirst: jest.fn().mockImplementation(() => settingsRow),
        create: jest.fn().mockImplementation(({ data }) => {
          settingsRow = {
            id: "settings-1",
            settings: data.settings,
            locked: false,
            updatedAt: new Date("2026-01-01T00:00:00Z"),
          };
          return settingsRow;
        }),
        update: jest.fn().mockImplementation(({ data }) => {
          settingsRow = {
            ...(settingsRow as NonNullable<typeof settingsRow>),
            ...data,
            updatedAt: new Date("2026-01-02T00:00:00Z"),
          };
          return settingsRow;
        }),
      },
      userTypographyPreference: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TypographyService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    service = module.get(TypographyService);
  });

  it("rejects a missing token", async () => {
    await expect(service.getResolved(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("resolves to the system default and seeds the singleton on first read", async () => {
    authAs("u1", UserRole.STUDENT);
    const result = await service.getResolved(TOKEN);
    expect(result).toEqual({ config: DEFAULT_TYPOGRAPHY, source: "system-default", locked: false });
    expect(prisma.typographySettings.create).toHaveBeenCalledTimes(1);
  });

  it("layers the user's preference over the admin default", async () => {
    authAs("u1", UserRole.STUDENT);
    settingsRow = {
      id: "settings-1",
      settings: { headingFont: "jost", bodyFont: "lato" },
      locked: false,
      updatedAt: new Date(),
    };
    prisma.userTypographyPreference.findUnique.mockResolvedValue({
      settings: { bodyFont: "lexend", textScale: "lg" },
    });

    const result = await service.getResolved(TOKEN);

    expect(result.source).toBe("user");
    expect(result.config).toEqual({ headingFont: "jost", bodyFont: "lexend", textScale: "lg" });
  });

  it("ignores a stored user preference while the admin has locked fonts", async () => {
    authAs("u1", UserRole.STUDENT);
    settingsRow = { id: "settings-1", settings: { bodyFont: "lato" }, locked: true, updatedAt: new Date() };
    prisma.userTypographyPreference.findUnique.mockResolvedValue({ settings: { bodyFont: "lexend" } });

    const result = await service.getResolved(TOKEN);

    expect(result).toMatchObject({ source: "admin-default", locked: true });
    expect(result.config.bodyFont).toBe("lato");
  });

  it("merges a single-field save onto the stored preference", async () => {
    authAs("u1", UserRole.COACH);
    prisma.userTypographyPreference.findUnique.mockResolvedValue({
      settings: { headingFont: "inter", bodyFont: "lato" },
    });

    const result = await service.updateMyPreference(TOKEN, { settings: { textScale: "xl" } });

    const expected = { headingFont: "inter", bodyFont: "lato", textScale: "xl" };
    expect(prisma.userTypographyPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { settings: expected } }),
    );
    expect(result.config).toEqual(expected);
  });

  it("refuses a personal save while locked", async () => {
    authAs("u1", UserRole.STUDENT);
    settingsRow = { id: "settings-1", settings: {}, locked: true, updatedAt: new Date() };
    await expect(
      service.updateMyPreference(TOKEN, { settings: { textScale: "lg" } }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.userTypographyPreference.upsert).not.toHaveBeenCalled();
  });

  it("keeps the admin endpoints admin-only", async () => {
    authAs("u1", UserRole.COACH);
    await expect(service.getGlobalSettings(TOKEN)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.updateGlobalSettings(TOKEN, { settings: { bodyFont: "lato" } }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lets an admin set and reset the global default", async () => {
    authAs("a1", UserRole.ADMIN);

    const updated = await service.updateGlobalSettings(TOKEN, {
      settings: { headingFont: "jost" },
      locked: true,
    });
    expect(updated.resolved.headingFont).toBe("jost");
    expect(updated.locked).toBe(true);

    const reset = await service.resetGlobalSettings(TOKEN);
    expect(reset.resolved).toEqual(DEFAULT_TYPOGRAPHY);
    expect(reset.locked).toBe(false);
  });
});

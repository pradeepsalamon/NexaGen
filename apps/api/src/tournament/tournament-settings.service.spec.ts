import { ForbiddenException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import type { UpdateTournamentSettingsRequest } from "@nexa-chess/types";
import { UserRole } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import type { PrismaService } from "../prisma/prisma.service";
import { runInTenant } from "../tenancy/tenant-context";
import { TournamentAuditService } from "./tournament-audit.service";
import { TournamentSettingsService } from "./tournament-settings.service";

jest.mock("../auth/authenticate", () => ({
  ...jest.requireActual("../auth/authenticate"),
  authenticateUser: jest.fn()
}));

const ADMIN = { firstName: "Ada", id: "admin_1", lastName: "Admin", role: UserRole.ADMIN };

const DEFAULTS = {
  allowAnonymousSpectating: false,
  coachesMayCreate: false,
  coachesMayPublishPublic: false,
  defaultSpectatorDelaySec: 15,
  publicNameFormat: "FIRST_NAME_LAST_INITIAL" as const
};

const UPDATE: UpdateTournamentSettingsRequest = {
  ...DEFAULTS,
  coachesMayCreate: true,
  defaultSpectatorDelaySec: 30
};

describe("TournamentSettingsService", () => {
  let row: Record<string, unknown> | null;
  let auditRows: unknown[];
  let executeRaw: jest.Mock;
  let service: TournamentSettingsService;

  const inTenant = <T>(fn: () => Promise<T>, tenantId = "tenant_nexa") => runInTenant(tenantId, "spec", fn);

  beforeEach(() => {
    row = null;
    auditRows = [];
    executeRaw = jest.fn().mockResolvedValue(1);
    const tournamentSettings = {
      findUnique: jest.fn(async () => row),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        row = { ...row, ...data, updatedAt: new Date("2026-11-09T10:00:00.000Z") };
        return { ...row, updatedBy: data.updatedById === ADMIN.id ? ADMIN : null };
      }),
      upsert: jest.fn(async ({ create }: { create: Record<string, unknown> }) => {
        row ??= { ...DEFAULTS, ...create, updatedAt: new Date("2026-11-09T09:00:00.000Z"), updatedById: null };
        return { ...row, updatedBy: null };
      })
    };
    const tx = {
      $executeRaw: executeRaw,
      tournamentAuditLog: { create: jest.fn(async ({ data }: { data: unknown }) => auditRows.push(data)) },
      tournamentSettings
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      tournamentSettings
    };
    service = new TournamentSettingsService(
      {} as JwtService,
      prisma as unknown as PrismaService,
      new TournamentAuditService()
    );
    (authenticateUser as jest.Mock).mockResolvedValue(ADMIN);
  });

  it("creates the academy's row with the defaults on first read", async () => {
    const { settings } = await inTenant(() => service.get("token"));
    expect(settings).toEqual({ ...DEFAULTS, updatedAt: null, updatedBy: null });
    expect(row).toMatchObject({ id: "default", tenantId: "tenant_nexa" });
  });

  it("keys another academy's row by its own id", async () => {
    await inTenant(() => service.get("token"), "tenant_other");
    expect(row).toMatchObject({ id: "tenant_other", tenantId: "tenant_other" });
  });

  it.each([UserRole.COACH, UserRole.STUDENT])("refuses a %s", async (role) => {
    (authenticateUser as jest.Mock).mockResolvedValue({ ...ADMIN, role });
    await expect(inTenant(() => service.get("token"))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(inTenant(() => service.update("token", UPDATE))).rejects.toBeInstanceOf(ForbiddenException);
    expect(row).toBeNull();
  });

  it("saves, records who changed what, and serializes per academy", async () => {
    const { settings } = await inTenant(() => service.update("token", UPDATE));
    expect(settings).toMatchObject({ coachesMayCreate: true, defaultSpectatorDelaySec: 30, updatedBy: { id: "admin_1", name: "Ada Admin" } });
    expect(settings.updatedAt).toBe("2026-11-09T10:00:00.000Z");
    expect(auditRows).toEqual([
      expect.objectContaining({
        action: "SETTINGS_UPDATED",
        actorId: "admin_1",
        afterJson: { coachesMayCreate: true, defaultSpectatorDelaySec: 30 },
        beforeJson: { coachesMayCreate: false, defaultSpectatorDelaySec: 15 },
        targetType: "TournamentSettings",
        tournamentId: null
      })
    ]);
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(executeRaw.mock.calls[0].slice(1)).toEqual(["tournament-settings:tenant_nexa"]);
  });

  it("writes no audit row when nothing changed", async () => {
    await inTenant(() => service.update("token", DEFAULTS));
    expect(auditRows).toEqual([]);
  });

  it("stores only the editable fields", async () => {
    await inTenant(() => service.update("token", { ...UPDATE, tenantId: "tenant_evil" } as never));
    expect(row).toMatchObject({ tenantId: "tenant_nexa" });
  });

  it("policySettings falls back to the defaults before the row exists", async () => {
    await expect(inTenant(() => service.policySettings())).resolves.toEqual(DEFAULTS);
  });
});

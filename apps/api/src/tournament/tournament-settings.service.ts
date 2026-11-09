import { ForbiddenException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type {
  TournamentSettingsDto,
  TournamentSettingsResponse,
  UpdateTournamentSettingsRequest
} from "@nexa-chess/types";
import { TournamentAuditAction, type TournamentSettings } from "@prisma/client";
import { authenticateUser, isAdminRole } from "../auth/authenticate";
import { PrismaService } from "../prisma/prisma.service";
import { fullName } from "../puzzle/puzzle-auth.helper";
import { requireTenantId, singletonRowId } from "../tenancy/tenant-sql";
import { TournamentAuditService } from "./tournament-audit.service";
import type { TournamentPolicySettings } from "./tournament-policy";

/** This academy's row: found by `tenantId`, created with its own id. */
function settingsRow() {
  const tenantId = requireTenantId("tournamentSettings");
  return { create: { id: singletonRowId(tenantId), tenantId }, where: { tenantId } };
}

const updatedByInclude = { updatedBy: { select: { firstName: true, id: true, lastName: true } } } as const;

type SettingsRow = TournamentSettings & {
  updatedBy: { firstName: string; id: string; lastName: string | null } | null;
};

const EDITABLE_FIELDS = [
  "allowAnonymousSpectating",
  "coachesMayCreate",
  "coachesMayPublishPublic",
  "defaultSpectatorDelaySec",
  "publicNameFormat"
] as const satisfies readonly (keyof UpdateTournamentSettingsRequest)[];

/**
 * The academy's tournament settings (docs/TOURNAMENTS.md §0 decisions 1 and
 * 6): whether coaches may create tournaments or publish public ones, and what
 * anonymous spectators may see. One row per academy, created lazily on first
 * read. Admins only; every change is audited.
 */
@Injectable()
export class TournamentSettingsService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly audit: TournamentAuditService
  ) {}

  async get(accessToken: string | undefined): Promise<TournamentSettingsResponse> {
    await this.assertAdmin(accessToken);
    return { settings: this.toDto(await this.load()) };
  }

  async update(
    accessToken: string | undefined,
    dto: UpdateTournamentSettingsRequest
  ): Promise<TournamentSettingsResponse> {
    const user = await this.assertAdmin(accessToken);
    const row = await this.prisma.$transaction(async (tx) => {
      // One update per academy at a time, so the audit row's "before" is the real one.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tournament-settings:${settingsRow().where.tenantId}`}))`;
      const before = await tx.tournamentSettings.upsert({
        create: settingsRow().create,
        update: {},
        where: settingsRow().where
      });
      const after = await tx.tournamentSettings.update({
        data: { ...pick(dto), updatedById: user.id },
        include: updatedByInclude,
        where: settingsRow().where
      });
      const changed = EDITABLE_FIELDS.filter((field) => before[field] !== after[field]);
      if (changed.length > 0) {
        await this.audit.record(tx, {
          action: TournamentAuditAction.SETTINGS_UPDATED,
          actorId: user.id,
          after: Object.fromEntries(changed.map((field) => [field, after[field]])),
          before: Object.fromEntries(changed.map((field) => [field, before[field]])),
          targetType: "TournamentSettings"
        });
      }
      return after;
    });
    return { settings: this.toDto(row) };
  }

  /** For the policy checks of the other tournament services (no auth: the caller has authenticated). */
  async policySettings(): Promise<TournamentPolicySettings & Pick<TournamentSettings, "defaultSpectatorDelaySec" | "publicNameFormat">> {
    const row = await this.prisma.tournamentSettings.findUnique({ where: settingsRow().where });
    return {
      allowAnonymousSpectating: row?.allowAnonymousSpectating ?? false,
      coachesMayCreate: row?.coachesMayCreate ?? false,
      coachesMayPublishPublic: row?.coachesMayPublishPublic ?? false,
      defaultSpectatorDelaySec: row?.defaultSpectatorDelaySec ?? 15,
      publicNameFormat: row?.publicNameFormat ?? "FIRST_NAME_LAST_INITIAL"
    };
  }

  private async assertAdmin(accessToken: string | undefined) {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (!isAdminRole(user.role)) throw new ForbiddenException("Only academy admins can change tournament settings.");
    return user;
  }

  private load(): Promise<SettingsRow> {
    return this.prisma.tournamentSettings.upsert({
      create: settingsRow().create,
      include: updatedByInclude,
      update: {},
      where: settingsRow().where
    });
  }

  private toDto(row: SettingsRow): TournamentSettingsDto {
    return {
      allowAnonymousSpectating: row.allowAnonymousSpectating,
      coachesMayCreate: row.coachesMayCreate,
      coachesMayPublishPublic: row.coachesMayPublishPublic,
      defaultSpectatorDelaySec: row.defaultSpectatorDelaySec,
      publicNameFormat: row.publicNameFormat,
      updatedAt: row.updatedById ? row.updatedAt.toISOString() : null,
      updatedBy: row.updatedBy ? { id: row.updatedBy.id, name: fullName(row.updatedBy) ?? "" } : null
    };
  }
}

function pick(dto: UpdateTournamentSettingsRequest): UpdateTournamentSettingsRequest {
  return Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, dto[field]])) as UpdateTournamentSettingsRequest;
}

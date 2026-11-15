import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable
} from "@nestjs/common";
import {
  DEFAULT_TIEBREAKS,
  tournamentConfigIssues,
  type CancelTournamentRequest,
  type CreateTournamentRequest,
  type PaginatedQuery,
  type PublishTournamentRequest,
  type PublishTournamentResponse,
  type SetTournamentHostsRequest,
  type TournamentCapabilitiesResponse,
  type TournamentHostCandidatesResponse,
  type TournamentImageKind,
  type TournamentListResponse,
  type TournamentListTab,
  type TournamentResponse,
  type TournamentViewerDto,
  type UpdateTournamentRequest
} from "@nexa-chess/types";
import {
  ApprovalStatus,
  Prisma,
  TournamentAuditAction,
  TournamentFormat,
  TournamentHostRole,
  TournamentStatus,
  UserRole,
  UserStatus,
  type Tournament
} from "@prisma/client";
import { randomBytes } from "crypto";
import { isAdminRole } from "../auth/authenticate";
import { Chess } from "../common/chess/chess";
import { paginationMeta, resolvePagination } from "../common/pagination";
import { sniffImage } from "../common/sniff-image";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeEngineFen } from "../stockfish/stockfish.service";
import { TrashRepository } from "../trash/trash.repository";
import { UploadService } from "../upload/upload.service";
import { ApprovalService } from "../approval/approval.service";
import { TournamentAccessService, type LoadedTournament, type TournamentViewer } from "./tournament-access.service";
import { TournamentAuditService } from "./tournament-audit.service";
import { roundScheduleOf, TournamentEngineService } from "./tournament-engine.service";
import { TournamentEventsService } from "./tournament-events.service";
import { personSelect, summaryInclude, toDetail, toPerson, toSummary } from "./tournament-mapper";
import {
  canBroadcast,
  canCreateTournament,
  canHoldHostRole,
  canManageTournament,
  canModerateTournament,
  getTournamentVisibilityWhere,
  tournamentPublishPath,
  VIEWING_PLAYER_STATUSES
} from "./tournament-policy";
import { publishInTx } from "./tournament-publish";
import { TournamentRegistrationService } from "./tournament-registration.service";
import { TournamentSettingsService } from "./tournament-settings.service";

/** Once a tournament has started only its wording, the spectator delay and how later rounds start may change. */
const ROUND_START_FIELDS = ["roundBreakSec", "roundSchedule", "roundStartMode"];
const TEXT_ONLY_FIELDS = new Set(["description", "name", "prizesText", "rulesText", "spectatorDelaySec", "version", ...ROUND_START_FIELDS]);
const EDITABLE_STATUSES: TournamentStatus[] = [TournamentStatus.DRAFT, TournamentStatus.PUBLISHED];

type TournamentData = Omit<Prisma.TournamentUncheckedCreateInput, "slug" | "tenantId">;

/**
 * Tournament lifecycle up to the start (docs/TOURNAMENTS.md Phase 2): create,
 * edit (optimistic `version`), publish (directly or via a TOURNAMENT_PUBLISH
 * approval), cancel, delete (Trash), images, hosts, discovery and detail.
 * Every check goes through `tournament-policy.ts`; every sensitive change
 * writes its audit row in the same transaction.
 */
@Injectable()
export class TournamentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TournamentAccessService,
    private readonly audit: TournamentAuditService,
    private readonly settings: TournamentSettingsService,
    private readonly registration: TournamentRegistrationService,
    private readonly trash: TrashRepository,
    private readonly uploads: UploadService,
    private readonly approvals: ApprovalService,
    private readonly engine: TournamentEngineService,
    private readonly events: TournamentEventsService
  ) {}

  async capabilities(accessToken: string | undefined): Promise<TournamentCapabilitiesResponse> {
    const user = await this.access.authenticate(accessToken);
    return { canCreate: canCreateTournament(this.access.actor(user), await this.settings.policySettings()) };
  }

  // ── create / edit ──

  async create(accessToken: string | undefined, dto: CreateTournamentRequest): Promise<TournamentResponse> {
    const user = await this.access.authenticate(accessToken);
    if (!canCreateTournament(this.access.actor(user), await this.settings.policySettings())) {
      throw new ForbiddenException("Only academy admins, and coaches the academy allows, can create tournaments.");
    }
    const settings = await this.settings.policySettings();
    const data = this.toData({ ...dto, spectatorDelaySec: dto.spectatorDelaySec ?? settings.defaultSpectatorDelaySec });
    await this.assertBatchesExist(dto.eligibility?.batchIds);
    if (Date.parse(dto.startsAt) <= Date.now()) throw new BadRequestException("Choose a start time in the future.");

    const id = await this.withUniqueSlug(dto.name, (slug) =>
      this.prisma.$transaction(async (tx) => {
        const row = await tx.tournament.create({ data: { ...data, createdById: user.id, slug } as Prisma.TournamentUncheckedCreateInput });
        // A coach who creates a tournament hosts it; admins manage without a row.
        if (!isAdminRole(user.role)) {
          await tx.tournamentHost.create({
            data: { grantedById: user.id, role: TournamentHostRole.HOST, tournamentId: row.id, userId: user.id }
          });
        }
        await this.audit.record(tx, {
          action: TournamentAuditAction.CREATED,
          actorId: user.id,
          after: { format: row.format, name: row.name, visibility: row.visibility },
          tournamentId: row.id
        });
        return row.id;
      })
    );
    return this.detail(user, id);
  }

  async update(accessToken: string | undefined, id: string, dto: UpdateTournamentRequest): Promise<TournamentResponse> {
    const user = await this.access.authenticate(accessToken);
    const { tournament } = await this.access.loadForManager(user, id);
    const fields = Object.keys(dto).filter((key) => dto[key as keyof UpdateTournamentRequest] !== undefined);
    if (!EDITABLE_STATUSES.includes(tournament.status)) {
      const blocked = fields.filter((f) => !TEXT_ONLY_FIELDS.has(f));
      if (blocked.length) throw new ConflictException("Once a tournament has started, only its name, texts, spectator delay and round start times can change.");
    }
    if (tournament.status === TournamentStatus.PUBLISHED && dto.format && dto.format !== tournament.format) {
      throw new ConflictException("The format can't change after the tournament is published.");
    }
    const merged = { ...this.toInput(tournament), ...stripUndefined(dto) } as CreateTournamentRequest;
    const issues = tournamentConfigIssues(merged as Parameters<typeof tournamentConfigIssues>[0]);
    if (issues.length) throw new BadRequestException(issues[0].message);
    if (dto.startsAt && Date.parse(dto.startsAt) <= Date.now() && EDITABLE_STATUSES.includes(tournament.status)) {
      throw new BadRequestException("Choose a start time in the future.");
    }
    await this.assertBatchesExist(dto.eligibility?.batchIds);
    const data = this.toData(merged);

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.tournament.updateMany({
        data: { ...data, version: { increment: 1 } },
        where: { id, version: dto.version }
      });
      if (count === 0) throw new ConflictException("Someone else changed this tournament. Reload it and try again.");
      // Between rounds, new round-start settings move the round that is waiting.
      if (!EDITABLE_STATUSES.includes(tournament.status) && fields.some((f) => ROUND_START_FIELDS.includes(f))) {
        await this.engine.planNextRound(tx, await this.engine.lockTournament(tx, id));
      }
      await this.audit.record(tx, {
        action: TournamentAuditAction.UPDATED,
        actorId: user.id,
        after: { fields: fields.filter((f) => f !== "version") },
        tournamentId: id
      });
    });
    this.events.stateChanged(id);
    return this.detail(user, id);
  }

  // ── publish / cancel / delete ──

  async publish(accessToken: string | undefined, id: string, dto: PublishTournamentRequest): Promise<PublishTournamentResponse> {
    const user = await this.access.authenticate(accessToken);
    const { facts, tournament } = await this.access.load(user, id);
    const path = tournamentPublishPath(this.access.actor(user), facts, await this.settings.policySettings());
    if (path === "FORBIDDEN") throw new ForbiddenException("Only the tournament's host and academy admins can publish it.");
    if (tournament.status !== TournamentStatus.DRAFT) throw new ConflictException("This tournament is already published.");
    if (tournament.startsAt.getTime() <= Date.now()) throw new ConflictException("The start time has passed. Change it first.");

    if (path === "APPROVAL") {
      if (!dto.reason) throw new BadRequestException("Say why the tournament should go public; an admin approves it.");
      const { request } = await this.approvals.create(accessToken, {
        actionType: "TOURNAMENT_PUBLISH",
        payload: { tournamentId: id },
        reason: dto.reason
      });
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          action: TournamentAuditAction.PUBLISH_REQUESTED,
          actorId: user.id,
          targetId: request.id,
          targetType: "ApprovalRequest",
          tournamentId: id
        })
      );
      return { approvalRequestId: request.id, outcome: "APPROVAL_REQUESTED", tournament: (await this.detail(user, id)).tournament };
    }

    await this.prisma.$transaction(async (tx) => {
      await publishInTx(tx, id, tournament.version);
      await this.audit.record(tx, { action: TournamentAuditAction.PUBLISHED, actorId: user.id, tournamentId: id });
    });
    return { outcome: "PUBLISHED", tournament: (await this.detail(user, id)).tournament };
  }

  async cancel(accessToken: string | undefined, id: string, dto: CancelTournamentRequest): Promise<TournamentResponse> {
    const user = await this.access.authenticate(accessToken);
    await this.access.loadForManager(user, id);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.tournament.updateMany({
        data: { cancelReason: dto.reason, cancelledAt: new Date(), status: TournamentStatus.CANCELLED, version: { increment: 1 } },
        where: { id, status: { in: [TournamentStatus.DRAFT, TournamentStatus.PUBLISHED, TournamentStatus.LIVE, TournamentStatus.PAUSED] } }
      });
      if (count === 0) throw new ConflictException("This tournament has already finished or been cancelled.");
      await this.audit.record(tx, { action: TournamentAuditAction.CANCELLED, actorId: user.id, reason: dto.reason, tournamentId: id });
    });
    return this.detail(user, id);
  }

  /** To the Trash: drafts and cancelled tournaments only, by the HOST or an admin. */
  async delete(accessToken: string | undefined, id: string): Promise<{ deleted: true }> {
    const user = await this.access.authenticate(accessToken);
    const { tournament } = await this.access.loadForModerator(user, id);
    if (tournament.status !== TournamentStatus.DRAFT && tournament.status !== TournamentStatus.CANCELLED) {
      throw new ConflictException("Only a draft or a cancelled tournament can be deleted. Cancel it first.");
    }
    await this.prisma.$transaction(async (tx) => {
      await this.audit.record(tx, { action: TournamentAuditAction.DELETED, actorId: user.id, tournamentId: id });
      await this.trash.softDelete(tx, "Tournament", id, user.id);
    });
    return { deleted: true };
  }

  // ── images ──

  async uploadImage(
    accessToken: string | undefined,
    id: string,
    kind: TournamentImageKind,
    file: Express.Multer.File | undefined
  ): Promise<TournamentResponse> {
    const user = await this.access.authenticate(accessToken);
    const { tournament } = await this.access.loadForManager(user, id);
    if (!file) throw new BadRequestException("Choose an image to upload.");
    if (!sniffImage(file.buffer)) throw new BadRequestException("Use a PNG, JPEG or WebP image.");
    const uploaded = await this.uploads.uploadTournamentImage(file, `${kind}_${id}`);
    const field = kind === "banner" ? "bannerUrl" : "logoUrl";
    await this.prisma.$transaction(async (tx) => {
      await tx.tournament.update({ data: { [field]: uploaded.secure_url, version: { increment: 1 } }, where: { id } });
      await this.audit.record(tx, { action: TournamentAuditAction.IMAGE_CHANGED, actorId: user.id, after: { kind }, tournamentId: id });
    });
    const previous = tournament[field];
    if (previous) void this.uploads.deleteImage(previous).catch(() => undefined);
    return this.detail(user, id);
  }

  async removeImage(accessToken: string | undefined, id: string, kind: TournamentImageKind): Promise<TournamentResponse> {
    const user = await this.access.authenticate(accessToken);
    const { tournament } = await this.access.loadForManager(user, id);
    const field = kind === "banner" ? "bannerUrl" : "logoUrl";
    await this.prisma.$transaction(async (tx) => {
      await tx.tournament.update({ data: { [field]: null, version: { increment: 1 } }, where: { id } });
      await this.audit.record(tx, { action: TournamentAuditAction.IMAGE_CHANGED, actorId: user.id, after: { kind, removed: true }, tournamentId: id });
    });
    const previous = tournament[field];
    if (previous) void this.uploads.deleteImage(previous).catch(() => undefined);
    return this.detail(user, id);
  }

  // ── hosts ──

  /** Active coaches and admins of the academy, for the host picker (moderators only). */
  async hostCandidates(accessToken: string | undefined, id: string, search: string | undefined): Promise<TournamentHostCandidatesResponse> {
    const user = await this.access.authenticate(accessToken);
    await this.access.loadForModerator(user, id);
    const term = search?.trim();
    const rows = await this.prisma.user.findMany({
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { ...personSelect, role: true },
      take: 50,
      where: {
        AND: [
          { role: { in: [UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN] }, status: UserStatus.ACTIVE },
          term
            ? { OR: [{ firstName: { contains: term, mode: "insensitive" } }, { lastName: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }] }
            : {}
        ]
      }
    });
    return { candidates: rows.map((row) => ({ ...toPerson(row), role: row.role as "COACH" | "ADMIN" | "SUPER_ADMIN" })) };
  }

  /** Replaces the host list. A coach HOST editing it must stay HOST (no locking yourself out). */
  async setHosts(accessToken: string | undefined, id: string, dto: SetTournamentHostsRequest): Promise<TournamentResponse> {
    const user = await this.access.authenticate(accessToken);
    await this.access.loadForModerator(user, id);
    if (!isAdminRole(user.role) && !dto.hosts.some((h) => h.userId === user.id && h.role === TournamentHostRole.HOST)) {
      throw new BadRequestException("Keep yourself as host, or ask an admin to hand the tournament over.");
    }
    const ids = dto.hosts.map((h) => h.userId);
    // Load before link: every id must be an active staff account of this academy.
    const users = await this.prisma.user.findMany({
      select: { id: true, role: true },
      where: { id: { in: ids }, status: UserStatus.ACTIVE }
    });
    const valid = new Map(users.filter((u) => canHoldHostRole(u.role)).map((u) => [u.id, u]));
    const missing = ids.filter((uid) => !valid.has(uid));
    if (missing.length) throw new BadRequestException("Hosts must be active coaches or admins of this academy.");

    await this.prisma.$transaction(async (tx) => {
      const before = await tx.tournamentHost.findMany({ select: { role: true, userId: true }, where: { tournamentId: id } });
      await tx.tournamentHost.deleteMany({ where: { tournamentId: id, userId: { notIn: ids } } });
      for (const host of dto.hosts) {
        await tx.tournamentHost.upsert({
          create: { grantedById: user.id, role: host.role, tournamentId: id, userId: host.userId },
          update: { grantedById: user.id, role: host.role },
          where: { tournamentId_userId: { tournamentId: id, userId: host.userId } }
        });
      }
      await this.audit.record(tx, {
        action: TournamentAuditAction.HOSTS_CHANGED,
        actorId: user.id,
        after: dto.hosts,
        before,
        tournamentId: id
      });
    });
    return this.detail(user, id);
  }

  // ── read ──

  async list(
    accessToken: string | undefined,
    tab: TournamentListTab,
    query: PaginatedQuery & { format?: TournamentFormat }
  ): Promise<TournamentListResponse> {
    const user = await this.access.authenticate(accessToken);
    const { page, pageSize, search, skip, take } = resolvePagination(query);
    const where: Prisma.TournamentWhereInput = {
      AND: [
        getTournamentVisibilityWhere(this.access.actor(user)),
        this.tabWhere(tab, user),
        query.format ? { format: query.format } : {},
        search ? { name: { contains: search, mode: "insensitive" } } : {}
      ]
    };
    const ascending = tab === "live" || tab === "upcoming" || tab === "drafts";
    const [rows, total] = await Promise.all([
      this.prisma.tournament.findMany({
        include: { ...summaryInclude, players: { select: { status: true }, where: { userId: user.id } } },
        orderBy: [{ startsAt: ascending ? "asc" : "desc" }, { id: "asc" }],
        skip,
        take,
        where
      }),
      this.prisma.tournament.count({ where })
    ]);
    return {
      items: rows.map((row) => toSummary(row, row.players[0]?.status ?? null)),
      pagination: paginationMeta(total, page, pageSize)
    };
  }

  async get(accessToken: string | undefined, id: string): Promise<TournamentResponse> {
    const user = await this.access.authenticate(accessToken);
    return this.detail(user, id);
  }

  /** The detail as this viewer sees it (permissions and registration state included). */
  async detail(user: TournamentViewer, id: string): Promise<TournamentResponse> {
    const loaded = await this.access.load(user, id);
    const row = await this.prisma.tournament.findUniqueOrThrow({ include: summaryInclude, where: { id } });
    const viewer = await this.viewerFor(user, loaded);
    const pending = viewer.canManage
      ? await this.prisma.approvalRequest.findFirst({
          select: { id: true },
          where: { actionType: "TOURNAMENT_PUBLISH", requestedValue: { equals: { tournamentId: id } }, status: ApprovalStatus.PENDING }
        })
      : null;
    return { tournament: toDetail(row, viewer, pending?.id ?? null) };
  }

  private async viewerFor(user: TournamentViewer, loaded: LoadedTournament): Promise<TournamentViewerDto> {
    const actor = this.access.actor(user);
    const settings = await this.settings.policySettings();
    return {
      canBroadcast: canBroadcast(actor, loaded.facts),
      canManage: canManageTournament(actor, loaded.facts),
      canModerate: canModerateTournament(actor, loaded.facts),
      canWithdraw: this.registration.canWithdraw(loaded),
      myStatus: loaded.playerRow?.status ?? null,
      publishPath: loaded.tournament.status === TournamentStatus.DRAFT ? tournamentPublishPath(actor, loaded.facts, settings) : "FORBIDDEN",
      registrationIssue: await this.registration.selfRegistrationIssue(user, loaded),
      signedIn: true
    };
  }

  private tabWhere(tab: TournamentListTab, user: TournamentViewer): Prisma.TournamentWhereInput {
    switch (tab) {
      case "live":
        return { status: { in: [TournamentStatus.LIVE, TournamentStatus.PAUSED] } };
      case "upcoming":
        return { status: TournamentStatus.PUBLISHED };
      case "completed":
        return { status: TournamentStatus.COMPLETED };
      case "cancelled":
        return { status: TournamentStatus.CANCELLED };
      case "mine":
        return { players: { some: { status: { in: [...VIEWING_PLAYER_STATUSES] }, userId: user.id } } };
      case "hosting":
        return isAdminRole(user.role) ? { status: { not: TournamentStatus.CANCELLED } } : { hosts: { some: { userId: user.id } } };
      case "drafts":
        return { status: TournamentStatus.DRAFT };
    }
  }

  // ── helpers ──

  private toData(dto: CreateTournamentRequest): TournamentData {
    const format = dto.format;
    const startFen = this.resolveStartFen(dto.startFen ?? null);
    const roundFormat = format === TournamentFormat.SWISS || format === TournamentFormat.ROUND_ROBIN;
    const scheduled = roundFormat && dto.roundStartMode === "SCHEDULED";
    return {
      arenaConfigJson: format === TournamentFormat.ARENA ? ((dto.arenaConfig ?? { berserk: true, streaks: true }) as Prisma.InputJsonValue) : Prisma.DbNull,
      arenaDurationMin: format === TournamentFormat.ARENA ? (dto.arenaDurationMin ?? null) : null,
      clockIncrementMs: dto.timeControl.incrementSeconds * 1000,
      clockInitialMs: dto.timeControl.initialSeconds * 1000,
      description: dto.description || null,
      eligibilityJson: (dto.eligibility ?? { allowUnrated: true }) as Prisma.InputJsonValue,
      format,
      knockoutConfigJson:
        format === TournamentFormat.KNOCKOUT
          ? ((dto.knockoutConfig ?? { gamesPerMatch: 1, tiebreak: "SUDDEN_DEATH" }) as Prisma.InputJsonValue)
          : Prisma.DbNull,
      lateRegistrationRounds: dto.lateRegistrationRounds ?? 0,
      maxPlayers: dto.maxPlayers ?? null,
      minPlayers: dto.minPlayers ?? 2,
      name: dto.name,
      prizesText: dto.prizesText || null,
      registrationClosesAt: dto.registrationClosesAt ? new Date(dto.registrationClosesAt) : null,
      registrationOpensAt: dto.registrationOpensAt ? new Date(dto.registrationOpensAt) : null,
      registrationRequiresApproval: dto.registrationRequiresApproval ?? false,
      roundBreakSec: dto.roundBreakSec ?? 60,
      roundScheduleJson: scheduled && dto.roundSchedule?.length ? ([...dto.roundSchedule].sort((a, b) => a.round - b.round) as Prisma.InputJsonValue) : Prisma.DbNull,
      roundStartMode: roundFormat ? (dto.roundStartMode ?? "AUTO") : "AUTO",
      rounds:
        format === TournamentFormat.SWISS
          ? (dto.rounds ?? null)
          : format === TournamentFormat.ROUND_ROBIN
            ? (dto.rounds ?? 1)
            : null,
      rulesText: dto.rulesText || null,
      spectatorDelaySec: dto.spectatorDelaySec ?? 15,
      startFen,
      startsAt: new Date(dto.startsAt),
      tiebreaks: dto.tiebreaks ?? DEFAULT_TIEBREAKS[format],
      visibility: dto.visibility ?? "PUBLIC"
    };
  }

  /** The stored row back as a request, so an update can be validated as a whole. */
  private toInput(t: Tournament): CreateTournamentRequest {
    return {
      arenaConfig: (t.arenaConfigJson ?? undefined) as CreateTournamentRequest["arenaConfig"],
      arenaDurationMin: t.arenaDurationMin ?? undefined,
      description: t.description ?? undefined,
      eligibility: t.eligibilityJson as CreateTournamentRequest["eligibility"],
      format: t.format,
      knockoutConfig: (t.knockoutConfigJson ?? undefined) as CreateTournamentRequest["knockoutConfig"],
      lateRegistrationRounds: t.lateRegistrationRounds,
      maxPlayers: t.maxPlayers,
      minPlayers: t.minPlayers,
      name: t.name,
      prizesText: t.prizesText ?? undefined,
      registrationClosesAt: t.registrationClosesAt?.toISOString() ?? null,
      registrationOpensAt: t.registrationOpensAt?.toISOString() ?? null,
      registrationRequiresApproval: t.registrationRequiresApproval,
      roundBreakSec: t.roundBreakSec,
      roundSchedule: roundScheduleOf(t),
      roundStartMode: t.roundStartMode,
      rounds: t.rounds ?? undefined,
      rulesText: t.rulesText ?? undefined,
      spectatorDelaySec: t.spectatorDelaySec,
      startFen: t.startFen,
      startsAt: t.startsAt.toISOString(),
      tiebreaks: t.tiebreaks,
      timeControl: { incrementSeconds: t.clockIncrementMs / 1000, initialSeconds: t.clockInitialMs / 1000 },
      visibility: t.visibility
    };
  }

  private resolveStartFen(input: string | null): string | null {
    if (!input?.trim()) return null;
    const check = normalizeEngineFen(input);
    if (!check.ok) throw new BadRequestException(check.reason);
    if (new Chess(check.fen).isGameOver()) throw new BadRequestException("The starting position is already finished.");
    return check.fen;
  }

  /** Load before link: batch restrictions must name this academy's batches. */
  private async assertBatchesExist(batchIds: string[] | undefined) {
    if (!batchIds?.length) return;
    const count = await this.prisma.batch.count({ where: { id: { in: batchIds } } });
    if (count !== new Set(batchIds).size) throw new BadRequestException("One of the batches doesn't exist.");
  }

  private async withUniqueSlug<T>(name: string, create: (slug: string) => Promise<T>): Promise<T> {
    const base =
      name
        .normalize("NFKD")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "-")
        .slice(0, 60) || "tournament";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = `${base}-${randomBytes(3).toString("hex")}`;
      try {
        return await create(slug);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
        throw error;
      }
    }
    throw new ConflictException("Couldn't create the tournament. Try again.");
  }
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

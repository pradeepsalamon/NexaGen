import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  brandColorIssue,
  formatPublicPlayerName,
  ordinal,
  type CertificateTemplateDto,
  type CertificateTemplateRequest,
  type CertificateTemplatesResponse,
  type CertificateVerificationDto,
  type SetTournamentCertificateRulesRequest,
  type TournamentCertificateDto,
  type TournamentCertificateRulesResponse,
  type TournamentCertificateSnapshot,
  type TournamentCertificatesResponse
} from "@nexa-chess/types";
import {
  Prisma,
  TournamentAuditAction,
  TournamentCertificateKind,
  TournamentFormat,
  TournamentPlayerStatus,
  TournamentStatus,
  type CertificateTemplate
} from "@prisma/client";
import { randomBytes } from "crypto";
import { isAdminRole } from "../auth/authenticate";
import { BrandingService } from "../branding/branding.service";
import { PrismaService } from "../prisma/prisma.service";
import { TournamentAccessService } from "./tournament-access.service";
import { TournamentAuditService } from "./tournament-audit.service";
import { CertificatePdfService } from "./certificate-pdf.service";
import { personSelect, toPerson } from "./tournament-mapper";
import { canManageTournament, canModerateTournament } from "./tournament-policy";
import { TournamentSettingsService } from "./tournament-settings.service";

const certificateInclude = {
  rule: { select: { kind: true } },
  tournament: { select: { name: true } },
  user: { select: personSelect }
} satisfies Prisma.TournamentCertificateInclude;

type CertificateRow = Prisma.TournamentCertificateGetPayload<{ include: typeof certificateInclude }>;

/** Who is eligible for certificates (a disqualified player never is). */
const CERTIFIABLE: TournamentPlayerStatus[] = [TournamentPlayerStatus.APPROVED, TournamentPlayerStatus.WITHDRAWN];

/**
 * Certificates (docs/TOURNAMENTS.md §3.6, Phase 8). Admins design templates;
 * a tournament's managers set the rules; issuing (on publishing results, or on
 * demand) is idempotent on (tournament, user, rule) and snapshots names,
 * placement, score and the template's wording, so an issued certificate never
 * changes. A correction revokes (audited) and reissues. The PDF is rendered on
 * request from the snapshot; anyone with the code can verify it (public name
 * format only).
 */
@Injectable()
export class TournamentCertificateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TournamentAccessService,
    private readonly audit: TournamentAuditService,
    private readonly settings: TournamentSettingsService,
    private readonly branding: BrandingService,
    private readonly pdf: CertificatePdfService
  ) {}

  // ── templates (admins) ──

  /** Admins: every template, archived ones included. */
  async listTemplates(accessToken: string | undefined): Promise<CertificateTemplatesResponse> {
    await this.assertAdmin(accessToken);
    const rows = await this.prisma.certificateTemplate.findMany({ orderBy: [{ archivedAt: { nulls: "first", sort: "asc" } }, { name: "asc" }] });
    return { templates: rows.map(toTemplateDto) };
  }

  /** Staff (hosts choosing a template for their rules): the live templates. */
  async listActiveTemplates(accessToken: string | undefined): Promise<CertificateTemplatesResponse> {
    const user = await this.access.authenticate(accessToken);
    if (!isAdminRole(user.role) && user.role !== "COACH") throw new ForbiddenException("Staff only.");
    const rows = await this.prisma.certificateTemplate.findMany({ orderBy: { name: "asc" }, where: { archivedAt: null } });
    return { templates: rows.map(toTemplateDto) };
  }

  async createTemplate(accessToken: string | undefined, dto: CertificateTemplateRequest): Promise<{ template: CertificateTemplateDto }> {
    const user = await this.assertAdmin(accessToken);
    this.assertColor(dto.accentColor);
    const row = await this.prisma.certificateTemplate.create({ data: { ...templateData(dto), createdById: user.id } });
    return { template: toTemplateDto(row) };
  }

  async updateTemplate(accessToken: string | undefined, id: string, dto: CertificateTemplateRequest): Promise<{ template: CertificateTemplateDto }> {
    await this.assertAdmin(accessToken);
    this.assertColor(dto.accentColor);
    const existing = await this.prisma.certificateTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Template not found.");
    // Issued certificates keep their own copy of the wording: editing is safe.
    const row = await this.prisma.certificateTemplate.update({ data: templateData(dto), where: { id } });
    return { template: toTemplateDto(row) };
  }

  async archiveTemplate(accessToken: string | undefined, id: string): Promise<{ template: CertificateTemplateDto }> {
    await this.assertAdmin(accessToken);
    const existing = await this.prisma.certificateTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Template not found.");
    const row = await this.prisma.certificateTemplate.update({ data: { archivedAt: existing.archivedAt ?? new Date() }, where: { id } });
    return { template: toTemplateDto(row) };
  }

  // ── rules (tournament managers) ──

  async getRules(accessToken: string | undefined, id: string): Promise<TournamentCertificateRulesResponse> {
    const user = await this.access.authenticate(accessToken);
    await this.access.loadForManager(user, id);
    return this.rulesOf(id);
  }

  /** Replaces the rules. A rule that already has certificates stays as it is (revoke them first). */
  async setRules(accessToken: string | undefined, id: string, dto: SetTournamentCertificateRulesRequest): Promise<TournamentCertificateRulesResponse> {
    const user = await this.access.authenticate(accessToken);
    await this.access.loadForManager(user, id);
    // Load before link: only this academy's live templates.
    const templateIds = [...new Set(dto.rules.map((r) => r.templateId))];
    const templates = await this.prisma.certificateTemplate.findMany({ select: { id: true }, where: { archivedAt: null, id: { in: templateIds } } });
    if (templates.length !== templateIds.length) throw new BadRequestException("One of the templates doesn't exist or is archived.");
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.tournamentCertificateRule.findMany({ include: { _count: { select: { certificates: true } } }, where: { tournamentId: id } });
      const locked = existing.filter((r) => r._count.certificates > 0);
      const keepsLocked = locked.every((r) => dto.rules.some((n) => n.kind === r.kind && n.templateId === r.templateId && (n.topN ?? null) === r.topN && (n.minGames ?? null) === r.minGames));
      if (!keepsLocked) throw new ConflictException("A rule that already has certificates can't change. Revoke its certificates first.");
      await tx.tournamentCertificateRule.deleteMany({ where: { id: { in: existing.filter((r) => r._count.certificates === 0).map((r) => r.id) } } });
      for (const rule of dto.rules) {
        const isLocked = locked.some((r) => r.kind === rule.kind && r.templateId === rule.templateId && (rule.topN ?? null) === r.topN && (rule.minGames ?? null) === r.minGames);
        if (isLocked) continue;
        await tx.tournamentCertificateRule.create({
          data: { kind: rule.kind, minGames: rule.kind === "PARTICIPATION" ? (rule.minGames ?? 1) : null, templateId: rule.templateId, topN: rule.kind === "PARTICIPATION" ? null : (rule.topN ?? 1), tournamentId: id }
        });
      }
      await this.audit.record(tx, { action: TournamentAuditAction.CERTIFICATE_RULES_CHANGED, actorId: user.id, after: dto.rules, tournamentId: id });
    });
    return this.rulesOf(id);
  }

  // ── issuing ──

  async issue(accessToken: string | undefined, id: string): Promise<TournamentCertificatesResponse> {
    const user = await this.access.authenticate(accessToken);
    await this.access.loadForManager(user, id);
    await this.issueFor(id, user.id);
    return this.list(accessToken, id);
  }

  /** Idempotent: issues what the rules say and isn't issued yet. Returns how many were new. */
  async issueFor(tournamentId: string, actorId: string | null): Promise<number> {
    const t = await this.prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!t || t.status !== TournamentStatus.COMPLETED) throw new ConflictException("Certificates are issued once the tournament has finished.");
    const [rules, players, academyName] = await Promise.all([
      this.prisma.tournamentCertificateRule.findMany({ include: { template: true }, where: { tournamentId } }),
      this.prisma.tournamentPlayer.findMany({
        orderBy: [{ rank: { nulls: "last", sort: "asc" } }, { seedNumber: "asc" }],
        select: { ageGroup: true, id: true, played: true, points: true, rank: true, status: true, user: { select: { firstName: true, lastName: true } }, userId: true },
        where: { seedNumber: { not: null }, status: { in: CERTIFIABLE }, tournamentId }
      }),
      this.branding.nameFor()
    ]);
    const date = (t.endedAt ?? new Date()).toISOString().slice(0, 10);
    let issued = 0;
    for (const rule of rules) {
      const recipients: { player: (typeof players)[number]; placement: string }[] = [];
      if (rule.kind === TournamentCertificateKind.PLACEMENT) {
        for (const p of players) if (p.rank !== null && p.rank <= (rule.topN ?? 1)) recipients.push({ placement: ordinal(p.rank), player: p });
      } else if (rule.kind === TournamentCertificateKind.AGE_GROUP_PLACEMENT) {
        const groups = new Map<string, typeof players>();
        for (const p of players) if (p.ageGroup && p.rank !== null) groups.set(p.ageGroup, [...(groups.get(p.ageGroup) ?? []), p]);
        for (const [group, members] of groups) {
          let place = 0;
          let lastRank: number | null = null;
          members.forEach((p, i) => {
            if (p.rank !== lastRank) place = i + 1;
            lastRank = p.rank;
            if (place <= (rule.topN ?? 1)) recipients.push({ placement: `${ordinal(place)} in ${group}`, player: p });
          });
        }
      } else {
        for (const p of players) if (p.played >= (rule.minGames ?? 1)) recipients.push({ placement: "Participant", player: p });
      }
      for (const r of recipients) {
        const snapshot: TournamentCertificateSnapshot = {
          academyName,
          ageGroup: r.player.ageGroup,
          date,
          placement: r.placement,
          playerName: `${r.player.user.firstName} ${r.player.user.lastName ?? ""}`.trim(),
          points: t.format === TournamentFormat.ARENA ? String(r.player.points) : String(r.player.points / 2),
          template: templateSnapshot(rule.template),
          tournamentName: t.name
        };
        if (await this.createCertificate(tournamentId, rule.id, rule.templateId, r.player.id, r.player.userId, snapshot)) issued += 1;
      }
    }
    if (issued > 0) {
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, { action: TournamentAuditAction.CERTIFICATES_ISSUED, actorId, after: { issued }, tournamentId })
      );
    }
    return issued;
  }

  async list(accessToken: string | undefined, id: string): Promise<TournamentCertificatesResponse> {
    const user = await this.access.authenticate(accessToken);
    const loaded = await this.access.load(user, id);
    const manager = canManageTournament(this.access.actor(user), loaded.facts);
    const rows = await this.prisma.tournamentCertificate.findMany({
      include: certificateInclude,
      orderBy: [{ issuedAt: "asc" }, { serialNumber: "asc" }],
      where: { tournamentId: id, ...(manager ? {} : { userId: user.id }) }
    });
    return { certificates: rows.map(toCertificateDto) };
  }

  async revoke(accessToken: string | undefined, id: string, certificateId: string, reason: string): Promise<TournamentCertificatesResponse> {
    const user = await this.access.authenticate(accessToken);
    const loaded = await this.access.load(user, id);
    if (!canModerateTournament(this.access.actor(user), loaded.facts)) throw new ForbiddenException("Only the tournament's host and academy admins can revoke certificates.");
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.tournamentCertificate.updateMany({
        data: { revokedAt: new Date(), revokedById: user.id, revokedReason: reason },
        where: { id: certificateId, revokedAt: null, tournamentId: id }
      });
      if (count === 0) throw new NotFoundException("Certificate not found (or already revoked).");
      await this.audit.record(tx, { action: TournamentAuditAction.CERTIFICATE_REVOKED, actorId: user.id, reason, targetId: certificateId, targetType: "TournamentCertificate", tournamentId: id });
    });
    return this.list(accessToken, id);
  }

  /** The PDF: the owner, the tournament's managers and admins. A revoked certificate is not downloadable. */
  async renderPdf(accessToken: string | undefined, certificateId: string): Promise<{ filename: string; buffer: Buffer }> {
    const user = await this.access.authenticate(accessToken);
    const cert = await this.prisma.tournamentCertificate.findUnique({ where: { id: certificateId } });
    if (!cert) throw new NotFoundException("Certificate not found.");
    if (cert.userId !== user.id) {
      const loaded = await this.access.load(user, cert.tournamentId).catch(() => null);
      if (!loaded || !canManageTournament(this.access.actor(user), loaded.facts)) throw new NotFoundException("Certificate not found.");
    }
    if (cert.revokedAt) throw new ConflictException("This certificate was revoked.");
    const snapshot = cert.snapshotJson as unknown as TournamentCertificateSnapshot;
    const buffer = await this.pdf.render(snapshot, { serialNumber: cert.serialNumber, verificationCode: cert.verificationCode });
    return { buffer, filename: `certificate-${cert.serialNumber}.pdf` };
  }

  /** Public: anyone with the code (name in the academy's public format only). */
  async verify(code: string): Promise<CertificateVerificationDto> {
    if (!/^[a-f0-9]{16}$/.test(code)) return { valid: false };
    const cert = await this.prisma.tournamentCertificate.findUnique({
      include: { tournament: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } },
      where: { verificationCode: code }
    });
    if (!cert) return { valid: false };
    const { publicNameFormat } = await this.settings.policySettings();
    const snapshot = cert.snapshotJson as unknown as TournamentCertificateSnapshot;
    return {
      academyName: snapshot.academyName,
      issuedAt: cert.issuedAt.toISOString(),
      name: formatPublicPlayerName(cert.user.firstName, cert.user.lastName, publicNameFormat),
      placement: snapshot.placement,
      revoked: cert.revokedAt !== null,
      tournamentName: cert.tournament.name,
      valid: true
    };
  }

  // ── helpers ──

  private async createCertificate(tournamentId: string, ruleId: string, templateId: string, playerId: string, userId: string, snapshot: TournamentCertificateSnapshot): Promise<boolean> {
    const exists = await this.prisma.tournamentCertificate.findUnique({ select: { id: true }, where: { tournamentId_userId_ruleId: { ruleId, tournamentId, userId } } });
    if (exists) return false;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await this.prisma.tournamentCertificate.create({
          data: {
            playerId,
            ruleId,
            serialNumber: `${snapshot.date.slice(0, 4)}-${randomBytes(4).toString("hex").toUpperCase()}`,
            snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
            templateId,
            tournamentId,
            userId,
            verificationCode: randomBytes(8).toString("hex")
          }
        });
        return true;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
        const target = String((error.meta as { target?: unknown } | undefined)?.target ?? "");
        // Issued concurrently by another call: that's the same certificate.
        if (target.includes("ruleId") || target.includes("userId")) return false;
        // A serial or code collision: draw again.
      }
    }
    throw new ConflictException("Couldn't issue a certificate. Try again.");
  }

  private async rulesOf(id: string): Promise<TournamentCertificateRulesResponse> {
    const rules = await this.prisma.tournamentCertificateRule.findMany({ include: { template: { select: { name: true } } }, orderBy: { createdAt: "asc" }, where: { tournamentId: id } });
    return { rules: rules.map((r) => ({ id: r.id, kind: r.kind, minGames: r.minGames, templateId: r.templateId, templateName: r.template.name, topN: r.topN })) };
  }

  private async assertAdmin(accessToken: string | undefined) {
    const user = await this.access.authenticate(accessToken);
    if (!isAdminRole(user.role)) throw new ForbiddenException("Only academy admins can manage certificate templates.");
    return user;
  }

  private assertColor(hex: string) {
    const issue = brandColorIssue("accent", hex);
    if (issue) throw new BadRequestException(issue);
  }
}

function templateData(dto: CertificateTemplateRequest) {
  return {
    accentColor: dto.accentColor,
    body: dto.body,
    borderStyle: dto.borderStyle,
    name: dto.name,
    orientation: dto.orientation,
    secondSignatoryName: dto.secondSignatoryName ?? null,
    secondSignatoryTitle: dto.secondSignatoryTitle ?? null,
    signatoryName: dto.signatoryName ?? null,
    signatoryTitle: dto.signatoryTitle ?? null,
    title: dto.title
  };
}

function templateSnapshot(t: CertificateTemplate): TournamentCertificateSnapshot["template"] {
  return {
    accentColor: t.accentColor,
    body: t.body,
    borderStyle: t.borderStyle,
    orientation: t.orientation,
    secondSignatoryName: t.secondSignatoryName,
    secondSignatoryTitle: t.secondSignatoryTitle,
    signatoryName: t.signatoryName,
    signatoryTitle: t.signatoryTitle,
    title: t.title
  };
}

function toTemplateDto(t: CertificateTemplate): CertificateTemplateDto {
  return { ...templateSnapshot(t), archivedAt: t.archivedAt?.toISOString() ?? null, createdAt: t.createdAt.toISOString(), id: t.id, name: t.name, updatedAt: t.updatedAt.toISOString() };
}

function toCertificateDto(row: CertificateRow): TournamentCertificateDto {
  const snapshot = row.snapshotJson as unknown as TournamentCertificateSnapshot;
  return {
    id: row.id,
    issuedAt: row.issuedAt.toISOString(),
    kind: row.rule.kind,
    placement: snapshot.placement,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revokedReason: row.revokedReason,
    serialNumber: row.serialNumber,
    tournamentId: row.tournamentId,
    tournamentName: row.tournament.name,
    user: toPerson(row.user),
    verificationCode: row.verificationCode
  };
}

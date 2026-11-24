import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  AI_REVIEW_CONSENT_VERSION,
  aiConsentIsCurrent,
  outsideAiAllowed,
  type AiConsentChangedBy,
  type AiPlayReviewSettings,
  type AiReviewConsentState,
  type SetAiReviewConsentRequest,
  type UpdateAiPlayReviewSettingsRequest
} from "@nexa-chess/types";
import { UserRole, type User } from "@prisma/client";
import { OUTSIDE_AI_PROVIDER, type OutsideAiProvider } from "../ai/outside/outside-ai";
import { authenticateUser } from "../auth/authenticate";
import { EntitlementService } from "../platform/entitlement.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertCanViewStudent } from "../progress/student-access";
import { requireTenantId } from "../tenancy/tenant-sql";

type ConsentRow = { allowed: boolean; version: number; createdAt: Date; changedByRole: AiConsentChangedBy };

/**
 * The outside-AI switch (docs/AI_PLAY_REVIEW.md §3.1) and the academy's two
 * switches. Recording and the engine review need no switch; this only gates
 * sending a student's (pseudonymised) play to the outside AI.
 */
@Injectable()
export class AiReviewConsentService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    @Inject(OUTSIDE_AI_PROVIDER) private readonly provider: OutsideAiProvider
  ) {}

  // ── Student: own switch ────────────────────────────────────

  async getMine(accessToken: string | undefined): Promise<AiReviewConsentState> {
    const user = await this.authenticate(accessToken);
    this.assertStudent(user);
    return this.stateFor(user.id);
  }

  async setMine(accessToken: string | undefined, body: SetAiReviewConsentRequest): Promise<AiReviewConsentState> {
    const user = await this.authenticate(accessToken);
    this.assertStudent(user);
    await this.change(user.id, body, user.id, "STUDENT");
    return this.stateFor(user.id);
  }

  // ── Staff: a student's switch ──────────────────────────────

  async getFor(accessToken: string | undefined, studentId: string): Promise<AiReviewConsentState> {
    const viewer = await this.authenticate(accessToken);
    await assertCanViewStudent(this.prisma, viewer, studentId);
    return this.stateFor(studentId);
  }

  /** The student's coach or an admin, after a parent agreed (recorded as such). */
  async setFor(accessToken: string | undefined, studentId: string, body: SetAiReviewConsentRequest): Promise<AiReviewConsentState> {
    const viewer = await this.authenticate(accessToken);
    const role: AiConsentChangedBy | null =
      viewer.role === UserRole.COACH ? "COACH" : viewer.role === UserRole.ADMIN || viewer.role === UserRole.SUPER_ADMIN ? "ADMIN" : null;
    if (!role) throw new ForbiddenException("Students change their own switch in their settings.");
    await assertCanViewStudent(this.prisma, viewer, studentId);
    await this.change(studentId, body, viewer.id, role);
    return this.stateFor(studentId);
  }

  // ── Academy settings ───────────────────────────────────────

  async getSettings(accessToken: string | undefined): Promise<AiPlayReviewSettings> {
    this.assertAdmin(await this.authenticate(accessToken));
    return this.settingsView();
  }

  async updateSettings(accessToken: string | undefined, body: UpdateAiPlayReviewSettingsRequest): Promise<AiPlayReviewSettings> {
    const admin = await this.authenticate(accessToken);
    this.assertAdmin(admin);
    const tenantId = requireTenantId("aiPlayReviewSettings");
    const data = {
      ...(body.engineReviewEnabled !== undefined ? { engineReviewEnabled: body.engineReviewEnabled } : {}),
      ...(body.outsideAiEnabled !== undefined ? { outsideAiEnabled: body.outsideAiEnabled } : {}),
      updatedById: admin.id
    };
    await this.prisma.aiPlayReviewSettings.upsert({ create: { ...data, tenantId }, update: data, where: { tenantId } });
    return this.settingsView();
  }

  // ── Shared with the nightly review ─────────────────────────

  /** The academy's switches (defaults when never saved). Inside the academy's context. */
  async academySwitches(): Promise<{ engineReviewEnabled: boolean; outsideAiEnabled: boolean }> {
    const row = await this.prisma.aiPlayReviewSettings.findUnique({
      select: { engineReviewEnabled: true, outsideAiEnabled: true },
      where: { tenantId: requireTenantId("aiPlayReviewSettings") }
    });
    return { engineReviewEnabled: row?.engineReviewEnabled ?? true, outsideAiEnabled: row?.outsideAiEnabled ?? false };
  }

  /** Latest consent row per student (only students with one). */
  async latestConsents(studentIds: string[]): Promise<Map<string, ConsentRow>> {
    if (studentIds.length === 0) return new Map();
    const rows = await this.prisma.aiReviewConsent.findMany({
      distinct: ["studentId"],
      orderBy: [{ studentId: "asc" }, { createdAt: "desc" }, { id: "desc" }],
      select: { allowed: true, changedByRole: true, createdAt: true, studentId: true, version: true },
      where: { studentId: { in: studentIds } }
    });
    return new Map(rows.map((r) => [r.studentId, r]));
  }

  /** Students whose current consent is on (the nightly comment pass). */
  async consentedStudentIds(): Promise<string[]> {
    const rows = await this.prisma.aiReviewConsent.findMany({
      distinct: ["studentId"],
      orderBy: [{ studentId: "asc" }, { createdAt: "desc" }, { id: "desc" }],
      select: { allowed: true, studentId: true, version: true }
    });
    return rows.filter((r) => aiConsentIsCurrent(r)).map((r) => r.studentId);
  }

  // ── Internals ──────────────────────────────────────────────

  private async change(studentId: string, body: SetAiReviewConsentRequest, changedById: string, changedByRole: AiConsentChangedBy) {
    // Switching ON needs the plan; switching OFF is always possible.
    if (body.allowed) await this.entitlements.assertFeature("aiPlayReview");
    await this.prisma.$transaction(async (tx) => {
      await tx.aiReviewConsent.create({
        data: {
          allowed: body.allowed,
          changedById,
          changedByRole,
          guardianConfirmed: body.allowed ? body.guardianConfirmed === true : false,
          studentId,
          version: AI_REVIEW_CONSENT_VERSION
        }
      });
      // Withdrawn: stop at once and delete what the outside AI wrote (the engine review stays).
      if (!body.allowed) await tx.aiPlayComment.deleteMany({ where: { studentId } });
    });
  }

  private async stateFor(studentId: string): Promise<AiReviewConsentState> {
    const [latest, switches, planIncludes] = await Promise.all([
      this.latestConsents([studentId]).then((m) => m.get(studentId) ?? null),
      this.academySwitches(),
      this.entitlements.hasFeature("aiPlayReview")
    ]);
    const providerConfigured = this.provider.config !== null;
    return {
      academyEnabled: switches.outsideAiEnabled,
      active: outsideAiAllowed({ academyEnabled: switches.outsideAiEnabled, consent: latest, planIncludes, providerConfigured }),
      allowed: aiConsentIsCurrent(latest),
      changedAt: latest ? latest.createdAt.toISOString() : null,
      changedBy: latest ? latest.changedByRole : null,
      currentVersion: AI_REVIEW_CONSENT_VERSION,
      needsReconsent: !!latest && latest.allowed && latest.version !== AI_REVIEW_CONSENT_VERSION,
      planIncludes,
      providerConfigured,
      providerName: this.provider.config?.name ?? null
    };
  }

  private async settingsView(): Promise<AiPlayReviewSettings> {
    const [switches, planIncludes, consented] = await Promise.all([
      this.academySwitches(),
      this.entitlements.hasFeature("aiPlayReview"),
      this.consentedStudentIds()
    ]);
    return {
      consentedStudents: consented.length,
      engineReviewEnabled: switches.engineReviewEnabled,
      outsideAiEnabled: switches.outsideAiEnabled,
      planIncludes,
      providerConfigured: this.provider.config !== null,
      providerName: this.provider.config?.name ?? null
    };
  }

  private authenticate(accessToken: string | undefined): Promise<User> {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }

  private assertStudent(user: User) {
    if (user.role !== UserRole.STUDENT) throw new ForbiddenException("Only students have their own AI review switch.");
  }

  private assertAdmin(user: User) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only admins change the academy's AI play review settings.");
    }
  }
}

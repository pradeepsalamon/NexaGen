import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import {
  CLASS_RECAP_AI_LABEL,
  CLASS_RECAP_MAX_REGENERATIONS,
  CLASS_RECAP_STATUSES,
  classRecapContentIssues,
  classRecapContentSchema,
  type ClassRecapClassInfo,
  type ClassRecapContent,
  type ClassRecapFailure,
  type ClassRecapFeedResponse,
  type ClassRecapListResponse,
  type ClassRecapResponse,
  type ClassRecapReviewCount,
  type ClassRecapSettings,
  type ClassRecapStaffView,
  type ClassRecapStudentView,
  type PaginatedQuery,
  type PublishClassRecapRequest,
  type RateClassRecapRequest,
  type SaveClassRecapRequest,
  type UpdateClassRecapSettingsRequest
} from "@nexa-chess/types";
import { ClassRecapStatus, Prisma, UserRole, type User } from "@prisma/client";
import { RECAP_MODELS, type RecapModels } from "../ai/chat-model";
import { authenticateUser } from "../auth/authenticate";
import { createdAtCursorWhere, CREATED_AT_DESC_ORDER, toCursorPage } from "../common/cursor-pagination";
import { paginationMeta, resolvePagination } from "../common/pagination";
import { queryEnum, queryString } from "../common/query-params";
import { EntitlementService } from "../platform/entitlement.service";
import { PrismaService } from "../prisma/prisma.service";
import { requireTenantId } from "../tenancy/tenant-sql";

const FEED_PAGE_SIZE = 10;

const CLASS_INFO_SELECT = {
  batch: { select: { name: true } },
  coach: { select: { firstName: true, lastName: true } },
  coachId: true,
  id: true,
  startsAt: true,
  title: true,
  topic: true
} satisfies Prisma.CoachClassSelect;

type ClassInfoRow = Prisma.CoachClassGetPayload<{ select: typeof CLASS_INFO_SELECT }>;
type RecapRow = Prisma.ClassRecapGetPayload<{ include: { class: { select: typeof CLASS_INFO_SELECT } } }>;

function isAdmin(user: Pick<User, "role">): boolean {
  return user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
}

function personName(person: { firstName: string; lastName: string | null } | null): string {
  return person ? `${person.firstName} ${person.lastName ?? ""}`.trim() : "";
}

function readContent(value: Prisma.JsonValue | null): ClassRecapContent | null {
  const parsed = classRecapContentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * AI class recaps (docs/CLASS_RECAPS.md): who sees what, and the reviewer's
 * actions. The class's own coach and the academy's admins review a draft,
 * edit it and publish it; students of the class see it only once published,
 * always with the AI label. Anyone else gets a 404 (no existence leak).
 */
@Injectable()
export class ClassRecapService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    @Inject(RECAP_MODELS) private readonly models: RecapModels
  ) {}

  // ── Reading ────────────────────────────────────────────────

  async getForClass(accessToken: string | undefined, classId: string): Promise<ClassRecapResponse> {
    const user = await this.authenticate(accessToken);
    const cls = await this.prisma.coachClass.findUnique({ select: { coachId: true, id: true }, where: { id: classId } });
    if (!cls) throw new NotFoundException("Class not found.");

    if (this.canReview(user, cls)) {
      const row = await this.findRecap(classId);
      return { recap: row ? this.toStaffView(row, await this.publisherName(row.publishedById)) : null, viewer: "STAFF" };
    }
    if (user.role === UserRole.STUDENT && (await this.isStudentOfClass(user.id, classId))) {
      const row = await this.findRecap(classId);
      return { recap: row && row.status === ClassRecapStatus.PUBLISHED ? this.toStudentView(row) : null, viewer: "STUDENT" };
    }
    throw new NotFoundException("Class not found.");
  }

  /** Coach: their own classes; admins: the academy's. Paged, newest class first. */
  async list(accessToken: string | undefined, query: Record<string, unknown>): Promise<ClassRecapListResponse> {
    const user = await this.authenticate(accessToken);
    this.assertStaff(user);
    const paging = resolvePagination(query as PaginatedQuery);
    const status = queryEnum(query.status, CLASS_RECAP_STATUSES, "status");
    const search = queryString(query.search, "search");
    const where: Prisma.ClassRecapWhereInput = {
      ...(status ? { status } : {}),
      class: {
        ...(isAdmin(user) ? {} : { coachId: user.id }),
        ...(search
          ? { OR: [{ topic: { contains: search, mode: "insensitive" } }, { title: { contains: search, mode: "insensitive" } }] }
          : {})
      }
    };
    const [total, rows] = await Promise.all([
      this.prisma.classRecap.count({ where }),
      this.prisma.classRecap.findMany({
        include: { class: { select: CLASS_INFO_SELECT } },
        orderBy: [{ class: { startsAt: "desc" } }, { id: "desc" }],
        skip: paging.skip,
        take: paging.take,
        where
      })
    ]);
    return {
      items: rows.map((row) => ({
        class: this.toClassInfo(row.class),
        failure: (row.failureCode as ClassRecapFailure | null) ?? null,
        id: row.id,
        publishedAt: row.publishedAt?.toISOString() ?? null,
        status: row.status,
        updatedAt: row.updatedAt.toISOString()
      })),
      pagination: paginationMeta(total, paging.page, paging.pageSize)
    };
  }

  /** The nav badge: drafts waiting for review. */
  async reviewCount(accessToken: string | undefined): Promise<ClassRecapReviewCount> {
    const user = await this.authenticate(accessToken);
    if (user.role !== UserRole.COACH && !isAdmin(user)) return { ready: 0 };
    const ready = await this.prisma.classRecap.count({
      where: { status: ClassRecapStatus.READY, ...(isAdmin(user) ? {} : { class: { coachId: user.id } }) }
    });
    return { ready };
  }

  /** A student's published recaps, newest first. */
  async feedMine(accessToken: string | undefined, query: Record<string, unknown>): Promise<ClassRecapFeedResponse> {
    const user = await this.authenticate(accessToken);
    if (user.role !== UserRole.STUDENT) throw new ForbiddenException("Only students have a recap feed.");
    const cursor = queryString(query.cursor, "cursor");
    const rows = await this.prisma.classRecap.findMany({
      include: { class: { select: CLASS_INFO_SELECT } },
      orderBy: [...CREATED_AT_DESC_ORDER],
      take: FEED_PAGE_SIZE + 1,
      where: {
        AND: [
          { status: ClassRecapStatus.PUBLISHED },
          { class: this.studentClassWhere(user.id) },
          createdAtCursorWhere(cursor)
        ]
      }
    });
    const page = toCursorPage(rows, FEED_PAGE_SIZE);
    const items = page.items.map((row) => this.toStudentView(row)).filter((item): item is ClassRecapStudentView => item !== null);
    return { items, nextCursor: page.nextCursor };
  }

  // ── Reviewer actions ───────────────────────────────────────

  async save(accessToken: string | undefined, classId: string, body: SaveClassRecapRequest): Promise<ClassRecapResponse> {
    const user = await this.authenticateReviewer(accessToken, classId);
    this.assertNoIssues(body.content);
    await this.transition(classId, [ClassRecapStatus.READY], {
      contentJson: body.content,
      editedAt: new Date(),
      editedById: user.id
    }, "Only a recap waiting for review can be edited.");
    return this.getForClass(accessToken, classId);
  }

  async publish(accessToken: string | undefined, classId: string, body: PublishClassRecapRequest): Promise<ClassRecapResponse> {
    const user = await this.authenticateReviewer(accessToken, classId);
    const row = await this.requireRecap(classId);
    const content = body.content ?? readContent(row.contentJson);
    if (!content) throw new ConflictException("This recap has nothing to publish yet.");
    this.assertNoIssues(content);
    const now = new Date();
    await this.transition(classId, [ClassRecapStatus.READY], {
      contentJson: content,
      ...(body.content ? { editedAt: now, editedById: user.id } : {}),
      publishedAt: now,
      publishedById: user.id,
      status: ClassRecapStatus.PUBLISHED
    }, "Only a recap waiting for review can be published.");
    return this.getForClass(accessToken, classId);
  }

  /** Undo of publish: students stop seeing it. */
  async unpublish(accessToken: string | undefined, classId: string): Promise<ClassRecapResponse> {
    await this.authenticateReviewer(accessToken, classId);
    await this.transition(classId, [ClassRecapStatus.PUBLISHED], {
      publishedAt: null,
      publishedById: null,
      status: ClassRecapStatus.READY
    }, "This recap isn't published.");
    return this.getForClass(accessToken, classId);
  }

  async discard(accessToken: string | undefined, classId: string): Promise<ClassRecapResponse> {
    await this.authenticateReviewer(accessToken, classId);
    await this.transition(classId, [ClassRecapStatus.READY], { status: ClassRecapStatus.DISCARDED }, "Only a recap waiting for review can be discarded.");
    return this.getForClass(accessToken, classId);
  }

  /** Undo of discard: back to review, with the same draft and edits. */
  async restore(accessToken: string | undefined, classId: string): Promise<ClassRecapResponse> {
    await this.authenticateReviewer(accessToken, classId);
    const row = await this.requireRecap(classId);
    if (!readContent(row.contentJson)) throw new ConflictException("This recap has no draft to restore; regenerate it instead.");
    await this.transition(classId, [ClassRecapStatus.DISCARDED], { status: ClassRecapStatus.READY }, "This recap isn't discarded.");
    return this.getForClass(accessToken, classId);
  }

  /**
   * A new draft from the transcript (the old one and its edits are dropped).
   * Not while it is being written, and not while published (unpublish first).
   */
  async regenerate(accessToken: string | undefined, classId: string): Promise<ClassRecapResponse> {
    await this.authenticateReviewer(accessToken, classId);
    const row = await this.requireRecap(classId);
    if (row.regenerations >= CLASS_RECAP_MAX_REGENERATIONS) {
      throw new ConflictException(`This recap was already regenerated ${CLASS_RECAP_MAX_REGENERATIONS} times.`);
    }
    const { count } = await this.prisma.classRecap.updateMany({
      data: {
        attempts: 0,
        contentJson: Prisma.DbNull,
        draftJson: Prisma.DbNull,
        editedAt: null,
        editedById: null,
        failureCode: null,
        generatedAt: null,
        notBefore: new Date(),
        rating: null,
        regenerations: { increment: 1 },
        status: ClassRecapStatus.QUEUED
      },
      where: {
        classId,
        regenerations: { lt: CLASS_RECAP_MAX_REGENERATIONS },
        status: { in: [ClassRecapStatus.READY, ClassRecapStatus.DISCARDED, ClassRecapStatus.FAILED, ClassRecapStatus.SKIPPED] }
      }
    });
    if (count === 0) {
      throw new ConflictException(
        row.status === ClassRecapStatus.PUBLISHED
          ? "Unpublish the recap before making a new one."
          : "This recap is already being written."
      );
    }
    return this.getForClass(accessToken, classId);
  }

  async rate(accessToken: string | undefined, classId: string, body: RateClassRecapRequest): Promise<ClassRecapResponse> {
    await this.authenticateReviewer(accessToken, classId);
    await this.transition(
      classId,
      [ClassRecapStatus.READY, ClassRecapStatus.PUBLISHED, ClassRecapStatus.DISCARDED],
      { rating: body.rating },
      "Only a written recap can be rated."
    );
    return this.getForClass(accessToken, classId);
  }

  // ── Academy settings ───────────────────────────────────────

  async getSettings(accessToken: string | undefined): Promise<ClassRecapSettings> {
    this.assertAdminUser(await this.authenticate(accessToken));
    return this.settingsView();
  }

  async updateSettings(accessToken: string | undefined, body: UpdateClassRecapSettingsRequest): Promise<ClassRecapSettings> {
    const admin = await this.authenticate(accessToken);
    this.assertAdminUser(admin);
    const tenantId = requireTenantId("classRecapSettings");
    const data = {
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.provider !== undefined ? { provider: body.provider } : {}),
      updatedById: admin.id
    };
    await this.prisma.classRecapSettings.upsert({ create: { ...data, tenantId }, update: data, where: { tenantId } });
    return this.settingsView();
  }

  /** The academy's switches (defaults when never saved). Inside the academy's context. */
  async academySettings(): Promise<{ enabled: boolean; provider: "LOCAL" | "OUTSIDE" }> {
    const row = await this.prisma.classRecapSettings.findUnique({
      select: { enabled: true, provider: true },
      where: { tenantId: requireTenantId("classRecapSettings") }
    });
    return { enabled: row?.enabled ?? true, provider: row?.provider ?? "LOCAL" };
  }

  private async settingsView(): Promise<ClassRecapSettings> {
    const [settings, planIncludes] = await Promise.all([this.academySettings(), this.entitlements.hasFeature("aiClassRecaps")]);
    const [outside] = this.models.outsideRoute();
    return {
      enabled: settings.enabled,
      local: { configured: this.models.local !== null, model: this.models.local?.model ?? null },
      outside: { configured: !!outside, model: outside?.model ?? null, name: outside?.name ?? null },
      planIncludes,
      provider: settings.provider,
      serverEnabled: getApiEnv().AI_CLASS_RECAPS_ENABLED
    };
  }

  // ── Internals ──────────────────────────────────────────────

  private authenticate(accessToken: string | undefined): Promise<User> {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }

  private canReview(user: User, cls: { coachId: string }): boolean {
    return isAdmin(user) || (user.role === UserRole.COACH && cls.coachId === user.id);
  }

  /** The class's own coach or an admin; anyone else gets a 404, like a missing class. */
  private async authenticateReviewer(accessToken: string | undefined, classId: string): Promise<User> {
    const user = await this.authenticate(accessToken);
    const cls = await this.prisma.coachClass.findUnique({ select: { coachId: true }, where: { id: classId } });
    if (!cls || !this.canReview(user, cls)) throw new NotFoundException("Class not found.");
    return user;
  }

  private assertStaff(user: User) {
    if (user.role !== UserRole.COACH && !isAdmin(user)) {
      throw new ForbiddenException("Only coaches and admins review class recaps.");
    }
  }

  private assertAdminUser(user: User) {
    if (!isAdmin(user)) throw new ForbiddenException("Only admins change the academy's class recap settings.");
  }

  private assertNoIssues(content: ClassRecapContent) {
    const issues = classRecapContentIssues(content);
    if (issues.length) throw new BadRequestException(issues[0]);
  }

  private studentClassWhere(studentId: string): Prisma.CoachClassWhereInput {
    return {
      OR: [{ batch: { students: { some: { studentId } } } }, { attendances: { some: { studentId } } }]
    };
  }

  private async isStudentOfClass(studentId: string, classId: string): Promise<boolean> {
    const count = await this.prisma.coachClass.count({ where: { AND: [{ id: classId }, this.studentClassWhere(studentId)] } });
    return count > 0;
  }

  private findRecap(classId: string): Promise<RecapRow | null> {
    return this.prisma.classRecap.findUnique({ include: { class: { select: CLASS_INFO_SELECT } }, where: { classId } });
  }

  private async requireRecap(classId: string): Promise<RecapRow> {
    const row = await this.findRecap(classId);
    if (!row) throw new NotFoundException("This class has no recap.");
    return row;
  }

  /** A status-filtered update: a lost race or a wrong state is a 409, never a silent overwrite. */
  private async transition(
    classId: string,
    from: ClassRecapStatus[],
    data: Prisma.ClassRecapUpdateManyMutationInput,
    conflictMessage: string
  ): Promise<void> {
    await this.requireRecap(classId);
    const { count } = await this.prisma.classRecap.updateMany({ data, where: { classId, status: { in: from } } });
    if (count === 0) throw new ConflictException(conflictMessage);
  }

  private async publisherName(userId: string | null): Promise<string | null> {
    if (!userId) return null;
    const user = await this.prisma.user.findUnique({ select: { firstName: true, lastName: true }, where: { id: userId } });
    return user ? personName(user) : null;
  }

  private toClassInfo(cls: ClassInfoRow): ClassRecapClassInfo {
    return {
      batchName: cls.batch?.name ?? null,
      classId: cls.id,
      coachName: personName(cls.coach),
      startsAt: cls.startsAt.toISOString(),
      topic: cls.topic || cls.title || "Untitled class"
    };
  }

  private toStaffView(row: RecapRow, publishedByName: string | null): ClassRecapStaffView {
    return {
      class: this.toClassInfo(row.class),
      content: readContent(row.contentJson),
      draft: readContent(row.draftJson),
      edited: row.editedAt !== null,
      failure: (row.failureCode as ClassRecapFailure | null) ?? null,
      generatedAt: row.generatedAt?.toISOString() ?? null,
      id: row.id,
      model: row.model,
      provider: row.provider,
      providerName: row.providerName,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      publishedByName,
      rating: row.rating,
      regenerationsLeft: Math.max(0, CLASS_RECAP_MAX_REGENERATIONS - row.regenerations),
      status: row.status,
      updatedAt: row.updatedAt.toISOString()
    };
  }

  /** Null when the stored content can't be read (never throws, so one bad row can't break a feed). */
  private toStudentView(row: RecapRow): ClassRecapStudentView | null {
    const content = readContent(row.contentJson);
    if (!content || !row.publishedAt) return null;
    return {
      aiLabel: CLASS_RECAP_AI_LABEL,
      class: this.toClassInfo(row.class),
      content,
      id: row.id,
      publishedAt: row.publishedAt.toISOString()
    };
  }
}

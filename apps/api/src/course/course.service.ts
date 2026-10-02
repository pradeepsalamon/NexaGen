import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type {
  AttachCourseModuleRequest,
  CourseDetail,
  CourseListQuery,
  CourseListResponse,
  CourseModuleContentRef,
  CourseModuleResponse,
  CourseModuleSummary,
  CourseResponse,
  CourseSummary,
  CreateCourseRequest,
  ReorderCourseModulesRequest,
  SetCourseArchivedRequest,
  SetCoursePublishedRequest,
  UpdateCourseModuleRequest,
  UpdateCourseRequest
} from "@nexa-chess/types";
import { CourseStatus, Prisma, type User } from "@prisma/client";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  paginationMeta
} from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import { TrashRepository } from "../trash/trash.repository";
import { assertAdmin, authenticateUser, fullName } from "./course-auth.helper";

const courseModuleInclude = {
  assignment: { select: { id: true, title: true, activityType: true, pgn: true } },
  puzzle: { select: { id: true, title: true, puzzleType: true } }
} satisfies Prisma.CourseModuleInclude;

const courseListInclude = {
  createdBy: { select: { firstName: true, lastName: true } },
  _count: { select: { modules: true } }
} satisfies Prisma.CourseInclude;

const courseDetailInclude = {
  createdBy: { select: { firstName: true, lastName: true } },
  modules: { include: courseModuleInclude, orderBy: { order: "asc" } }
} satisfies Prisma.CourseInclude;

type CourseListRow = Prisma.CourseGetPayload<{ include: typeof courseListInclude }>;
type CourseDetailRow = Prisma.CourseGetPayload<{ include: typeof courseDetailInclude }>;
type CourseModuleRow = Prisma.CourseModuleGetPayload<{ include: typeof courseModuleInclude }>;

@Injectable()
export class CourseService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly trash: TrashRepository
  ) {}

  async list(
    accessToken: string | undefined,
    query: CourseListQuery
  ): Promise<CourseListResponse> {
    await this.auth(accessToken);

    const page = Math.max(1, Math.floor(Number(query.page) || 1));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(Number(query.pageSize) || DEFAULT_PAGE_SIZE))
    );
    const search = (query.search ?? "").trim();

    const where: Prisma.CourseWhereInput = {};
    const and: Prisma.CourseWhereInput[] = [];
    if (query.status) and.push({ status: query.status });
    if (search) {
      and.push({
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } }
        ]
      });
    }
    if (and.length > 0) where.AND = and;

    const [rows, total] = await Promise.all([
      this.prisma.course.findMany({
        where,
        include: courseListInclude,
        orderBy: { title: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.course.count({ where })
    ]);

    return {
      courses: rows.map((row) => this.toSummary(row)),
      pagination: paginationMeta(total, page, pageSize)
    };
  }

  async get(accessToken: string | undefined, id: string): Promise<CourseResponse> {
    await this.auth(accessToken);
    const row = await this.loadDetail(id);
    return { course: this.toDetail(row) };
  }

  async create(
    accessToken: string | undefined,
    dto: CreateCourseRequest
  ): Promise<CourseResponse> {
    const user = await this.auth(accessToken);
    const created = await this.prisma.course.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        createdById: user.id
      },
      include: courseDetailInclude
    });
    return { course: this.toDetail(created) };
  }

  async update(
    accessToken: string | undefined,
    id: string,
    dto: UpdateCourseRequest
  ): Promise<CourseResponse> {
    await this.auth(accessToken);
    await this.loadDetail(id);

    const data: Prisma.CourseUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;

    const updated = await this.prisma.course.update({
      where: { id },
      data,
      include: courseDetailInclude
    });
    return { course: this.toDetail(updated) };
  }

  async setPublished(
    accessToken: string | undefined,
    id: string,
    dto: SetCoursePublishedRequest
  ): Promise<CourseResponse> {
    const user = await this.auth(accessToken);
    const existing = await this.loadDetail(id);

    if (dto.published && existing.modules.length === 0) {
      throw new BadRequestException("Add at least one module before publishing.");
    }

    const updated = await this.prisma.course.update({
      where: { id },
      data: dto.published
        ? {
            status: CourseStatus.PUBLISHED,
            publishedAt: existing.publishedAt ?? new Date(),
            publishedById: user.id,
            archivedAt: null,
            archivedById: null
          }
        : { status: CourseStatus.DRAFT },
      include: courseDetailInclude
    });
    return { course: this.toDetail(updated) };
  }

  async setArchived(
    accessToken: string | undefined,
    id: string,
    dto: SetCourseArchivedRequest
  ): Promise<CourseResponse> {
    const user = await this.auth(accessToken);
    const existing = await this.loadDetail(id);

    const updated = await this.prisma.course.update({
      where: { id },
      data: dto.archived
        ? { status: CourseStatus.ARCHIVED, archivedAt: new Date(), archivedById: user.id }
        : {
            status: existing.publishedAt ? CourseStatus.PUBLISHED : CourseStatus.DRAFT,
            archivedAt: null,
            archivedById: null
          },
      include: courseDetailInclude
    });
    return { course: this.toDetail(updated) };
  }

  async remove(accessToken: string | undefined, id: string): Promise<{ success: true }> {
    const user = await this.auth(accessToken);
    await this.loadDetail(id);
    await this.prisma.$transaction((tx) => this.trash.cascadeSoftDelete(tx, "Course", id, user.id));
    return { success: true };
  }

  // ── Modules ──

  async attachModule(
    accessToken: string | undefined,
    courseId: string,
    dto: AttachCourseModuleRequest
  ): Promise<CourseModuleResponse> {
    await this.auth(accessToken);
    await this.loadDetail(courseId);

    if (dto.contentType === "ASSIGNMENT") {
      const assignment = await this.prisma.assignment.findUnique({
        where: { id: dto.assignmentId }
      });
      if (!assignment) throw new BadRequestException("The selected assignment does not exist.");
    } else {
      const puzzle = await this.prisma.puzzle.findUnique({ where: { id: dto.puzzleId } });
      if (!puzzle) throw new BadRequestException("The selected puzzle does not exist.");
    }

    const maxOrder = await this.prisma.courseModule.aggregate({
      where: { courseId },
      _max: { order: true }
    });

    const created = await this.prisma.courseModule.create({
      data: {
        courseId,
        title: dto.title.trim(),
        contentType: dto.contentType,
        assignmentId: dto.contentType === "ASSIGNMENT" ? dto.assignmentId : null,
        puzzleId: dto.contentType === "PUZZLE" ? dto.puzzleId : null,
        order: (maxOrder._max.order ?? -1) + 1
      },
      include: courseModuleInclude
    });
    return { module: this.toModuleSummary(created) };
  }

  async updateModule(
    accessToken: string | undefined,
    courseId: string,
    moduleId: string,
    dto: UpdateCourseModuleRequest
  ): Promise<CourseModuleResponse> {
    await this.auth(accessToken);
    await this.loadModule(courseId, moduleId);

    const updated = await this.prisma.courseModule.update({
      where: { id: moduleId },
      data: dto.title !== undefined ? { title: dto.title.trim() } : {},
      include: courseModuleInclude
    });
    return { module: this.toModuleSummary(updated) };
  }

  async removeModule(
    accessToken: string | undefined,
    courseId: string,
    moduleId: string
  ): Promise<{ success: true }> {
    const user = await this.auth(accessToken);
    await this.loadModule(courseId, moduleId);
    await this.prisma.$transaction((tx) =>
      this.trash.softDelete(tx, "CourseModule", moduleId, user.id)
    );
    return { success: true };
  }

  async reorderModules(
    accessToken: string | undefined,
    courseId: string,
    dto: ReorderCourseModulesRequest
  ): Promise<{ success: true }> {
    await this.auth(accessToken);
    await this.loadDetail(courseId);

    const existing = await this.prisma.courseModule.findMany({
      where: { courseId },
      select: { id: true }
    });
    const existingIds = new Set(existing.map((m) => m.id));
    const submittedIds = new Set(dto.moduleIds);
    const matches =
      existingIds.size === submittedIds.size &&
      [...existingIds].every((id) => submittedIds.has(id));
    if (!matches) {
      throw new BadRequestException("The submitted module list does not match this course.");
    }

    await this.prisma.$transaction(
      dto.moduleIds.map((id: string, index: number) =>
        this.prisma.courseModule.update({ where: { id }, data: { order: index } })
      )
    );
    return { success: true };
  }

  // ── internals ──

  private async auth(accessToken: string | undefined): Promise<User> {
    return assertAdmin(await authenticateUser(this.jwtService, this.prisma, accessToken));
  }

  private async loadDetail(id: string): Promise<CourseDetailRow> {
    const row = await this.prisma.course.findUnique({ where: { id }, include: courseDetailInclude });
    if (!row) throw new NotFoundException("Course not found.");
    return row;
  }

  private async loadModule(courseId: string, moduleId: string): Promise<CourseModuleRow> {
    const row = await this.prisma.courseModule.findUnique({
      where: { id: moduleId },
      include: courseModuleInclude
    });
    if (!row || row.courseId !== courseId) throw new NotFoundException("Module not found.");
    return row;
  }

  private contentRef(row: CourseModuleRow): CourseModuleContentRef {
    if (row.contentType === "ASSIGNMENT" && row.assignment) {
      return {
        assignment: {
          id: row.assignment.id,
          title: row.assignment.title,
          activityType: row.assignment.activityType,
          pgn: row.assignment.pgn
        },
        puzzle: null
      };
    }
    if (row.contentType === "PUZZLE" && row.puzzle) {
      return {
        assignment: null,
        puzzle: { id: row.puzzle.id, title: row.puzzle.title, puzzleType: row.puzzle.puzzleType }
      };
    }
    throw new NotFoundException("The content referenced by this module is no longer available.");
  }

  private toModuleSummary(row: CourseModuleRow): CourseModuleSummary {
    return {
      id: row.id,
      title: row.title,
      order: row.order,
      contentType: row.contentType,
      ...this.contentRef(row)
    };
  }

  private toSummary(row: CourseListRow): CourseSummary {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      moduleCount: row._count.modules,
      createdByName: fullName(row.createdBy),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null
    };
  }

  private toDetail(row: CourseDetailRow): CourseDetail {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      moduleCount: row.modules.length,
      createdByName: fullName(row.createdBy),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
      modules: row.modules.map((m) => this.toModuleSummary(m))
    };
  }
}

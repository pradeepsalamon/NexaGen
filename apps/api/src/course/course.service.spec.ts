/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { CourseStatus, UserRole, UserStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TrashRepository } from "../trash/trash.repository";
import { CourseService } from "./course.service";

const TOKEN = "access-token";
const ADMIN_ID = "admin-1";
const STUDENT_ID = "student-1";
const COACH_ID = "coach-1";

const asRole = (id: string, role: UserRole) => ({ id, role, status: UserStatus.ACTIVE });

function courseRow(overrides: Partial<any> = {}) {
  return {
    id: "course-1",
    title: "Opening Fundamentals",
    description: null,
    status: CourseStatus.DRAFT,
    createdBy: { firstName: "Ada", lastName: "Admin" },
    publishedAt: null,
    publishedById: null,
    archivedAt: null,
    archivedById: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    modules: [],
    ...overrides
  };
}

function moduleRow(overrides: Partial<any> = {}) {
  return {
    id: "module-1",
    courseId: "course-1",
    title: "Module 1",
    order: 0,
    contentType: "PUZZLE",
    assignment: null,
    puzzle: { id: "puzzle-1", title: "Fork practice", puzzleType: "TACTICAL" },
    ...overrides
  };
}

describe("CourseService", () => {
  let service: CourseService;
  let jwt: { verifyAsync: jest.Mock };
  let prisma: any;
  let trash: { cascadeSoftDelete: jest.Mock; softDelete: jest.Mock };

  beforeEach(async () => {
    jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: ADMIN_ID, type: "access" }) };
    trash = {
      cascadeSoftDelete: jest.fn().mockResolvedValue(undefined),
      softDelete: jest.fn().mockResolvedValue(undefined)
    };
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(asRole(ADMIN_ID, UserRole.ADMIN)) },
      course: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(courseRow()),
        create: jest.fn().mockImplementation(({ data }) => courseRow(data)),
        update: jest.fn().mockImplementation(({ data }) => courseRow(data))
      },
      courseModule: {
        aggregate: jest.fn().mockResolvedValue({ _max: { order: null } }),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(moduleRow()),
        create: jest.fn().mockImplementation(({ data }) => moduleRow(data)),
        update: jest.fn().mockImplementation(({ data }) => moduleRow(data))
      },
      assignment: { findUnique: jest.fn().mockResolvedValue({ id: "assignment-1" }) },
      puzzle: { findUnique: jest.fn().mockResolvedValue({ id: "puzzle-1" }) },
      $transaction: jest.fn((arg: unknown) =>
        Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma)
      )
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CourseService,
        { provide: JwtService, useValue: jwt },
        { provide: PrismaService, useValue: prisma },
        { provide: TrashRepository, useValue: trash }
      ]
    }).compile();

    service = moduleRef.get(CourseService);
  });

  it("blocks a coach from creating a course", async () => {
    prisma.user.findUnique.mockResolvedValue(asRole(COACH_ID, UserRole.COACH));
    await expect(
      service.create(TOKEN, { title: "New course" })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("blocks a student from creating a course", async () => {
    prisma.user.findUnique.mockResolvedValue(asRole(STUDENT_ID, UserRole.STUDENT));
    await expect(
      service.create(TOKEN, { title: "New course" })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refuses to publish a course with zero modules", async () => {
    prisma.course.findUnique.mockResolvedValue(courseRow({ modules: [] }));
    await expect(service.setPublished(TOKEN, "course-1", { published: true })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it("publishes a course that has at least one module", async () => {
    prisma.course.findUnique.mockResolvedValue(courseRow({ modules: [moduleRow()] }));
    const res = await service.setPublished(TOKEN, "course-1", { published: true });
    expect(prisma.course.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "course-1" },
        data: expect.objectContaining({ status: CourseStatus.PUBLISHED })
      })
    );
    expect(res.course.status).toBe(CourseStatus.PUBLISHED);
  });

  it("attachModule rejects a contentType/id pairing that doesn't match (schema-level, sanity check on the service)", async () => {
    // The Zod schema (attachCourseModuleRequestSchema) is what normally blocks
    // this at the controller boundary; the service still trusts its input
    // shape, so this exercises the "referenced content missing" branch instead.
    prisma.assignment.findUnique.mockResolvedValue(null);
    await expect(
      service.attachModule(TOKEN, "course-1", {
        title: "New module",
        contentType: "ASSIGNMENT",
        assignmentId: "missing-assignment"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("attachModule rejects a reference to a non-existent puzzle", async () => {
    prisma.puzzle.findUnique.mockResolvedValue(null);
    await expect(
      service.attachModule(TOKEN, "course-1", {
        title: "New module",
        contentType: "PUZZLE",
        puzzleId: "missing-puzzle"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("attachModule assigns the next order after existing modules", async () => {
    prisma.courseModule.aggregate.mockResolvedValue({ _max: { order: 2 } });
    await service.attachModule(TOKEN, "course-1", {
      title: "New module",
      contentType: "PUZZLE",
      puzzleId: "puzzle-1"
    });
    expect(prisma.courseModule.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ order: 3 }) })
    );
  });

  it("reorderModules writes sequential order matching the submitted array", async () => {
    prisma.courseModule.findMany.mockResolvedValue([
      { id: "m1" },
      { id: "m2" },
      { id: "m3" }
    ]);
    await service.reorderModules(TOKEN, "course-1", { moduleIds: ["m3", "m1", "m2"] });
    expect(prisma.courseModule.update).toHaveBeenNthCalledWith(1, {
      where: { id: "m3" },
      data: { order: 0 }
    });
    expect(prisma.courseModule.update).toHaveBeenNthCalledWith(2, {
      where: { id: "m1" },
      data: { order: 1 }
    });
    expect(prisma.courseModule.update).toHaveBeenNthCalledWith(3, {
      where: { id: "m2" },
      data: { order: 2 }
    });
  });

  it("reorderModules rejects a submitted list that doesn't match the course's modules", async () => {
    prisma.courseModule.findMany.mockResolvedValue([{ id: "m1" }, { id: "m2" }]);
    await expect(
      service.reorderModules(TOKEN, "course-1", { moduleIds: ["m1"] })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("delete routes through trash.cascadeSoftDelete", async () => {
    await service.remove(TOKEN, "course-1");
    expect(trash.cascadeSoftDelete).toHaveBeenCalledWith(prisma, "Course", "course-1", ADMIN_ID);
  });

  it("removeModule routes through trash.softDelete", async () => {
    await service.removeModule(TOKEN, "course-1", "module-1");
    expect(trash.softDelete).toHaveBeenCalledWith(prisma, "CourseModule", "module-1", ADMIN_ID);
  });
});

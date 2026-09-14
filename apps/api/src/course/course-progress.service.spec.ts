/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { CourseStatus, UserRole, UserStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CourseProgressService } from "./course-progress.service";

const TOKEN = "access-token";
const STUDENT_ID = "student-1";

const student = { id: STUDENT_ID, role: UserRole.STUDENT, status: UserStatus.ACTIVE };

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

describe("CourseProgressService", () => {
  let service: CourseProgressService;
  let jwt: { verifyAsync: jest.Mock };
  let prisma: any;

  beforeEach(async () => {
    jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: STUDENT_ID, type: "access" }) };
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(student) },
      course: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null)
      },
      courseModule: {
        findUnique: jest.fn().mockResolvedValue(moduleRow()),
        count: jest.fn().mockResolvedValue(3)
      },
      studentCourseProgress: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue(undefined)
      },
      studentModuleProgress: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue(undefined),
        count: jest.fn().mockResolvedValue(1)
      },
      $transaction: jest.fn((arg: unknown) =>
        Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma)
      )
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CourseProgressService,
        { provide: JwtService, useValue: jwt },
        { provide: PrismaService, useValue: prisma }
      ]
    }).compile();

    service = moduleRef.get(CourseProgressService);
  });

  it("only lists PUBLISHED courses (the query itself filters status)", async () => {
    await service.listForStudent(TOKEN);
    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: CourseStatus.PUBLISHED } })
    );
  });

  it("throws NotFoundException for a DRAFT course detail (does not leak existence via Forbidden)", async () => {
    prisma.course.findUnique.mockResolvedValue({
      id: "course-1",
      status: CourseStatus.DRAFT,
      modules: []
    });
    await expect(service.getForStudent(TOKEN, "course-1")).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("throws NotFoundException for an ARCHIVED course detail", async () => {
    prisma.course.findUnique.mockResolvedValue({
      id: "course-1",
      status: CourseStatus.ARCHIVED,
      modules: []
    });
    await expect(service.getForStudent(TOKEN, "course-1")).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("mineGet touches lastOpenedAt via an upsert", async () => {
    prisma.course.findUnique.mockResolvedValue({
      id: "course-1",
      title: "Course",
      description: null,
      status: CourseStatus.PUBLISHED,
      modules: [moduleRow()]
    });
    await service.getForStudent(TOKEN, "course-1");
    expect(prisma.studentCourseProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId_courseId: { studentId: STUDENT_ID, courseId: "course-1" } }
      })
    );
  });

  it("mark-complete is idempotent and recomputes progressPercent with correct rounding (1/3 -> 33%)", async () => {
    prisma.course.findUnique.mockResolvedValue({ id: "course-1", status: CourseStatus.PUBLISHED });
    prisma.courseModule.count.mockResolvedValue(3);
    prisma.studentModuleProgress.count.mockResolvedValue(1);

    const res = await service.completeModule(TOKEN, "course-1", "module-1");

    expect(prisma.studentModuleProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId_moduleId: { studentId: STUDENT_ID, moduleId: "module-1" } }
      })
    );
    expect(res.progressPercent).toBe(33);

    // Calling it again for an already-completed module stays idempotent —
    // the unique constraint's `update: {}` is a no-op, count stays at 1/3.
    const res2 = await service.completeModule(TOKEN, "course-1", "module-1");
    expect(res2.progressPercent).toBe(33);
  });

  it("mark-complete on a DRAFT course's module throws NotFoundException", async () => {
    prisma.course.findUnique.mockResolvedValue({ id: "course-1", status: CourseStatus.DRAFT });
    await expect(
      service.completeModule(TOKEN, "course-1", "module-1")
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

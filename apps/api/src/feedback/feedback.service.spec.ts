import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma, UserRole, UserStatus } from "@prisma/client";
import { FeedbackService } from "./feedback.service";
import { PrismaService } from "../prisma/prisma.service";
import { RECORDING_TRASH } from "../trash/trash.testing";

const ACCESS_TOKEN = "access-token";
const STUDENT_ID = "student-1";
const COACH_ID = "coach-1";
const CLASS_ID = "class-1";

const QUESTIONS = [
  { id: "q1", label: "Overall", required: true, type: "RATING" },
  { id: "q2", label: "Clarity", required: false, type: "RATING" },
  { id: "q3", label: "Comments", required: false, type: "TEXT" }
];

function formRow(overrides: Record<string, unknown> = {}) {
  return {
    allowSkip: true,
    batchIds: [],
    classInterval: 1,
    createdAt: new Date(Date.now() - 30 * 86_400_000),
    description: null,
    endsAt: null,
    expiresAfterDays: 7,
    id: "form-1",
    intervalDays: null,
    isActive: true,
    placements: ["CLASS_END"],
    questions: QUESTIONS,
    showToCoach: true,
    startsAt: null,
    title: "Class feedback",
    trigger: "AFTER_CLASS",
    updatedAt: new Date(),
    ...overrides
  };
}

const attendanceRow = {
  class: {
    batchId: "batch-1",
    coachId: COACH_ID,
    endsAt: new Date(Date.now() - 3_600_000),
    id: CLASS_ID,
    liveSession: null,
    title: "Endgames",
    topic: null
  }
};

describe("FeedbackService", () => {
  let service: FeedbackService;
  let jwtService: { verifyAsync: jest.Mock };
  let prisma: {
    user: { findUnique: jest.Mock; findMany: jest.Mock };
    feedbackForm: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; delete: jest.Mock };
    feedbackResponse: { findMany: jest.Mock; count: jest.Mock; create: jest.Mock };
    classAttendance: { findMany: jest.Mock };
  };

  const asRole = (role: UserRole, id = STUDENT_ID) =>
    prisma.user.findUnique.mockResolvedValue({ id, role, status: UserStatus.ACTIVE });

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn().mockResolvedValue({ sub: STUDENT_ID, type: "access" }) };
    prisma = {
      classAttendance: { findMany: jest.fn().mockResolvedValue([attendanceRow]) },
      feedbackForm: {
        create: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn().mockResolvedValue([formRow()]),
        findUnique: jest.fn().mockResolvedValue(formRow())
      },
      feedbackResponse: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: "resp-1" }),
        findMany: jest.fn().mockResolvedValue([])
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ firstName: "Maya", id: COACH_ID, lastName: "Rao" }]),
        findUnique: jest.fn()
      }
    };
    asRole(UserRole.STUDENT);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackService,
        { provide: JwtService, useValue: jwtService },
        { provide: PrismaService, useValue: prisma },
        RECORDING_TRASH
      ]
    }).compile();

    service = module.get(FeedbackService);
  });

  it("shows a coach only forms with at least 3 responses about them, and counts the rest as withheld (review G1)", async () => {
    asRole(UserRole.COACH, COACH_ID);
    const p = prisma as unknown as Record<string, Record<string, jest.Mock>>;
    p.user.findUniqueOrThrow = jest.fn().mockResolvedValue({ firstName: "Maya", lastName: "Rao" });
    p.feedbackResponse.groupBy = jest.fn().mockResolvedValue([
      { _count: { _all: 2 }, formId: "form-small" },
      { _count: { _all: 3 }, formId: "form-big" }
    ]);
    p.feedbackAnswer = { groupBy: jest.fn().mockResolvedValue([]) };
    const summarize = jest
      .spyOn(service as unknown as { summarizeCoaches: (...args: unknown[]) => Promise<unknown[]> }, "summarizeCoaches")
      .mockResolvedValue([{ averageRating: null, coachId: COACH_ID, responseCount: 0 }]);

    const result = await service.getMyFeedback(ACCESS_TOKEN);

    expect(result.withheldCount).toBe(2);
    expect(prisma.feedbackResponse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ formId: { in: ["form-big"] } }) })
    );
    expect(summarize).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ formId: { in: ["form-big"] } }));
  });

  it("gives a coach no class and no time of day on an anonymous response (review G1)", () => {
    const row = {
      answers: [],
      class: { title: "Endgames", topic: null },
      classId: CLASS_ID,
      coach: { firstName: "Ada", lastName: null },
      coachId: COACH_ID,
      createdAt: new Date("2026-11-20T19:42:13.000Z"),
      form: { title: "Class feedback" },
      formId: "form-1",
      id: "resp-1",
      overallRating: 4,
      student: { firstName: "Asha", lastName: null },
      studentId: STUDENT_ID
    };
    const toDto = (service as unknown as { toResponseDto: (r: unknown, anonymous: boolean) => Record<string, unknown> })
      .toResponseDto.bind(service);

    expect(toDto(row, true)).toMatchObject({
      classId: null,
      classTitle: null,
      createdAt: "2026-11-20T12:00:00.000Z",
      studentId: null,
      studentName: null
    });
    expect(toDto(row, false)).toMatchObject({
      classId: CLASS_ID,
      classTitle: "Endgames",
      createdAt: "2026-11-20T19:42:13.000Z",
      studentName: "Asha"
    });
  });

  it("rejects a missing token", async () => {
    await expect(service.getPending(undefined, {})).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("lists a pending class feedback for the class-end screen", async () => {
    const { items } = await service.getPending(ACCESS_TOKEN, { classId: CLASS_ID, placement: "CLASS_END" });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      classId: CLASS_ID,
      coachName: "Maya Rao",
      contextKey: `class:${CLASS_ID}`,
      formId: "form-1"
    });
  });

  it("hides forms not placed where the student is looking", async () => {
    const { items } = await service.getPending(ACCESS_TOKEN, { placement: "DASHBOARD_POPUP" });
    expect(items).toEqual([]);
  });

  it("stores a submission with the mean of its ratings", async () => {
    await service.submit(ACCESS_TOKEN, {
      answers: [
        { questionId: "q1", ratingValue: 5 },
        { questionId: "q2", ratingValue: 4 },
        { questionId: "q3", textValue: "Great examples" }
      ],
      coachId: COACH_ID,
      contextKey: `class:${CLASS_ID}`,
      formId: "form-1"
    });

    const { data } = prisma.feedbackResponse.create.mock.calls[0][0];
    expect(data).toMatchObject({
      classId: CLASS_ID,
      coachId: COACH_ID,
      overallRating: 4.5,
      status: "SUBMITTED",
      studentId: STUDENT_ID
    });
    expect(data.answers.create).toHaveLength(3);
  });

  it("refuses a target the server doesn't consider open", async () => {
    await expect(
      service.submit(ACCESS_TOKEN, {
        answers: [{ questionId: "q1", ratingValue: 5 }],
        coachId: "some-other-coach",
        contextKey: `class:${CLASS_ID}`,
        formId: "form-1"
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses a submission missing a required answer", async () => {
    await expect(
      service.submit(ACCESS_TOKEN, {
        answers: [],
        coachId: COACH_ID,
        contextKey: `class:${CLASS_ID}`,
        formId: "form-1"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("turns a duplicate submit into a conflict", async () => {
    prisma.feedbackResponse.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { clientVersion: "x", code: "P2002" })
    );

    await expect(
      service.skip(ACCESS_TOKEN, { coachId: COACH_ID, contextKey: `class:${CLASS_ID}`, formId: "form-1" })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("won't skip a form that disallows it", async () => {
    prisma.feedbackForm.findMany.mockResolvedValue([formRow({ allowSkip: false })]);

    await expect(
      service.skip(ACCESS_TOKEN, { coachId: COACH_ID, contextKey: `class:${CLASS_ID}`, formId: "form-1" })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("only lets students answer", async () => {
    asRole(UserRole.COACH, COACH_ID);
    await expect(
      service.skip(ACCESS_TOKEN, { coachId: COACH_ID, contextKey: "once", formId: "form-1" })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("forbids non-admins from managing forms", async () => {
    await expect(service.listForms(ACCESS_TOKEN)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refuses to delete a form that has responses", async () => {
    asRole(UserRole.ADMIN, "admin-1");
    prisma.feedbackResponse.count.mockResolvedValue(3);

    await expect(service.deleteForm(ACCESS_TOKEN, "form-1")).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.feedbackForm.delete).not.toHaveBeenCalled();
  });
});

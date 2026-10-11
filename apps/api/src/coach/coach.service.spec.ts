import { Test, TestingModule } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ClassStatus, UserRole, UserStatus } from "@prisma/client";
import { CoachService } from "./coach.service";
import { PrismaService } from "../prisma/prisma.service";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";

const ACCESS_TOKEN = "access-token";
const COACH_ID = "coach-1";

describe("CoachService class scheduling", () => {
  let service: CoachService;
  let jwtService: { verifyAsync: jest.Mock };
  let userFindUnique: jest.Mock;
  let coachClassFindUnique: jest.Mock;
  let coachClassUpdate: jest.Mock;
  let coachClassFindMany: jest.Mock;

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    userFindUnique = jest.fn().mockResolvedValue({
      id: COACH_ID,
      role: UserRole.COACH,
      status: UserStatus.ACTIVE
    });
    coachClassFindUnique = jest.fn();
    coachClassFindMany = jest.fn().mockResolvedValue([]);
    coachClassUpdate = jest.fn().mockImplementation(({ data }) => ({
      id: "class-1",
      batchId: "batch-1",
      coachId: COACH_ID,
      startsAt: data.startsAt ?? new Date(),
      endsAt: data.endsAt ?? new Date(),
      status: data.status ?? ClassStatus.SCHEDULED,
      createdAt: new Date(),
      cancelledAt: data.cancelledAt ?? null,
      title: null,
      topic: "Endgames",
      description: null,
      objectives: null,
      homework: null,
      notes: null,
      meetingRoomId: null,
      batch: { name: "Batch A", students: [] },
      liveSession: null
    }));

    jwtService.verifyAsync.mockResolvedValue({ sub: COACH_ID, type: "access" });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoachService,
        {
          provide: MessagingDispatchService,
          useValue: { dispatchInBackground: jest.fn() }
        },
        {
          provide: PrismaService,
          useValue: {
            batchStudent: { findMany: jest.fn() },
            coachClass: {
              count: jest.fn(),
              findMany: coachClassFindMany,
              findUnique: coachClassFindUnique,
              update: coachClassUpdate
            },
            user: { findUnique: userFindUnique }
          }
        },
        { provide: JwtService, useValue: jwtService }
      ]
    }).compile();

    service = module.get<CoachService>(CoachService);
  });

  describe("updateClass (notes only)", () => {
    const scheduledClass = {
      id: "class-1",
      coachId: COACH_ID,
      status: ClassStatus.SCHEDULED,
      startsAt: new Date(Date.now() + 60 * 60_000),
      endsAt: new Date(Date.now() + 2 * 60 * 60_000)
    };

    it("rejects editing a CANCELLED class", async () => {
      coachClassFindUnique.mockResolvedValue({ ...scheduledClass, status: ClassStatus.CANCELLED });

      await expect(
        service.updateClass(ACCESS_TOKEN, "class-1", { notes: "Recap" })
      ).rejects.toBeInstanceOf(ConflictException);

      expect(coachClassUpdate).not.toHaveBeenCalled();
    });

    it("lets a coach add notes after the class has run", async () => {
      coachClassFindUnique.mockResolvedValue({ ...scheduledClass, status: ClassStatus.COMPLETED });

      await expect(
        service.updateClass(ACCESS_TOKEN, "class-1", { notes: "Recap", homework: "Ex. 4" })
      ).resolves.toBeDefined();

      expect(coachClassUpdate).toHaveBeenCalled();
    });

    it("never writes the schedule, batch or settings", async () => {
      coachClassFindUnique.mockResolvedValue(scheduledClass);

      await service.updateClass(ACCESS_TOKEN, "class-1", {
        title: "Rook endings",
        startsAt: new Date().toISOString(),
        batchId: "other"
      } as never);

      const { data } = coachClassUpdate.mock.calls[0][0];
      expect(Object.keys(data).sort()).toEqual(
        ["batchType", "description", "homework", "notes", "objectives", "title", "topic"]
      );
      expect(data.batchType).toBeUndefined();
      expect(data.title).toBe("Rook endings");
    });

    it("sets a batch-type override on this class only", async () => {
      coachClassFindUnique.mockResolvedValue(scheduledClass);

      await service.updateClass(ACCESS_TOKEN, "class-1", { batchType: "BUDDY" });

      expect(coachClassUpdate).toHaveBeenCalledTimes(1);
      const { data, where } = coachClassUpdate.mock.calls[0][0];
      expect(where).toEqual({ id: "class-1" });
      expect(data.batchType).toBe("BUDDY");
    });

    it("clears the override with null (inherit again)", async () => {
      coachClassFindUnique.mockResolvedValue(scheduledClass);

      await service.updateClass(ACCESS_TOKEN, "class-1", { batchType: null });

      expect(coachClassUpdate.mock.calls[0][0].data.batchType).toBeNull();
    });

    it("rejects a class owned by another coach", async () => {
      coachClassFindUnique.mockResolvedValue({ ...scheduledClass, coachId: "someone-else" });

      await expect(
        service.updateClass(ACCESS_TOKEN, "class-1", { notes: "x" })
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("cancelClass (H18)", () => {
    it("rejects cancelling a COMPLETED class", async () => {
      coachClassFindUnique.mockResolvedValue({
        id: "class-1",
        coachId: COACH_ID,
        status: ClassStatus.COMPLETED
      });

      await expect(service.cancelClass(ACCESS_TOKEN, "class-1")).rejects.toBeInstanceOf(
        ConflictException
      );
    });

    it("rejects cancelling an already-cancelled class", async () => {
      coachClassFindUnique.mockResolvedValue({
        id: "class-1",
        coachId: COACH_ID,
        status: ClassStatus.CANCELLED
      });

      await expect(service.cancelClass(ACCESS_TOKEN, "class-1")).rejects.toBeInstanceOf(
        ConflictException
      );
    });

    it("cancels a SCHEDULED class", async () => {
      coachClassFindUnique.mockResolvedValue({
        id: "class-1",
        coachId: COACH_ID,
        status: ClassStatus.SCHEDULED
      });

      await expect(service.cancelClass(ACCESS_TOKEN, "class-1")).resolves.toBeDefined();
      expect(coachClassUpdate).toHaveBeenCalled();
    });
  });

  describe("getUpcomingClasses", () => {
    const student = (id: string, level: string | null, rating: number | null = null) => ({
      student: {
        avatarUrl: null,
        firstName: `First ${id}`,
        id,
        isDeleted: false,
        lastName: null,
        studentProfile: level ? { chessRating: rating, experienceLevel: level } : null
      }
    });
    const row = (overrides: Record<string, unknown> = {}) => ({
      id: "class-1",
      batchId: "batch-1",
      batchType: null,
      coachId: COACH_ID,
      startsAt: new Date(Date.now() + 60 * 60_000),
      endsAt: new Date(Date.now() + 2 * 60 * 60_000),
      status: ClassStatus.SCHEDULED,
      createdAt: new Date(),
      title: null,
      topic: null,
      description: null,
      objectives: null,
      homework: null,
      notes: null,
      meetingRoomId: null,
      batch: { name: "Batch A", batchType: null, students: [] as unknown[] },
      liveSession: null,
      ...overrides
    });

    it("caps the list at the requested limit", async () => {
      await service.getUpcomingClasses(ACCESS_TOKEN, 3);
      expect(coachClassFindMany.mock.calls[0][0].take).toBe(3);
    });

    it("clamps an oversized limit and ignores a missing one", async () => {
      await service.getUpcomingClasses(ACCESS_TOKEN, 5000);
      await service.getUpcomingClasses(ACCESS_TOKEN);
      expect(coachClassFindMany.mock.calls[0][0].take).toBe(50);
      expect(coachClassFindMany.mock.calls[1][0].take).toBeUndefined();
    });

    it("derives the batch type from the roster when nothing is set", async () => {
      coachClassFindMany.mockResolvedValue([
        row({
          batch: {
            name: "Pair",
            batchType: null,
            students: [student("s1", "BEGINNER", 1200), student("s2", "INTERMEDIATE")]
          }
        })
      ]);

      const { classes } = await service.getUpcomingClasses(ACCESS_TOKEN, 3);

      expect(classes[0]).toMatchObject({
        batchType: "BUDDY",
        batchTypeOverride: null,
        batchTypeSource: "ROSTER",
        level: "MIXED",
        studentCount: 2
      });
      expect(classes[0].students[0]).toMatchObject({ chessRating: 1200, experienceLevel: "BEGINNER" });
    });

    it("prefers the class override over the batch default", async () => {
      coachClassFindMany.mockResolvedValue([
        row({ batchType: "INDIVIDUAL", batch: { name: "B", batchType: "GROUP", students: [] } }),
        row({ id: "class-2", batch: { name: "B", batchType: "GROUP", students: [student("s1", "ADVANCED")] } })
      ]);

      const { classes } = await service.getUpcomingClasses(ACCESS_TOKEN, 3);

      expect(classes[0]).toMatchObject({
        batchType: "INDIVIDUAL",
        batchTypeInherited: "GROUP",
        batchTypeSource: "CLASS"
      });
      expect(classes[1]).toMatchObject({ batchType: "GROUP", batchTypeSource: "BATCH", level: "ADVANCED" });
    });
  });
});

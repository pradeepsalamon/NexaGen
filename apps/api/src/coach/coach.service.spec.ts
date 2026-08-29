import { Test, TestingModule } from "@nestjs/testing";
import { ConflictException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ClassStatus, UserRole, UserStatus } from "@prisma/client";
import { CoachService } from "./coach.service";
import { PrismaService } from "../prisma/prisma.service";

const ACCESS_TOKEN = "access-token";
const COACH_ID = "coach-1";

describe("CoachService class scheduling", () => {
  let service: CoachService;
  let jwtService: { verifyAsync: jest.Mock };
  let userFindUnique: jest.Mock;
  let batchFindUnique: jest.Mock;
  let coachClassFindFirst: jest.Mock;
  let coachClassFindUnique: jest.Mock;
  let coachClassCreate: jest.Mock;
  let coachClassUpdate: jest.Mock;

  const futureClass = (overrides: Partial<{ startsAt: string; endsAt: string }> = {}) => ({
    batchId: "batch-1",
    topic: "Endgames",
    startsAt: overrides.startsAt ?? new Date(Date.now() + 60 * 60_000).toISOString(),
    endsAt: overrides.endsAt ?? new Date(Date.now() + 2 * 60 * 60_000).toISOString()
  });

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    userFindUnique = jest.fn().mockResolvedValue({
      id: COACH_ID,
      role: UserRole.COACH,
      status: UserStatus.ACTIVE
    });
    batchFindUnique = jest.fn().mockResolvedValue({
      id: "batch-1",
      isDeleted: false,
      coaches: [{ coachId: COACH_ID }]
    });
    coachClassFindFirst = jest.fn().mockResolvedValue(null); // no scheduling conflicts
    coachClassFindUnique = jest.fn();
    coachClassCreate = jest.fn().mockImplementation(({ data }) => ({
      ...data,
      id: "class-1",
      createdAt: new Date(),
      batch: { name: "Batch A", students: [] },
      liveSession: null
    }));
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
          provide: PrismaService,
          useValue: {
            batch: { findUnique: batchFindUnique },
            batchStudent: { findMany: jest.fn() },
            coachClass: {
              count: jest.fn(),
              create: coachClassCreate,
              findFirst: coachClassFindFirst,
              findMany: jest.fn(),
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

  describe("createClass (H17)", () => {
    it("rejects a start time in the past", async () => {
      await expect(
        service.createClass(
          ACCESS_TOKEN,
          futureClass({
            startsAt: new Date(Date.now() - 60_000).toISOString(),
            endsAt: new Date(Date.now() + 60_000).toISOString()
          })
        )
      ).rejects.toBeInstanceOf(ConflictException);

      expect(coachClassCreate).not.toHaveBeenCalled();
    });

    it("rejects a class that overlaps an existing one", async () => {
      coachClassFindFirst.mockResolvedValueOnce({
        topic: "Existing",
        startsAt: new Date(Date.now() + 30 * 60_000),
        endsAt: new Date(Date.now() + 90 * 60_000)
      });

      await expect(service.createClass(ACCESS_TOKEN, futureClass())).rejects.toBeInstanceOf(
        ConflictException
      );

      expect(coachClassCreate).not.toHaveBeenCalled();
    });

    it("creates the class when the time is free and in the future", async () => {
      await expect(service.createClass(ACCESS_TOKEN, futureClass())).resolves.toBeDefined();
      expect(coachClassCreate).toHaveBeenCalled();
    });
  });

  describe("updateClass (H17 + H18)", () => {
    const scheduledClass = {
      id: "class-1",
      coachId: COACH_ID,
      status: ClassStatus.SCHEDULED,
      startsAt: new Date(Date.now() + 60 * 60_000),
      endsAt: new Date(Date.now() + 2 * 60 * 60_000)
    };

    it("rejects editing a COMPLETED class", async () => {
      coachClassFindUnique.mockResolvedValue({ ...scheduledClass, status: ClassStatus.COMPLETED });

      await expect(
        service.updateClass(ACCESS_TOKEN, "class-1", { topic: "New topic" })
      ).rejects.toBeInstanceOf(ConflictException);

      expect(coachClassUpdate).not.toHaveBeenCalled();
    });

    it("rejects editing a LIVE class", async () => {
      coachClassFindUnique.mockResolvedValue({ ...scheduledClass, status: ClassStatus.LIVE });

      await expect(
        service.updateClass(ACCESS_TOKEN, "class-1", { topic: "New topic" })
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects rescheduling into the past", async () => {
      coachClassFindUnique.mockResolvedValue(scheduledClass);

      await expect(
        service.updateClass(ACCESS_TOKEN, "class-1", {
          startsAt: new Date(Date.now() - 60_000).toISOString()
        })
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects rescheduling onto another class", async () => {
      coachClassFindUnique.mockResolvedValue(scheduledClass);
      coachClassFindFirst.mockResolvedValueOnce({
        topic: "Existing",
        startsAt: new Date(Date.now() + 60 * 60_000),
        endsAt: new Date(Date.now() + 3 * 60 * 60_000)
      });

      await expect(
        service.updateClass(ACCESS_TOKEN, "class-1", {
          startsAt: new Date(Date.now() + 90 * 60_000).toISOString(),
          endsAt: new Date(Date.now() + 150 * 60_000).toISOString()
        })
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("allows editing a SCHEDULED class with a free new time", async () => {
      coachClassFindUnique.mockResolvedValue(scheduledClass);

      await expect(
        service.updateClass(ACCESS_TOKEN, "class-1", { topic: "New topic" })
      ).resolves.toBeDefined();

      expect(coachClassUpdate).toHaveBeenCalled();
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
});

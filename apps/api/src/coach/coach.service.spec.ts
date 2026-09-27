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

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    userFindUnique = jest.fn().mockResolvedValue({
      id: COACH_ID,
      role: UserRole.COACH,
      status: UserStatus.ACTIVE
    });
    coachClassFindUnique = jest.fn();
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
        ["description", "homework", "notes", "objectives", "title", "topic"]
      );
      expect(data.title).toBe("Rook endings");
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
});

import { ConflictException } from "@nestjs/common";
import { assertNoSchedulingConflict, assertNotInPast } from "./class-scheduling.util";
import { PrismaService } from "../prisma/prisma.service";

describe("class-scheduling.util", () => {
  describe("assertNoSchedulingConflict", () => {
    let coachClassFindFirst: jest.Mock;
    let prisma: PrismaService;

    beforeEach(() => {
      coachClassFindFirst = jest.fn();
      prisma = { coachClass: { findFirst: coachClassFindFirst } } as unknown as PrismaService;
    });

    it("passes when no overlapping class exists", async () => {
      coachClassFindFirst.mockResolvedValue(null);

      await expect(
        assertNoSchedulingConflict(prisma, {
          coachId: "coach-1",
          startsAt: new Date("2026-01-01T10:00:00Z"),
          endsAt: new Date("2026-01-01T11:00:00Z")
        })
      ).resolves.toBeUndefined();

      expect(coachClassFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ coachId: "coach-1" })
        })
      );
    });

    it("throws ConflictException when an overlapping class exists", async () => {
      coachClassFindFirst.mockResolvedValue({
        topic: "Opening Prep",
        startsAt: new Date("2026-01-01T10:00:00Z"),
        endsAt: new Date("2026-01-01T11:00:00Z")
      });

      await expect(
        assertNoSchedulingConflict(prisma, {
          coachId: "coach-1",
          startsAt: new Date("2026-01-01T10:30:00Z"),
          endsAt: new Date("2026-01-01T11:30:00Z")
        })
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("excludes the class being edited from the conflict check", async () => {
      coachClassFindFirst.mockResolvedValue(null);

      await assertNoSchedulingConflict(prisma, {
        coachId: "coach-1",
        startsAt: new Date("2026-01-01T10:00:00Z"),
        endsAt: new Date("2026-01-01T11:00:00Z"),
        excludeClassId: "class-1"
      });

      const where = coachClassFindFirst.mock.calls[0][0].where;
      expect(where.id).toEqual({ not: "class-1" });
    });
  });

  describe("assertNotInPast", () => {
    it("throws for a start time in the past", () => {
      expect(() => assertNotInPast(new Date(Date.now() - 60_000))).toThrow(
        ConflictException
      );
    });

    it("allows a start time in the future", () => {
      expect(() => assertNotInPast(new Date(Date.now() + 60_000))).not.toThrow();
    });
  });
});

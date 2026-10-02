import { Test, TestingModule } from "@nestjs/testing";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma, UserRole, UserStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { DemoScheduleService, expandDemoSlots, isValidTimeZone } from "./demo-schedule.service";

describe("expandDemoSlots", () => {
  // Thursday 2026-10-01 12:00 UTC = 17:30 in Asia/Kolkata.
  const now = new Date("2026-10-01T12:00:00.000Z");

  it("expands weekly wall-clock slots in the schedule's timezone", () => {
    const out = expandDemoSlots({
      slots: [{ dayOfWeek: 6, startTime: "17:00" }],
      timezone: "Asia/Kolkata",
      durationMinutes: 45,
      now,
      horizonDays: 14
    });
    expect(out.map((o) => o.startsAt.toISOString())).toEqual([
      "2026-10-03T11:30:00.000Z",
      "2026-10-10T11:30:00.000Z"
    ]);
    expect(out[0].endsAt.toISOString()).toBe("2026-10-03T12:15:00.000Z");
  });

  it("skips today's slot once it has started and keeps a later one", () => {
    const out = expandDemoSlots({
      slots: [
        { dayOfWeek: 4, startTime: "17:00" },
        { dayOfWeek: 4, startTime: "18:00" }
      ],
      timezone: "Asia/Kolkata",
      durationMinutes: 60,
      now,
      horizonDays: 0
    });
    expect(out.map((o) => o.startsAt.toISOString())).toEqual(["2026-10-01T12:30:00.000Z"]);
  });

  it("de-duplicates repeated slots", () => {
    const out = expandDemoSlots({
      slots: [
        { dayOfWeek: 6, startTime: "17:00" },
        { dayOfWeek: 6, startTime: "17:00" }
      ],
      timezone: "UTC",
      durationMinutes: 60,
      now,
      horizonDays: 7
    });
    expect(out).toHaveLength(1);
  });

  it("validates IANA timezones", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});

describe("DemoScheduleService", () => {
  let service: DemoScheduleService;
  let prisma: {
    demoSchedule: Record<string, jest.Mock>;
    coachClass: Record<string, jest.Mock>;
    user: { findUnique: jest.Mock };
    $queryRaw: jest.Mock;
  };

  const SCHEDULE = {
    id: "sched-1",
    slug: "trial",
    topic: "Trial class",
    description: null,
    coachId: "coach-1",
    timezone: "UTC",
    slots: [{ dayOfWeek: 6, startTime: "10:00" }],
    durationMinutes: 60,
    accessMode: "PUBLIC",
    passcode: null,
    isActive: true,
    createdAt: new Date(),
    coach: { firstName: "Cora", lastName: "Coach" }
  };

  const superAdmin = { id: "admin-1", role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE };
  const coach = { id: "coach-1", role: UserRole.COACH, status: UserStatus.ACTIVE };

  beforeEach(async () => {
    prisma = {
      demoSchedule: {
        create: jest.fn().mockResolvedValue(SCHEDULE),
        update: jest.fn().mockResolvedValue(SCHEDULE),
        delete: jest.fn(),
        findMany: jest.fn().mockResolvedValue([SCHEDULE]),
        findUnique: jest.fn().mockResolvedValue(SCHEDULE),
        findUniqueOrThrow: jest.fn().mockResolvedValue(SCHEDULE)
      },
      coachClass: {
        create: jest.fn().mockResolvedValue({}),
        delete: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn()
      },
      user: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(where.id === "coach-1" ? coach : superAdmin)
        )
      },
      $queryRaw: jest.fn().mockResolvedValue([{ locked: true }])
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DemoScheduleService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: { verifyAsync: jest.fn().mockResolvedValue({ sub: "admin-1", type: "access" }) }
        }
      ]
    }).compile();

    service = module.get(DemoScheduleService);
  });

  it("refuses anyone but a super admin", async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ ...superAdmin, role: UserRole.ADMIN });
    await expect(service.list("token")).rejects.toThrow(ForbiddenException);
  });

  it("maps a duplicate slug to a readable conflict", async () => {
    prisma.demoSchedule.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" })
    );
    await expect(
      service.create("token", {
        slug: "trial",
        topic: "Trial",
        coachId: "coach-1",
        slots: [{ dayOfWeek: 6, startTime: "10:00" }]
      })
    ).rejects.toThrow(ConflictException);
  });

  it("creates only the occurrences that do not exist yet", async () => {
    const now = new Date("2026-10-01T00:00:00.000Z");
    const first = expandDemoSlots({
      slots: SCHEDULE.slots,
      timezone: "UTC",
      durationMinutes: 60,
      now
    });
    prisma.coachClass.findMany.mockResolvedValueOnce([{ startsAt: first[0].startsAt }]);

    const created = await service.ensureOccurrences("sched-1", now);

    expect(created).toBe(first.length - 1);
    expect(prisma.coachClass.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isDemo: true, demoScheduleId: "sched-1", demoAccessMode: "PUBLIC" })
      })
    );
  });

  it("skips a slot the coach is already booked for instead of double-booking", async () => {
    prisma.coachClass.findFirst.mockResolvedValue({ topic: "Batch", startsAt: new Date(), endsAt: new Date() });
    const created = await service.ensureOccurrences("sched-1", new Date("2026-10-01T00:00:00.000Z"));
    expect(created).toBe(0);
    expect(prisma.coachClass.create).not.toHaveBeenCalled();
  });

  it("does nothing for an inactive schedule", async () => {
    prisma.demoSchedule.findUnique.mockResolvedValueOnce({ ...SCHEDULE, isActive: false });
    expect(await service.ensureOccurrences("sched-1")).toBe(0);
  });

  it("on deactivation deletes unbooked future occurrences but keeps booked ones", async () => {
    prisma.demoSchedule.findUniqueOrThrow.mockResolvedValue({ ...SCHEDULE, isActive: false });
    prisma.coachClass.findMany.mockResolvedValue([
      { id: "occ-empty", coachId: "coach-1", startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000), _count: { demoRegistrations: 0 } },
      { id: "occ-booked", coachId: "coach-1", startsAt: new Date(Date.now() + 172_800_000), endsAt: new Date(Date.now() + 176_400_000), _count: { demoRegistrations: 2 } }
    ]);

    await service.update("token", "sched-1", { isActive: false });

    expect(prisma.coachClass.delete).toHaveBeenCalledWith({ where: { id: "occ-empty" } });
    expect(prisma.coachClass.delete).not.toHaveBeenCalledWith({ where: { id: "occ-booked" } });
    expect(prisma.coachClass.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "occ-booked" } })
    );
  });
});

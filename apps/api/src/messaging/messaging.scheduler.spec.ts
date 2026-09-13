import { Test, type TestingModule } from "@nestjs/testing";
import type { MessagingEvent } from "@nexa-chess/types";
import { PrismaService } from "../prisma/prisma.service";
import { MessagingDispatchService } from "./messaging-dispatch.service";
import { MessagingRuleService } from "./messaging-rule.service";
import { MessagingScheduler } from "./messaging.scheduler";

const MINUTE = 60_000;

function rule(event: MessagingEvent, overrides: Record<string, unknown> = {}) {
  return { event, enabled: true, leadTimeMinutes: 30, ...overrides };
}

describe("MessagingScheduler", () => {
  let scheduler: MessagingScheduler;
  let prisma: {
    $queryRaw: jest.Mock;
    coachClass: { findMany: jest.Mock };
    studentAssignment: { findMany: jest.Mock };
  };
  let dispatch: { dispatch: jest.Mock };
  let rules: Record<string, jest.Mock>;

  const setup = async (byEvent: Record<string, ReturnType<typeof rule>>) => {
    prisma = {
      // First call is pg_try_advisory_lock; the unlock returns nothing useful.
      $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
      coachClass: { findMany: jest.fn().mockResolvedValue([{ id: "class_1" }]) },
      studentAssignment: { findMany: jest.fn().mockResolvedValue([]) }
    };
    dispatch = {
      dispatch: jest.fn().mockResolvedValue({
        ruleEnabled: true,
        recipients: 1,
        queuedWhatsApp: 1,
        queuedInApp: 0,
        missingPhone: 0,
        scheduledFor: null
      })
    };
    rules = {
      getRule: jest.fn(async (event: MessagingEvent) => byEvent[event] ?? rule(event))
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingScheduler,
        { provide: PrismaService, useValue: prisma },
        { provide: MessagingDispatchService, useValue: dispatch },
        { provide: MessagingRuleService, useValue: rules }
      ]
    }).compile();

    scheduler = module.get(MessagingScheduler);
    return scheduler;
  };

  const dispatchedEvents = () =>
    dispatch.dispatch.mock.calls.map(([arg]) => arg.event);

  afterEach(() => jest.clearAllMocks());

  it("sweeps the student and coach reminders on their own lead times", async () => {
    await setup({
      CLASS_REMINDER: rule("CLASS_REMINDER", { leadTimeMinutes: 30 }),
      CLASS_REMINDER_COACH: rule("CLASS_REMINDER_COACH", { leadTimeMinutes: 60 })
    });
    const before = Date.now();

    await scheduler.classReminders();

    expect(dispatchedEvents()).toEqual(["CLASS_REMINDER", "CLASS_REMINDER_COACH"]);

    // Each sweep looks at a different slice of the calendar.
    const [studentQuery, coachQuery] = prisma.coachClass.findMany.mock.calls.map(
      ([arg]) => arg.where.startsAt
    );
    expect(studentQuery.gte.getTime() - before).toBeGreaterThanOrEqual(30 * MINUTE - 50);
    expect(coachQuery.gte.getTime() - before).toBeGreaterThanOrEqual(60 * MINUTE - 50);
    expect(coachQuery.gte.getTime()).toBeGreaterThan(studentQuery.gte.getTime());
  });

  it("skips a reminder whose rule is switched off, without touching the other", async () => {
    await setup({
      CLASS_REMINDER: rule("CLASS_REMINDER"),
      CLASS_REMINDER_COACH: rule("CLASS_REMINDER_COACH", { enabled: false })
    });

    await scheduler.classReminders();

    expect(dispatchedEvents()).toEqual(["CLASS_REMINDER"]);
    expect(prisma.coachClass.findMany).toHaveBeenCalledTimes(1);
  });

  it("does nothing when another instance holds the lock", async () => {
    await setup({});
    prisma.$queryRaw.mockResolvedValue([{ locked: false }]);

    await scheduler.classReminders();

    expect(prisma.coachClass.findMany).not.toHaveBeenCalled();
    expect(dispatch.dispatch).not.toHaveBeenCalled();
  });

  it("queues due-soon reminders for the assignments inside the window", async () => {
    await setup({
      ASSIGNMENT_DUE_SOON: rule("ASSIGNMENT_DUE_SOON", { leadTimeMinutes: 24 * 60 })
    });
    prisma.studentAssignment.findMany.mockResolvedValue([{ id: "sa_1" }, { id: "sa_2" }]);

    await scheduler.assignmentDueReminders();

    expect(dispatch.dispatch).toHaveBeenCalledWith({
      event: "ASSIGNMENT_DUE_SOON",
      studentAssignmentIds: ["sa_1", "sa_2"]
    });
  });

  it("does not dispatch when nothing is due", async () => {
    await setup({});

    await scheduler.assignmentDueReminders();

    expect(dispatch.dispatch).not.toHaveBeenCalled();
  });
});

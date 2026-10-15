import { Test, type TestingModule } from "@nestjs/testing";
import type { MessagingEvent } from "@nexa-chess/types";
import { JobLockService } from "../prisma/job-lock.service";
import { createJobLockStub } from "../prisma/job-lock.testing";
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
    assignmentBatch: { findMany: jest.Mock };
    coachClass: { findMany: jest.Mock };
    studentAssignment: { findMany: jest.Mock };
  };
  let dispatch: { dispatch: jest.Mock };
  let jobLocks: ReturnType<typeof createJobLockStub>;
  let rules: Record<string, jest.Mock>;

  const setup = async (byEvent: Record<string, ReturnType<typeof rule>>) => {
    prisma = {
      assignmentBatch: { findMany: jest.fn().mockResolvedValue([]) },
      coachClass: { findMany: jest.fn().mockResolvedValue([{ id: "class_1" }]) },
      studentAssignment: { findMany: jest.fn().mockResolvedValue([]) }
    };
    jobLocks = createJobLockStub();
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
        { provide: JobLockService, useValue: jobLocks },
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
    jobLocks.runExclusive.mockResolvedValueOnce({ acquired: false });

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

  it("tells the coach once per deployment that went overdue with work outstanding", async () => {
    await setup({ ASSIGNMENT_DUE_SOON: rule("ASSIGNMENT_DUE_SOON", { enabled: false }) });
    prisma.assignmentBatch.findMany.mockResolvedValue([{ id: "dep_1" }, { id: "dep_2" }]);
    const before = Date.now();

    await scheduler.assignmentDueReminders();

    expect(dispatch.dispatch.mock.calls.map(([arg]) => arg)).toEqual([
      { assignmentBatchId: "dep_1", event: "ASSIGNMENT_OVERDUE_COACH" },
      { assignmentBatchId: "dep_2", event: "ASSIGNMENT_OVERDUE_COACH" }
    ]);
    // Only due dates that already passed, within the bounded lookback.
    const [{ where }] = prisma.assignmentBatch.findMany.mock.calls[0];
    expect(where.dueDate.lte.getTime()).toBeGreaterThanOrEqual(before);
    expect(before - where.dueDate.gt.getTime()).toBeGreaterThanOrEqual(48 * 60 * MINUTE - 50);
    expect(where.students).toEqual({ some: { status: { in: ["PENDING", "IN_PROGRESS"] } } });
  });

  it("skips the overdue sweep when its rule is off", async () => {
    await setup({ ASSIGNMENT_OVERDUE_COACH: rule("ASSIGNMENT_OVERDUE_COACH", { enabled: false }) });
    prisma.assignmentBatch.findMany.mockResolvedValue([{ id: "dep_1" }]);

    await scheduler.assignmentDueReminders();

    expect(prisma.assignmentBatch.findMany).not.toHaveBeenCalled();
    expect(dispatch.dispatch).not.toHaveBeenCalled();
  });
});

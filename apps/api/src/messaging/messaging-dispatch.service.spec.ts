import { Test, type TestingModule } from "@nestjs/testing";
import {
  DEFAULT_MESSAGING_RULES,
  describeSchedule,
  findUnknownTemplateVariables,
  renderMessageTemplate,
  type MessagingEvent
} from "@nexa-chess/types";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { MessagingDispatchService } from "./messaging-dispatch.service";
import { MessagingRuleService } from "./messaging-rule.service";

const CLASS_ID = "class_1";

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: "rule_1",
    event: "CLASS_SCHEDULED" as MessagingEvent,
    enabled: true,
    whatsappEnabled: true,
    inAppEnabled: false,
    audience: "STUDENTS",
    leadTimeMinutes: null,
    scheduleMode: "IMMEDIATE",
    scheduleHour: null,
    scheduleMinute: null,
    scheduleDayOfWeek: null,
    weekdaysOnly: false,
    title: "New class",
    body: "Hi {{recipient.firstName}}, {{class.title}} on {{class.dateTime}}.",
    whatsappTemplateName: null,
    whatsappTemplateLanguage: null,
    whatsappTemplateParams: [],
    updatedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

function makeStudent(overrides: Record<string, unknown> = {}) {
  return {
    id: "student_1",
    firstName: "Asha",
    lastName: "Menon",
    phoneNumber: "+919876543210",
    role: "STUDENT",
    status: "ACTIVE",
    isDeleted: false,
    timezone: "Asia/Kolkata",
    ...overrides
  };
}

/** The `data` of every queued outbox row, in order. */
function queuedRows(create: jest.Mock) {
  return create.mock.calls.map(([arg]) => arg.data);
}

describe("MessagingDispatchService", () => {
  let service: MessagingDispatchService;
  let prisma: {
    coachClass: { findUnique: jest.Mock };
    messageDelivery: { create: jest.Mock };
  };
  let whatsapp: { normalizeRecipient: jest.Mock };
  let getRule: jest.Mock;

  const setup = async (rule = makeRule(), student = makeStudent()) => {
    getRule = jest.fn().mockResolvedValue(rule);
    prisma = {
      coachClass: {
        findUnique: jest.fn().mockResolvedValue({
          id: CLASS_ID,
          title: "Rook Endgames",
          topic: null,
          startsAt: new Date("2026-09-14T12:30:00.000Z"),
          coach: {
            id: "coach_1",
            firstName: "Ravi",
            lastName: null,
            phoneNumber: "+919000000000",
            role: "COACH",
            status: "ACTIVE",
            isDeleted: false,
            timezone: "Asia/Kolkata"
          },
          batch: { name: "Intermediate B", students: [{ student }] }
        })
      },
      messageDelivery: { create: jest.fn().mockResolvedValue({}) }
    };
    whatsapp = {
      normalizeRecipient: jest.fn((raw: string | null) =>
        raw ? raw.replace(/\D/g, "") : null
      )
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingDispatchService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppService, useValue: whatsapp },
        {
          provide: MessagingRuleService,
          useValue: { getRule, usesLeadTime: () => false }
        }
      ]
    }).compile();

    service = module.get(MessagingDispatchService);
    return service;
  };

  afterEach(() => jest.clearAllMocks());

  it("queues nothing while the rule is disabled", async () => {
    await setup(makeRule({ enabled: false }));

    const summary = await service.dispatch({
      event: "CLASS_SCHEDULED",
      classId: CLASS_ID
    });

    expect(summary.ruleEnabled).toBe(false);
    expect(prisma.messageDelivery.create).not.toHaveBeenCalled();
    expect(prisma.coachClass.findUnique).not.toHaveBeenCalled();
  });

  it("queues nothing when both channels are off", async () => {
    await setup(makeRule({ whatsappEnabled: false, inAppEnabled: false }));

    const summary = await service.dispatch({
      event: "CLASS_SCHEDULED",
      classId: CLASS_ID
    });

    expect(summary.ruleEnabled).toBe(false);
    expect(prisma.messageDelivery.create).not.toHaveBeenCalled();
  });

  it("queues a pending row rendered with the recipient's own values", async () => {
    await setup();

    const summary = await service.dispatch({
      event: "CLASS_SCHEDULED",
      classId: CLASS_ID
    });

    expect(summary).toMatchObject({
      recipients: 1,
      queuedWhatsApp: 1,
      scheduledFor: null
    });

    const [row] = queuedRows(prisma.messageDelivery.create);
    expect(row).toMatchObject({
      status: "PENDING",
      channel: "WHATSAPP",
      recipientPhone: "919876543210",
      dedupeKey: `CLASS_SCHEDULED:${CLASS_ID}:student_1`
    });
    expect(row.body).toContain("Hi Asha");
    expect(row.body).toContain("Rook Endgames");
    // 12:30 UTC is 6:00 pm in the student's saved zone, not the server's.
    expect(row.body).toContain("6:00 pm");
  });

  it("holds a scheduled rule until its next send time", async () => {
    await setup(
      makeRule({ scheduleMode: "DAILY", scheduleHour: 9, scheduleMinute: 0 })
    );

    const summary = await service.dispatch({
      event: "CLASS_SCHEDULED",
      classId: CLASS_ID
    });

    const [row] = queuedRows(prisma.messageDelivery.create);
    expect(row.scheduledFor.getTime()).toBeGreaterThan(Date.now());
    expect(summary.scheduledFor).toBe(row.scheduledFor.toISOString());
  });

  it("records a skip rather than guessing when a student has no phone", async () => {
    await setup(makeRule(), makeStudent({ phoneNumber: null }));

    const summary = await service.dispatch({
      event: "CLASS_SCHEDULED",
      classId: CLASS_ID
    });

    expect(summary).toMatchObject({ missingPhone: 1, queuedWhatsApp: 0 });
    expect(queuedRows(prisma.messageDelivery.create)[0]).toMatchObject({
      status: "SKIPPED",
      error: "No phone number on file."
    });
  });

  it("treats a duplicate dedupe key as already queued, not an error", async () => {
    await setup();
    prisma.messageDelivery.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "6"
      })
    );

    const summary = await service.dispatch({
      event: "CLASS_SCHEDULED",
      classId: CLASS_ID
    });

    expect(summary.queuedWhatsApp).toBe(0);
  });

  it("stores rendered template values when the rule names a template", async () => {
    await setup(
      makeRule({
        whatsappTemplateName: "class_reminder",
        whatsappTemplateLanguage: "en",
        whatsappTemplateParams: ["{{recipient.firstName}}", "{{class.title}}"]
      })
    );

    await service.dispatch({ event: "CLASS_SCHEDULED", classId: CLASS_ID });

    expect(queuedRows(prisma.messageDelivery.create)[0]).toMatchObject({
      templateName: "class_reminder",
      templateLanguage: "en",
      templateParams: ["Asha", "Rook Endgames"]
    });
  });

  it("addresses the coach instead of the batch when the audience says so", async () => {
    await setup(makeRule({ audience: "COACHES" }));

    const summary = await service.dispatch({
      event: "CLASS_SCHEDULED",
      classId: CLASS_ID
    });

    expect(summary.recipients).toBe(1);
    expect(queuedRows(prisma.messageDelivery.create)[0].recipientPhone).toBe(
      "919000000000"
    );
  });

  it("queues the in-app notification with its heading and deep link", async () => {
    await setup(makeRule({ whatsappEnabled: false, inAppEnabled: true }));

    const summary = await service.dispatch({
      event: "CLASS_SCHEDULED",
      classId: CLASS_ID
    });

    expect(summary.queuedInApp).toBe(1);
    expect(queuedRows(prisma.messageDelivery.create)[0]).toMatchObject({
      channel: "IN_APP",
      status: "PENDING",
      title: "New class",
      linkPath: "/student/classes",
      recipientId: "student_1"
    });
  });

  it("never lets a dispatch failure reach the calling feature", async () => {
    await setup();
    getRule.mockRejectedValue(new Error("database is down"));

    expect(() =>
      service.dispatchInBackground({ event: "CLASS_SCHEDULED", classId: CLASS_ID })
    ).not.toThrow();
  });
});

describe("messaging templates", () => {
  it("substitutes known placeholders and empties unknown ones", () => {
    expect(
      renderMessageTemplate("Hi {{recipient.firstName}} / {{nope}}", {
        "recipient.firstName": "Asha"
      })
    ).toBe("Hi Asha / ");
  });

  it("flags placeholders an event cannot bind", () => {
    expect(
      findUnknownTemplateVariables(
        "CLASS_SCHEDULED",
        "{{class.title}} {{assignment.title}}"
      )
    ).toEqual(["assignment.title"]);
  });

  it("ships the two absorbed in-app reminders enabled and the rest off", () => {
    expect(DEFAULT_MESSAGING_RULES.ASSIGNMENT_DUE_SOON).toMatchObject({
      enabled: true,
      inAppEnabled: true,
      whatsappEnabled: false
    });
    expect(DEFAULT_MESSAGING_RULES.ASSIGNMENT_GRADED.enabled).toBe(true);
    expect(DEFAULT_MESSAGING_RULES.CLASS_SCHEDULED.enabled).toBe(false);
    expect(DEFAULT_MESSAGING_RULES.ANNOUNCEMENT.enabled).toBe(false);
  });

  it("describes timing in the words the rules list uses", () => {
    const base = {
      scheduleHour: 9,
      scheduleMinute: 0,
      scheduleDayOfWeek: 1,
      weekdaysOnly: false,
      leadTimeMinutes: null
    };

    expect(
      describeSchedule({ ...base, event: "CLASS_SCHEDULED", scheduleMode: "IMMEDIATE" })
    ).toBe("Immediately");
    expect(
      describeSchedule({ ...base, event: "CLASS_SCHEDULED", scheduleMode: "DAILY" })
    ).toBe("Daily at 9:00 am");
    expect(
      describeSchedule({
        ...base,
        event: "CLASS_SCHEDULED",
        scheduleMode: "DAILY",
        weekdaysOnly: true
      })
    ).toBe("Weekdays at 9:00 am");
    expect(
      describeSchedule({ ...base, event: "CLASS_SCHEDULED", scheduleMode: "WEEKLY" })
    ).toBe("Mondays at 9:00 am");
    // A lead-time event ignores the schedule entirely.
    expect(
      describeSchedule({
        ...base,
        event: "CLASS_REMINDER",
        scheduleMode: "DAILY",
        leadTimeMinutes: 30
      })
    ).toBe("30 min before");
  });
});

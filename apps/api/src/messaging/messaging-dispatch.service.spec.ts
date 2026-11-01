import { Test, type TestingModule } from "@nestjs/testing";
import {
  DEFAULT_MESSAGING_RULES,
  describeSchedule,
  findUnknownSystemMessageVariables,
  findUnknownTemplateVariables,
  MESSAGE_VARIABLE_DOCS,
  MESSAGING_EVENT_DEFINITIONS,
  renderMessageTemplate,
  SYSTEM_MESSAGE_DEFINITIONS,
  SYSTEM_MESSAGE_KEYS,
  type MessagingEvent
} from "@nexa-chess/types";
import { Prisma } from "@prisma/client";
import { EmailVerificationService } from "../email-admin/email-verification.service";
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
    isEmailVerified: true,
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

describe("message catalogues", () => {
  const eventVariables = Object.values(MESSAGING_EVENT_DEFINITIONS).flatMap((d) => d.variables);
  const systemVariables = Object.values(SYSTEM_MESSAGE_DEFINITIONS).flatMap((d) => d.variables);

  it("documents every placeholder an admin can pick", () => {
    const undocumented = [...eventVariables, ...systemVariables].filter(
      (name) => !MESSAGE_VARIABLE_DOCS[name]
    );
    expect(undocumented).toEqual([]);
  });

  it("only uses placeholders each system message can fill", () => {
    for (const key of SYSTEM_MESSAGE_KEYS) {
      const { defaults } = SYSTEM_MESSAGE_DEFINITIONS[key];
      expect(findUnknownSystemMessageVariables(key, `${defaults.subject ?? ""} ${defaults.body}`)).toEqual([]);
    }
  });
});

describe("MessagingDispatchService", () => {
  let service: MessagingDispatchService;
  let prisma: {
    coachClass: { findUnique: jest.Mock };
    messageDelivery: { create: jest.Mock };
  };
  let whatsapp: { normalizeRecipient: jest.Mock };
  let getRule: jest.Mock;
  let verificationPolicy: jest.Mock;

  const setup = async (rule = makeRule(), student = makeStudent()) => {
    getRule = jest.fn().mockResolvedValue(rule);
    verificationPolicy = jest.fn().mockResolvedValue("OFF");
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
        { provide: EmailVerificationService, useValue: { policy: verificationPolicy } },
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

  it("REVISION_DUE only queues students near their own send time, once per send day", async () => {
    const hour = new Date().getUTCHours();
    await setup(
      makeRule({
        event: "REVISION_DUE",
        whatsappEnabled: false,
        inAppEnabled: true,
        scheduleMode: "DAILY",
        scheduleHour: (hour + 1) % 24,
        scheduleMinute: 0,
        body: "Revise: {{links.revision}}"
      })
    );
    Object.assign(prisma, {
      user: {
        findMany: jest.fn().mockResolvedValue([
          makeStudent({ id: "near", timezone: "UTC" }),
          makeStudent({ id: "far", timezone: "Asia/Tokyo" })
        ])
      }
    });

    await service.dispatch({ event: "REVISION_DUE", studentIds: ["near", "far"] });

    const rows = queuedRows(prisma.messageDelivery.create);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ recipientId: "near", linkPath: "/student/revision" });
    expect(rows[0].dedupeKey).toMatch(/^REVISION_DUE:near:\d+-\d+-\d+$/);
    expect(rows[0].body).toContain("/student/revision");
  });

  describe("ASSIGNMENT_OVERDUE_COACH", () => {
    const coach = (id: string, overrides: Record<string, unknown> = {}) => ({
      id,
      firstName: id,
      lastName: null,
      phoneNumber: null,
      role: "COACH",
      status: "ACTIVE",
      isDeleted: false,
      timezone: "Asia/Kolkata",
      ...overrides
    });
    const deployment = (overrides: Record<string, unknown> = {}) => ({
      id: "dep_1",
      dueDate: new Date("2026-10-14T18:29:00.000Z"),
      assignment: { title: "Knight forks" },
      assignedBy: coach("coach_a"),
      batch: {
        name: "Intermediate B",
        coaches: [{ coach: coach("coach_a") }, { coach: coach("coach_b") }]
      },
      students: [{ status: "COMPLETED" }, { status: "PENDING" }, { status: "IN_PROGRESS" }],
      ...overrides
    });
    const overdueRule = makeRule({
      audience: "COACHES",
      body: "{{assignment.overdueCount}} of {{assignment.studentCount}} unfinished",
      event: "ASSIGNMENT_OVERDUE_COACH",
      inAppEnabled: true,
      whatsappEnabled: false
    });
    const withDeployment = async (row: ReturnType<typeof deployment> | null) => {
      await setup(overdueRule);
      (prisma as unknown as { assignmentBatch: { findUnique: jest.Mock } }).assignmentBatch = {
        findUnique: jest.fn().mockResolvedValue(row)
      };
    };

    it("tells only the coach who deployed it, with the unfinished count", async () => {
      await withDeployment(deployment());

      await service.dispatch({ event: "ASSIGNMENT_OVERDUE_COACH", assignmentBatchId: "dep_1" });

      const rows = queuedRows(prisma.messageDelivery.create);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        body: "2 of 3 unfinished",
        dedupeKey: "ASSIGNMENT_OVERDUE_COACH:dep_1:2026-10-14T18:29:00.000Z:coach_a",
        recipientId: "coach_a"
      });
    });

    it("falls back to the batch's coaches when the deployer no longer coaches it", async () => {
      await withDeployment(deployment({ assignedBy: coach("coach_gone") }));

      await service.dispatch({ event: "ASSIGNMENT_OVERDUE_COACH", assignmentBatchId: "dep_1" });

      expect(queuedRows(prisma.messageDelivery.create).map((r) => r.recipientId)).toEqual([
        "coach_a",
        "coach_b"
      ]);
    });

    it("sends nothing once every student has finished", async () => {
      await withDeployment(deployment({ students: [{ status: "COMPLETED" }] }));

      const summary = await service.dispatch({
        event: "ASSIGNMENT_OVERDUE_COACH",
        assignmentBatchId: "dep_1"
      });

      expect(summary.recipients).toBe(0);
      expect(prisma.messageDelivery.create).not.toHaveBeenCalled();
    });
  });

  it("never lets a dispatch failure reach the calling feature", async () => {
    await setup();
    getRule.mockRejectedValue(new Error("database is down"));

    expect(() =>
      service.dispatchInBackground({ event: "CLASS_SCHEDULED", classId: CLASS_ID })
    ).not.toThrow();
  });

  describe("email channel", () => {
    const emailRule = () => makeRule({ whatsappEnabled: false, emailEnabled: true });

    it("queues an email with the rendered subject and body, and no address on the row", async () => {
      await setup(emailRule());

      const summary = await service.dispatch({ event: "CLASS_SCHEDULED", classId: CLASS_ID });

      expect(summary).toMatchObject({ queuedEmail: 1, queuedWhatsApp: 0, queuedInApp: 0 });
      const [row] = queuedRows(prisma.messageDelivery.create);
      expect(row).toMatchObject({
        channel: "EMAIL",
        recipientId: "student_1",
        recipientPhone: null,
        status: "PENDING",
        title: "New class"
      });
      expect(row.body).toContain("Hi Asha");
      expect(verificationPolicy).toHaveBeenCalledTimes(1);
    });

    it("stays off unless the rule turns it on", async () => {
      await setup(makeRule());

      const summary = await service.dispatch({ event: "CLASS_SCHEDULED", classId: CLASS_ID });

      expect(summary.queuedEmail).toBe(0);
      expect(queuedRows(prisma.messageDelivery.create).map((row) => row.channel)).toEqual(["WHATSAPP"]);
      expect(verificationPolicy).not.toHaveBeenCalled();
    });

    it("sends to an unverified address while verification is off", async () => {
      await setup(emailRule(), makeStudent({ isEmailVerified: false }));

      const summary = await service.dispatch({ event: "CLASS_SCHEDULED", classId: CLASS_ID });

      expect(summary).toMatchObject({ queuedEmail: 1, unverifiedEmail: 0 });
    });

    it("logs a skip for an unverified address once the academy asks for verification", async () => {
      await setup(emailRule(), makeStudent({ isEmailVerified: false }));
      verificationPolicy.mockResolvedValue("OPTIONAL");

      const summary = await service.dispatch({ event: "CLASS_SCHEDULED", classId: CLASS_ID });

      expect(summary).toMatchObject({ queuedEmail: 0, unverifiedEmail: 1 });
      expect(queuedRows(prisma.messageDelivery.create)[0]).toMatchObject({
        channel: "EMAIL",
        status: "SKIPPED",
        error: "Email address is not verified."
      });
    });
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

  it("ships revision reminders off, at a daily hour rather than at midnight", () => {
    expect(DEFAULT_MESSAGING_RULES.REVISION_DUE).toMatchObject({
      enabled: false,
      scheduleHour: 17,
      scheduleMode: "DAILY",
      whatsappEnabled: false
    });
  });

  it("ships the two absorbed in-app reminders enabled and the rest off", () => {
    expect(DEFAULT_MESSAGING_RULES.ASSIGNMENT_DUE_SOON).toMatchObject({
      enabled: true,
      inAppEnabled: true,
      whatsappEnabled: false
    });
    expect(DEFAULT_MESSAGING_RULES.ASSIGNMENT_GRADED.enabled).toBe(true);
    expect(DEFAULT_MESSAGING_RULES.ASSIGNMENT_OVERDUE_COACH).toMatchObject({
      enabled: true,
      inAppEnabled: true,
      whatsappEnabled: false
    });
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

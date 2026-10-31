import { Test, type TestingModule } from "@nestjs/testing";
import type { MessageDelivery } from "@prisma/client";
import { NotificationService } from "../notification/notification.service";
import { PrismaService } from "../prisma/prisma.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { MessagingDeliveryWorker } from "./messaging-delivery.worker";
import { computeScheduledFor, nextAttemptAt, zonedTimeToUtc } from "./messaging.schedule";

function makeDelivery(overrides: Partial<MessageDelivery> = {}): MessageDelivery {
  return {
    id: "delivery_1",
    event: "CLASS_SCHEDULED",
    channel: "WHATSAPP",
    status: "PENDING",
    recipientId: "student_1",
    recipientPhone: "919876543210",
    body: "Class at 6pm",
    title: "New class",
    linkPath: "/student/classes",
    templateName: null,
    templateLanguage: null,
    templateParams: [],
    documentMediaId: null,
    documentLink: null,
    documentFilename: null,
    scheduledFor: new Date(),
    attempts: 0,
    lastAttemptAt: null,
    claimedAt: null,
    sentAt: null,
    providerMessageId: null,
    error: null,
    dedupeKey: "CLASS_SCHEDULED:class_1:student_1",
    createdAt: new Date(),
    ...overrides
  } as MessageDelivery;
}

describe("MessagingDeliveryWorker", () => {
  let worker: MessagingDeliveryWorker;
  let prisma: { $queryRaw: jest.Mock; messageDelivery: { update: jest.Mock } };
  let whatsapp: {
    isConfigured: jest.Mock;
    trySendText: jest.Mock;
    trySendTemplate: jest.Mock;
    trySendDocument: jest.Mock;
  };
  let notifications: { notify: jest.Mock };

  const setup = async (due: MessageDelivery[]) => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue(due),
      messageDelivery: { update: jest.fn().mockResolvedValue({}) }
    };
    whatsapp = {
      isConfigured: jest.fn().mockReturnValue(true),
      trySendText: jest
        .fn()
        .mockResolvedValue({ ok: true, result: { messageId: "wamid.1" } }),
      trySendTemplate: jest
        .fn()
        .mockResolvedValue({ ok: true, result: { messageId: "wamid.2" } }),
      trySendDocument: jest
        .fn()
        .mockResolvedValue({ ok: true, result: { messageId: "wamid.3" } })
    };
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingDeliveryWorker,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppService, useValue: whatsapp },
        { provide: NotificationService, useValue: notifications }
      ]
    }).compile();

    worker = module.get(MessagingDeliveryWorker);
    return worker;
  };

  const lastUpdate = () => prisma.messageDelivery.update.mock.calls.at(-1)?.[0].data;

  afterEach(() => jest.clearAllMocks());

  it("sends a due WhatsApp message and marks it sent", async () => {
    await setup([makeDelivery()]);

    await worker.sweep();

    expect(whatsapp.trySendText).toHaveBeenCalledWith({
      to: "919876543210",
      body: "Class at 6pm"
    });
    expect(lastUpdate()).toMatchObject({
      status: "SENT",
      attempts: 1,
      providerMessageId: "wamid.1",
      claimedAt: null
    });
  });

  it("sends a template message when the row carries one", async () => {
    await setup([
      makeDelivery({
        templateName: "class_reminder",
        templateLanguage: "en",
        templateParams: ["Asha", "6:00 pm"]
      })
    ]);

    await worker.sweep();

    expect(whatsapp.trySendText).not.toHaveBeenCalled();
    expect(whatsapp.trySendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "class_reminder", bodyParams: ["Asha", "6:00 pm"] })
    );
  });

  it("sends an attached invoice PDF as a document, captioned with the body", async () => {
    await setup([
      makeDelivery({
        event: "INVOICE_ISSUED",
        body: "Here is your invoice NEXA-INV-2026-000001 for Rs 6,488.82.",
        documentMediaId: "media_abc123",
        documentFilename: "NEXA-INV-2026-000001.pdf"
      })
    ]);

    await worker.sweep();

    // A parent gets the receipt in the chat, not a link to chase.
    expect(whatsapp.trySendText).not.toHaveBeenCalled();
    expect(whatsapp.trySendDocument).toHaveBeenCalledWith({
      to: "919876543210",
      mediaId: "media_abc123",
      link: undefined,
      filename: "NEXA-INV-2026-000001.pdf",
      caption: "Here is your invoice NEXA-INV-2026-000001 for Rs 6,488.82."
    });
    expect(lastUpdate()).toMatchObject({ status: "SENT" });
  });

  it("attaches the document to a template header when the rule names one", async () => {
    await setup([
      makeDelivery({
        event: "INVOICE_ISSUED",
        templateName: "invoice_issued",
        templateParams: ["Priya", "NEXA-INV-2026-000001"],
        documentMediaId: "media_abc123",
        documentFilename: "NEXA-INV-2026-000001.pdf"
      })
    ]);

    await worker.sweep();

    expect(whatsapp.trySendDocument).not.toHaveBeenCalled();
    expect(whatsapp.trySendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "invoice_issued",
        headerDocument: {
          mediaId: "media_abc123",
          link: undefined,
          filename: "NEXA-INV-2026-000001.pdf"
        }
      })
    );
  });

  it("falls back to a plain text message when there is no attachment", async () => {
    await setup([makeDelivery({ event: "INVOICE_ISSUED" })]);

    await worker.sweep();

    expect(whatsapp.trySendDocument).not.toHaveBeenCalled();
    expect(whatsapp.trySendText).toHaveBeenCalled();
  });

  it("keeps a retryable failure pending, with backoff", async () => {
    await setup([makeDelivery()]);
    whatsapp.trySendText.mockResolvedValue({
      ok: false,
      error: { message: "rate limited", status: 429, retryable: true }
    });

    await worker.sweep();

    const data = lastUpdate();
    expect(data).toMatchObject({ status: "PENDING", attempts: 1, error: "rate limited" });
    expect(data.scheduledFor.getTime()).toBeGreaterThan(Date.now());
  });

  it("gives up immediately on a failure that would never succeed", async () => {
    await setup([makeDelivery()]);
    whatsapp.trySendText.mockResolvedValue({
      ok: false,
      error: { message: "bad number", status: 400, retryable: false }
    });

    await worker.sweep();

    expect(lastUpdate()).toMatchObject({ status: "FAILED", error: "bad number" });
  });

  it("stops retrying at the attempt cap", async () => {
    await setup([makeDelivery({ attempts: 4 })]);
    whatsapp.trySendText.mockResolvedValue({
      ok: false,
      error: { message: "still rate limited", status: 429, retryable: true }
    });

    await worker.sweep();

    expect(lastUpdate()).toMatchObject({ status: "FAILED", attempts: 5 });
  });

  it("raises an in-app notification for an IN_APP row", async () => {
    await setup([makeDelivery({ channel: "IN_APP", recipientPhone: null })]);

    await worker.sweep();

    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "student_1",
        type: "CLASS_SCHEDULED",
        title: "New class",
        linkPath: "/student/classes"
      })
    );
    expect(lastUpdate()).toMatchObject({ status: "SENT" });
  });

  it("fails a WhatsApp row outright when the provider is not configured", async () => {
    await setup([makeDelivery()]);
    whatsapp.isConfigured.mockReturnValue(false);

    await worker.sweep();

    expect(whatsapp.trySendText).not.toHaveBeenCalled();
    expect(lastUpdate()).toMatchObject({
      status: "FAILED",
      error: "WhatsApp is not configured on this server."
    });
  });

  it("does nothing when nothing is due", async () => {
    await setup([]);

    await worker.sweep();

    expect(prisma.messageDelivery.update).not.toHaveBeenCalled();
  });

  it("binds the claim cutoffs as naive timestamps, never a Date", async () => {
    await setup([]);

    await worker.sweep();

    // A bound Date would arrive as timestamptz and be shifted by the session
    // zone on any non-UTC box (AGENTS.md, Date & Time Rule).
    const params = prisma.$queryRaw.mock.calls[0].slice(1);
    for (const param of params) {
      expect(param).not.toBeInstanceOf(Date);
    }
    // now (claim stamp), now (due cutoff), stale-claim cutoff — all ISO strings.
    expect(params.filter((p: unknown) => typeof p === "string")).toHaveLength(3);
  });
});

describe("messaging schedule math", () => {
  it("resolves a wall-clock time in the recipient's zone", () => {
    // 09:00 in Asia/Kolkata (UTC+5:30) is 03:30 UTC.
    expect(zonedTimeToUtc("Asia/Kolkata", 2026, 9, 14, 9, 0).toISOString()).toBe(
      "2026-09-14T03:30:00.000Z"
    );
  });

  it("sends immediately when the rule is IMMEDIATE", () => {
    const now = new Date("2026-09-14T10:00:00.000Z");
    const rule = {
      scheduleMode: "IMMEDIATE" as const,
      scheduleHour: 9,
      scheduleMinute: 0,
      scheduleDayOfWeek: null,
      weekdaysOnly: false
    };

    expect(computeScheduledFor(rule, "Asia/Kolkata", now)).toBe(now);
  });

  it("holds a daily rule for the next occurrence of that local time", () => {
    // 10:00 UTC is 15:30 in Kolkata, so today's 09:00 has passed.
    const now = new Date("2026-09-14T10:00:00.000Z");
    const due = computeScheduledFor(
      {
        scheduleMode: "DAILY",
        scheduleHour: 9,
        scheduleMinute: 0,
        scheduleDayOfWeek: null,
        weekdaysOnly: false
      },
      "Asia/Kolkata",
      now
    );

    expect(due.toISOString()).toBe("2026-09-15T03:30:00.000Z");
  });

  it("rolls a weekend send forward when weekdays-only is set", () => {
    // Saturday 2026-09-19, after 09:00 local.
    const now = new Date("2026-09-19T10:00:00.000Z");
    const due = computeScheduledFor(
      {
        scheduleMode: "DAILY",
        scheduleHour: 9,
        scheduleMinute: 0,
        scheduleDayOfWeek: null,
        weekdaysOnly: true
      },
      "Asia/Kolkata",
      now
    );

    expect(due.toISOString()).toBe("2026-09-21T03:30:00.000Z"); // Monday
  });

  it("waits for the chosen weekday on a weekly rule", () => {
    const now = new Date("2026-09-14T10:00:00.000Z"); // Monday
    const due = computeScheduledFor(
      {
        scheduleMode: "WEEKLY",
        scheduleHour: 8,
        scheduleMinute: 30,
        scheduleDayOfWeek: 3, // Wednesday
        weekdaysOnly: false
      },
      "Asia/Kolkata",
      now
    );

    expect(due.toISOString()).toBe("2026-09-16T03:00:00.000Z");
  });

  it("backs off further with each attempt", () => {
    const now = new Date("2026-09-14T10:00:00.000Z");
    const minutesAfter = (attempt: number) =>
      (nextAttemptAt(attempt, now).getTime() - now.getTime()) / 60_000;

    expect(minutesAfter(1)).toBe(1);
    expect(minutesAfter(2)).toBe(5);
    expect(minutesAfter(3)).toBe(25);
    expect(minutesAfter(9)).toBe(240); // capped
  });
});

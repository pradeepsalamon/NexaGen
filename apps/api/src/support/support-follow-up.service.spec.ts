import { supportSlotTitle } from "./support-demo-slots.service";
import { leadPhoneFromWaId } from "./support-conversation.service";
import { supportNudgeDue, supportReminderDue } from "./support-follow-up.service";
import { toItems } from "./support-saved-replies.service";

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-11-14T12:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("supportReminderDue", () => {
  it("sends the first reminder once the ticket has waited the configured minutes", () => {
    expect(supportReminderDue({ createdAt: ago(14 * 60_000), remindersSent: 0 }, ago(14 * 60_000), now, 15)).toBeNull();
    expect(supportReminderDue({ createdAt: ago(15 * 60_000), remindersSent: 0 }, ago(15 * 60_000), now, 15)).toBe(1);
  });

  it("sends the second only in the last two hours of the reply window", () => {
    const ticket = { createdAt: ago(23 * HOUR), remindersSent: 1 };
    expect(supportReminderDue(ticket, ago(21 * HOUR), now, 15)).toBeNull();
    expect(supportReminderDue(ticket, ago(22.5 * HOUR), now, 15)).toBe(2);
    expect(supportReminderDue(ticket, ago(24.5 * HOUR), now, 15)).toBeNull(); // window closed
    expect(supportReminderDue({ ...ticket, remindersSent: 2 }, ago(22.5 * HOUR), now, 15)).toBeNull();
  });

  it("is off at 0 minutes", () => {
    expect(supportReminderDue({ createdAt: ago(5 * HOUR), remindersSent: 0 }, ago(5 * HOUR), now, 0)).toBeNull();
  });
});

describe("supportNudgeDue", () => {
  const base = { lastInboundAt: ago(20.5 * HOUR), nudgedAt: null, state: "COURSE_MENU", status: "BOT" };

  it("nudges a quiet course enquiry inside the free reply window", () => {
    expect(supportNudgeDue(base, now, 20)).toBe(true);
    expect(supportNudgeDue({ ...base, state: "DEMO_AGE" }, now, 20)).toBe(true);
  });

  it("waits for the quiet hours and never nudges too close to the window closing", () => {
    expect(supportNudgeDue({ ...base, lastInboundAt: ago(19 * HOUR) }, now, 20)).toBe(false);
    expect(supportNudgeDue({ ...base, lastInboundAt: ago(23.8 * HOUR) }, now, 20)).toBe(false);
  });

  it("nudges once, only while the bot has the conversation, only about classes", () => {
    expect(supportNudgeDue({ ...base, nudgedAt: ago(HOUR) }, now, 20)).toBe(false);
    expect(supportNudgeDue({ ...base, status: "WAITING_AGENT" }, now, 20)).toBe(false);
    expect(supportNudgeDue({ ...base, state: "ASK_DETAILS" }, now, 20)).toBe(false);
    expect(supportNudgeDue(base, now, 0)).toBe(false);
  });
});

describe("leadPhoneFromWaId", () => {
  it("stores a home-country number like the website form, others in full", () => {
    expect(leadPhoneFromWaId("919876543210", "91")).toBe("9876543210");
    expect(leadPhoneFromWaId("447700900123", "91")).toBe("447700900123");
    expect(leadPhoneFromWaId("919876543210", undefined)).toBe("919876543210");
  });
});

describe("saved answers toItems", () => {
  const row = (id: string, showInBot: boolean) => ({
    body: "b",
    createdAt: now,
    description: null,
    id,
    keywords: [],
    showInBot,
    sortOrder: 0,
    tenantId: "tenant_nexa",
    title: id,
    updatedAt: now,
    updatedBy: null,
    updatedById: null
  });

  it("marks only the first eight bot answers as in the bot's list", () => {
    const rows = [row("staff-only", false), ...Array.from({ length: 9 }, (_, i) => row(`a${i}`, true))];
    const items = toItems(rows);
    expect(items[0].inBotMenu).toBe(false);
    expect(items.filter((item) => item.inBotMenu).map((item) => item.id)).toEqual(["a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7"]);
  });
});

describe("supportSlotTitle", () => {
  it("fits a WhatsApp list row and uses the schedule's own zone", () => {
    const title = supportSlotTitle(new Date("2026-11-18T11:30:00Z"), "Asia/Kolkata");
    expect(title).toBe("Wed 18 Nov, 5:00 pm");
    expect(title.length).toBeLessThanOrEqual(24);
    expect(supportSlotTitle(new Date("2026-11-18T11:30:00Z"), "Mars/Olympus")).toBe("Wed 18 Nov, 5:00 pm"); // falls back to India
  });
});

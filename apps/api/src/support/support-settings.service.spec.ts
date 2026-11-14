import { DEFAULT_SUPPORT_MENU, supportHoursOpen } from "@nexa-chess/types";
import type { Prisma } from "@prisma/client";
import { resolveSupportSettings, supportAnswersNumber } from "./support-settings.service";

const SERVER = {
  SUPPORT_AGENT_REPLY_TEMPLATE: "agent_reply",
  SUPPORT_AGENT_REPLY_TEMPLATE_LANGUAGE: "en",
  SUPPORT_BOT_ENABLED: true,
  SUPPORT_LEAD_NUDGE_HOURS: 20,
  SUPPORT_STAFF_REMINDER_MINUTES: 15,
  SUPPORT_TEST_NUMBERS_ALLOWLIST: "+91 90000 00001, 9000000002",
  WHATSAPP_DEFAULT_COUNTRY_CODE: "91"
};

const ROW = {
  accountAnswers: false,
  agentReplyTemplate: null,
  agentReplyTemplateLanguage: "en_US",
  botEnabled: false,
  hours: { days: [{ close: "18:00", day: 1, open: "09:00" }], timezone: "Asia/Kolkata" },
  leadNudgeHours: 6,
  menu: DEFAULT_SUPPORT_MENU as unknown as Prisma.JsonValue,
  outOfHoursMessage: "Back at 9.",
  staffReminderMinutes: 30,
  testNumbers: ["447700900123"]
};

describe("resolveSupportSettings", () => {
  it("keeps Nexa's academy on the server's values until its page is saved", () => {
    expect(resolveSupportSettings(null, "tenant_nexa", SERVER)).toEqual({
      accountAnswers: false,
      agentReplyTemplate: "agent_reply",
      agentReplyTemplateLanguage: "en",
      botEnabled: true,
      hours: null,
      leadNudgeHours: 20,
      menu: DEFAULT_SUPPORT_MENU,
      outOfHoursMessage: null,
      source: "SERVER",
      staffReminderMinutes: 15,
      testNumbers: ["919000000001", "919000000002"]
    });
  });

  it("uses a saved row, for Nexa and any other academy alike", () => {
    expect(resolveSupportSettings(ROW, "tenant_nexa", SERVER)).toEqual({ ...ROW, source: "ACADEMY" });
    expect(resolveSupportSettings(ROW, "tenant_rook", SERVER)).toEqual({ ...ROW, source: "ACADEMY" });
  });

  it("never lends the server's switch to another academy: off until it saves its own", () => {
    const settings = resolveSupportSettings(null, "tenant_rook", SERVER);
    expect(settings.botEnabled).toBe(false);
    expect(settings.agentReplyTemplate).toBeNull();
    expect(settings.testNumbers).toEqual([]);
  });

  it("treats an unreadable stored menu as the built-in one", () => {
    const broken = DEFAULT_SUPPORT_MENU.map((item) => (item.category === "OTHER" ? { ...item, enabled: false } : item));
    expect(resolveSupportSettings({ ...ROW, menu: broken as unknown as Prisma.JsonValue }, "tenant_rook", SERVER).menu).toEqual(DEFAULT_SUPPORT_MENU);
    expect(resolveSupportSettings({ ...ROW, menu: null }, "tenant_rook", SERVER).menu).toEqual(DEFAULT_SUPPORT_MENU);
  });

  it("treats unreadable stored hours as 24/7", () => {
    expect(resolveSupportSettings({ ...ROW, hours: { timezone: "Asia/Kolkata" } }, "tenant_rook", SERVER).hours).toBeNull();
  });
});

describe("supportHoursOpen", () => {
  // Monday 2026-11-16 in India (UTC+5:30).
  const hours = { days: [{ close: "18:00", day: 1, open: "09:00" }], timezone: "Asia/Kolkata" };
  const at = (iso: string) => new Date(iso);

  it("is open inside the day's window in the academy's own zone", () => {
    expect(supportHoursOpen(hours, at("2026-11-16T03:30:00Z"))).toBe(true); // 09:00 IST
    expect(supportHoursOpen(hours, at("2026-11-16T12:29:00Z"))).toBe(true); // 17:59 IST
  });

  it("is closed before opening, at closing time, and on days not listed", () => {
    expect(supportHoursOpen(hours, at("2026-11-16T03:29:00Z"))).toBe(false); // 08:59 IST
    expect(supportHoursOpen(hours, at("2026-11-16T12:30:00Z"))).toBe(false); // 18:00 IST
    expect(supportHoursOpen(hours, at("2026-11-17T05:00:00Z"))).toBe(false); // Tuesday
    expect(supportHoursOpen(hours, at("2026-11-15T20:00:00Z"))).toBe(false); // Sunday in UTC, Monday 01:30 IST: the academy's day counts
  });

  it("is always open without hours, and with an unknown zone", () => {
    expect(supportHoursOpen(null, at("2026-11-17T22:00:00Z"))).toBe(true);
    expect(supportHoursOpen({ ...hours, timezone: "Mars/Olympus" }, at("2026-11-17T22:00:00Z"))).toBe(true);
  });
});

describe("supportAnswersNumber", () => {
  it("answers nobody while off, only the test numbers while set, then everyone", () => {
    expect(supportAnswersNumber({ botEnabled: false, testNumbers: [] }, "919000000001")).toBe(false);
    expect(supportAnswersNumber({ botEnabled: true, testNumbers: ["919000000001"] }, "919000000001")).toBe(true);
    expect(supportAnswersNumber({ botEnabled: true, testNumbers: ["919000000001"] }, "919000000003")).toBe(false);
    expect(supportAnswersNumber({ botEnabled: true, testNumbers: [] }, "919000000003")).toBe(true);
  });
});

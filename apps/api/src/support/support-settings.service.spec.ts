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
  agentReplyTemplate: null,
  agentReplyTemplateLanguage: "en_US",
  botEnabled: false,
  leadNudgeHours: 6,
  staffReminderMinutes: 30,
  testNumbers: ["447700900123"]
};

describe("resolveSupportSettings", () => {
  it("keeps Nexa's academy on the server's values until its page is saved", () => {
    expect(resolveSupportSettings(null, "tenant_nexa", SERVER)).toEqual({
      agentReplyTemplate: "agent_reply",
      agentReplyTemplateLanguage: "en",
      botEnabled: true,
      leadNudgeHours: 20,
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
});

describe("supportAnswersNumber", () => {
  it("answers nobody while off, only the test numbers while set, then everyone", () => {
    expect(supportAnswersNumber({ botEnabled: false, testNumbers: [] }, "919000000001")).toBe(false);
    expect(supportAnswersNumber({ botEnabled: true, testNumbers: ["919000000001"] }, "919000000001")).toBe(true);
    expect(supportAnswersNumber({ botEnabled: true, testNumbers: ["919000000001"] }, "919000000003")).toBe(false);
    expect(supportAnswersNumber({ botEnabled: true, testNumbers: [] }, "919000000003")).toBe(true);
  });
});

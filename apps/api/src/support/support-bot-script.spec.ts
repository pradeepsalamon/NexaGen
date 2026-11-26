import {
  DEFAULT_SUPPORT_MENU,
  SUPPORT_TICKET_REFERENCE_PLACEHOLDER,
  supportBotScript,
  supportMenuEntries,
  supportReplyText
} from "@nexa-chess/types";

// The "Bot messages" preview on Support → Settings (packages/types/src/support-bot-script.ts).

const ctx = { academyName: "Rook Academy", answers: [], menu: supportMenuEntries(DEFAULT_SUPPORT_MENU), privacyUrl: "https://rook.test/privacy" };

describe("supportBotScript", () => {
  const sections = supportBotScript(ctx);
  const allText = sections.flatMap((section) => section.steps.flatMap((step) => step.replies.map(supportReplyText))).join("\n");

  it("covers every flow with real replies", () => {
    expect(sections.map((section) => section.id)).toEqual([
      "welcome",
      "demo",
      "slips",
      "form-refund",
      "form-class",
      "form-payment",
      "form-tech",
      "form-other",
      "unknown",
      "commands",
      "resume",
      "later"
    ]);
    for (const section of sections) {
      for (const step of section.steps) expect(step.replies.length).toBeGreaterThan(0);
    }
  });

  it("uses the academy's name and fills in a sample reference", () => {
    expect(allText).toContain("This is the Rook Academy assistant");
    expect(allText).not.toContain(SUPPORT_TICKET_REFERENCE_PLACEHOLDER);
    expect(allText).toContain("NXS-2026-000123");
  });

  it("shows taps by their label, never a button id", () => {
    const taps = sections.flatMap((section) => section.steps.flatMap((step) => (step.sent?.kind === "tap" ? [step.sent.text] : [])));
    expect(taps.length).toBeGreaterThan(0);
    for (const label of taps) expect(label).not.toMatch(/^[a-z]+\.[a-z.]+$/);
  });

  it("follows the academy's own menu: a renamed option, a switched-off one", () => {
    const menu = DEFAULT_SUPPORT_MENU.map((item) =>
      item.category === "TECH" ? { ...item, enabled: false } : item.category === "REFUND" ? { ...item, title: "Money back" } : item
    );
    const own = supportBotScript({ ...ctx, menu: supportMenuEntries(menu) });
    expect(own.find((section) => section.id === "form-refund")?.title).toBe("Money back");
    expect(own.some((section) => section.id === "form-tech")).toBe(false);
  });

  it("shows the academy's out-of-hours message, or the default", () => {
    const later = (message?: string) =>
      supportBotScript(ctx, { outOfHoursMessage: message }).find((section) => section.id === "later")!.steps[1].replies[0].body;
    expect(later("Back at 9 tomorrow.")).toBe("Back at 9 tomorrow.");
    expect(later()).toMatch(/away right now/);
  });
});

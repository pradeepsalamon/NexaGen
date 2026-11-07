import {
  DEFAULT_WHATSAPP_TEMPLATE_LANGUAGE,
  WHATSAPP_TEMPLATE_LIMITS,
  normalizeWhatsAppTemplate,
  parseWhatsAppTemplateParams,
  resolveWhatsAppTemplate,
  whatsappTemplateIssues
} from "@nexa-chess/types";

// The template rules shared by messaging rules and system messages (@nexa-chess/types whatsapp-template.ts).

const VARIABLES = ["academy.name", "guest.name", "links.join"];

describe("WhatsApp templates", () => {
  describe("whatsappTemplateIssues", () => {
    it("accepts no template at all, and a well-formed one", () => {
      expect(whatsappTemplateIssues({ language: null, name: null, params: [] }, VARIABLES)).toEqual([]);
      expect(whatsappTemplateIssues({ name: "  ", params: ["  "] }, VARIABLES)).toEqual([]);
      expect(
        whatsappTemplateIssues(
          { language: "en_US", name: "demo_invite_2", params: ["{{guest.name}}", "{{links.join}}"] },
          VARIABLES
        )
      ).toEqual([]);
      expect(whatsappTemplateIssues({ language: "fil", name: "x" }, VARIABLES)).toEqual([]);
    });

    it("refuses a language or values without a name", () => {
      expect(whatsappTemplateIssues({ language: "en", name: null }, VARIABLES)).toEqual([
        "Add the template's name, or clear its language and values."
      ]);
      expect(whatsappTemplateIssues({ name: "", params: ["{{guest.name}}"] }, VARIABLES)).toHaveLength(1);
    });

    it("refuses a name or language Meta would never accept", () => {
      expect(whatsappTemplateIssues({ name: "Demo Invite" }, VARIABLES)[0]).toMatch(/lower-case letters/);
      expect(whatsappTemplateIssues({ name: "demo-invite" }, VARIABLES)[0]).toMatch(/lower-case letters/);
      expect(whatsappTemplateIssues({ name: "a".repeat(513) }, VARIABLES)[0]).toMatch(/lower-case letters/);
      expect(whatsappTemplateIssues({ language: "english", name: "ok" }, VARIABLES)).toEqual([
        'A language code looks like "en" or "en_US".'
      ]);
      expect(whatsappTemplateIssues({ language: "en_us", name: "ok" }, VARIABLES)).toHaveLength(1);
    });

    it("refuses too many or too long values, and placeholders the message can't fill", () => {
      const many = Array.from({ length: WHATSAPP_TEMPLATE_LIMITS.maxParams + 1 }, (_, i) => `v${i}`);
      expect(whatsappTemplateIssues({ name: "ok", params: many }, VARIABLES)[0]).toMatch(/at most 10 values/);
      expect(whatsappTemplateIssues({ name: "ok", params: ["x".repeat(501)] }, VARIABLES)[0]).toMatch(/500 characters/);
      expect(
        whatsappTemplateIssues({ name: "ok", params: ["{{guest.name}}", "{{payment.amount}} {{payment.amount}}"] }, VARIABLES)
      ).toEqual(["This message can't fill {{payment.amount}} in a template value."]);
    });
  });

  describe("resolveWhatsAppTemplate", () => {
    it("renders each value for the recipient, as plain text, with Meta's default language", () => {
      expect(
        resolveWhatsAppTemplate(
          { language: null, name: " demo_invite ", params: ["{{guest.name}}", " Join: {{links.join}} ", "**{{guest.name}}**"] },
          { "guest.name": "Asha_K", "links.join": "https://nexa.test/demo/1" }
        )
      ).toEqual({
        bodyParams: ["Asha_K", "Join: https://nexa.test/demo/1", "**Asha_K**"],
        language: DEFAULT_WHATSAPP_TEMPLATE_LANGUAGE,
        name: "demo_invite"
      });
    });

    it("is null without a name, so the message goes as free text", () => {
      expect(resolveWhatsAppTemplate(null, {})).toBeNull();
      expect(resolveWhatsAppTemplate({ language: "en", name: "", params: ["x"] }, {})).toBeNull();
    });
  });

  it("parses the editor's one-value-per-line text and normalizes empty fields to null", () => {
    expect(parseWhatsAppTemplateParams(" {{guest.name}} \n\n  \n{{links.join}}\n")).toEqual(["{{guest.name}}", "{{links.join}}"]);
    expect(normalizeWhatsAppTemplate({ language: " ", name: "", params: [" "] })).toEqual({
      language: null,
      name: null,
      params: []
    });
  });
});

import { checkWhatsAppTemplate, findWhatsAppTemplate, whatsappTemplateParamCount } from "@nexa-chess/types";
import { parseTemplatePage } from "./whatsapp-templates.controller";

describe("parseTemplatePage", () => {
  it("reads Meta's rows and the next page, skipping malformed ones", () => {
    const page = parseTemplatePage({
      data: [
        { category: "UTILITY", id: "1", language: "en", name: "support_reply", status: "APPROVED" },
        { language: "en_US", name: "class_reminder" },
        { name: 42 },
        "junk"
      ],
      paging: { next: "https://graph.facebook.com/v21.0/123/message_templates?after=x" }
    });
    const none = { body: null, buttons: [], header: null, paramCount: 0 };
    expect(page.templates).toEqual([
      { ...none, category: "UTILITY", language: "en", name: "support_reply", status: "APPROVED" },
      { ...none, category: "", language: "en_US", name: "class_reminder", status: "UNKNOWN" }
    ]);
    expect(page.next).toContain("after=x");
    expect(parseTemplatePage(null)).toEqual({ next: null, templates: [] });
  });
});

describe("template text and buttons", () => {
  it("reads the body, its slots, the header kind and the buttons", () => {
    const page = parseTemplatePage({
      data: [
        {
          category: "UTILITY",
          components: [
            { format: "IMAGE", type: "HEADER" },
            { text: "Hi {{1}}, {{2}}'s demo is on {{3}}.", type: "BODY" },
            { buttons: [{ text: "Yes, I'll attend", type: "QUICK_REPLY" }, { text: "Reschedule", type: "QUICK_REPLY" }, { type: "URL" }], type: "BUTTONS" }
          ],
          language: "en_US",
          name: "demo_reminder",
          status: "APPROVED"
        }
      ]
    });
    expect(page.templates[0]).toMatchObject({
      body: "Hi {{1}}, {{2}}'s demo is on {{3}}.",
      buttons: [
        { text: "Yes, I'll attend", type: "QUICK_REPLY" },
        { text: "Reschedule", type: "QUICK_REPLY" }
      ],
      header: "IMAGE",
      paramCount: 3
    });
  });

  it("counts slots by the highest number, and finds a template by name and language", () => {
    expect(whatsappTemplateParamCount("{{2}} and {{ 1 }}, again {{2}}")).toBe(2);
    expect(whatsappTemplateParamCount(null)).toBe(0);
    const templates = [{ body: null, buttons: [], category: "UTILITY", header: null, language: "en_US", name: "hello", paramCount: 0, status: "APPROVED" }];
    expect(findWhatsAppTemplate(templates, " hello ", "")).toBe(templates[0]);
    expect(findWhatsAppTemplate(templates, "hello", "ta")).toBeNull();
  });
});

describe("checkWhatsAppTemplate", () => {
  const none = { body: null, buttons: [], header: null, paramCount: 0 };
  const templates = [
    { ...none, category: "UTILITY", language: "en", name: "support_reply", status: "APPROVED" },
    { ...none, category: "UTILITY", language: "en_US", name: "class_reminder", status: "PENDING" }
  ];

  it("finds the exact name and language, defaulting the language like a send does", () => {
    expect(checkWhatsAppTemplate(templates, "support_reply", "en")).toEqual({ category: "UTILITY", kind: "found", status: "APPROVED" });
    expect(checkWhatsAppTemplate(templates, "class_reminder", "")).toMatchObject({ kind: "found", status: "PENDING" });
  });

  it("says when only another language exists, or nothing at all", () => {
    expect(checkWhatsAppTemplate(templates, "support_reply", "en_US")).toEqual({ kind: "other-language", languages: ["en"] });
    expect(checkWhatsAppTemplate(templates, "no_such", "en")).toEqual({ kind: "missing" });
  });
});

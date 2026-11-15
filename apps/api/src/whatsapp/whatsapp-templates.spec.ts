import { checkWhatsAppTemplate } from "@nexa-chess/types";
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
    expect(page.templates).toEqual([
      { category: "UTILITY", language: "en", name: "support_reply", status: "APPROVED" },
      { category: "", language: "en_US", name: "class_reminder", status: "UNKNOWN" }
    ]);
    expect(page.next).toContain("after=x");
    expect(parseTemplatePage(null)).toEqual({ next: null, templates: [] });
  });
});

describe("checkWhatsAppTemplate", () => {
  const templates = [
    { category: "UTILITY", language: "en", name: "support_reply", status: "APPROVED" },
    { category: "UTILITY", language: "en_US", name: "class_reminder", status: "PENDING" }
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

import {
  buildTemplatePayload,
  buildTextPayload,
  describeWhatsAppFailure,
  isRetryableWhatsAppFailure,
  isValidWhatsAppNumber,
  normalizeWhatsAppNumber,
  parseSendFailure,
  parseSendResult
} from "./whatsapp.utils";

describe("whatsapp.utils", () => {
  describe("normalizeWhatsAppNumber", () => {
    it("strips formatting from an international number", () => {
      expect(normalizeWhatsAppNumber("+91 98765-43210")).toBe("919876543210");
      expect(normalizeWhatsAppNumber("(+1) 555 123 4567")).toBe("15551234567");
    });

    it("drops an international 00 prefix", () => {
      expect(normalizeWhatsAppNumber("00919876543210")).toBe("919876543210");
    });

    it("expands a national number with the default country code", () => {
      expect(normalizeWhatsAppNumber("09876543210", "91")).toBe("919876543210");
      expect(normalizeWhatsAppNumber("9876543210", "91")).toBe("919876543210");
    });

    it("prefixes even when the national number starts with the country code", () => {
      expect(normalizeWhatsAppNumber("9198765432", "91")).toBe("919198765432");
    });

    it("leaves an already-international number alone", () => {
      expect(normalizeWhatsAppNumber("919876543210", "91")).toBe("919876543210");
    });

    it("returns null when a national number has no country code to expand with", () => {
      expect(normalizeWhatsAppNumber("09876543210")).toBeNull();
      expect(normalizeWhatsAppNumber("9876543210")).toBeNull();
    });

    it("rejects empty, short and over-long inputs", () => {
      expect(normalizeWhatsAppNumber("")).toBeNull();
      expect(normalizeWhatsAppNumber(null)).toBeNull();
      expect(normalizeWhatsAppNumber("abc")).toBeNull();
      expect(normalizeWhatsAppNumber("+1234")).toBeNull();
      expect(normalizeWhatsAppNumber("+1234567890123456")).toBeNull();
    });
  });

  it("validates E.164 digits without a plus", () => {
    expect(isValidWhatsAppNumber("919876543210")).toBe(true);
    expect(isValidWhatsAppNumber("0919876543")).toBe(false);
    expect(isValidWhatsAppNumber("12345")).toBe(false);
  });

  describe("buildTextPayload", () => {
    it("builds an individual text message with previews off by default", () => {
      expect(buildTextPayload({ to: "raw", body: "Class at 6pm" }, "919876543210")).toEqual({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: "919876543210",
        type: "text",
        text: { body: "Class at 6pm", preview_url: false }
      });
    });

    it("opts into link previews", () => {
      const payload = buildTextPayload(
        { to: "raw", body: "https://nexa.test", previewUrl: true },
        "919876543210"
      );
      expect(payload.text.preview_url).toBe(true);
    });
  });

  describe("buildTemplatePayload", () => {
    it("defaults the language and omits empty components", () => {
      expect(buildTemplatePayload({ to: "raw", name: "class_reminder" }, "919876543210")).toEqual({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: "919876543210",
        type: "template",
        template: { name: "class_reminder", language: { code: "en_US" } }
      });
    });

    it("maps header and body params to ordered text parameters", () => {
      const payload = buildTemplatePayload(
        {
          to: "raw",
          name: "class_reminder",
          language: "en",
          headerParams: ["Beginners"],
          bodyParams: ["Asha", "6:00 PM"]
        },
        "919876543210"
      );

      expect(payload.template).toEqual({
        name: "class_reminder",
        language: { code: "en" },
        components: [
          { type: "header", parameters: [{ type: "text", text: "Beginners" }] },
          {
            type: "body",
            parameters: [
              { type: "text", text: "Asha" },
              { type: "text", text: "6:00 PM" }
            ]
          }
        ]
      });
    });

    it("lets explicit components override the generated ones", () => {
      const components = [
        {
          type: "button" as const,
          sub_type: "url" as const,
          index: "0",
          parameters: [{ type: "text" as const, text: "join" }]
        }
      ];
      const payload = buildTemplatePayload(
        { to: "raw", name: "class_reminder", bodyParams: ["ignored"], components },
        "919876543210"
      );

      expect(payload.template.components).toBe(components);
    });
  });

  describe("parseSendResult", () => {
    it("reads the message and contact ids", () => {
      expect(
        parseSendResult(
          {
            messaging_product: "whatsapp",
            contacts: [{ input: "919876543210", wa_id: "919876543210" }],
            messages: [{ id: "wamid.ABC" }]
          },
          "919876543210"
        )
      ).toEqual({ messageId: "wamid.ABC", to: "919876543210", waId: "919876543210" });
    });

    it("throws when the provider returns no message id", () => {
      expect(() =>
        parseSendResult({ messaging_product: "whatsapp", messages: [] }, "919876543210")
      ).toThrow(/no message id/);
    });
  });

  describe("parseSendFailure", () => {
    it("flattens the Graph API error envelope", () => {
      expect(
        parseSendFailure(400, {
          error: {
            message: "(#131047) Re-engagement message",
            code: 131047,
            error_subcode: 2494010,
            fbtrace_id: "Axyz",
            error_data: { details: "Message failed to send." }
          }
        })
      ).toEqual({
        message: "(#131047) Re-engagement message — Message failed to send.",
        status: 400,
        code: 131047,
        subcode: 2494010,
        traceId: "Axyz",
        retryable: false
      });
    });

    it("describes a network failure as status 0 and retryable", () => {
      const failure = parseSendFailure(0, null);
      expect(failure.retryable).toBe(true);
      expect(failure.message).toMatch(/unreachable/);
    });
  });

  describe("isRetryableWhatsAppFailure", () => {
    it("retries transport-level and rate-limit failures", () => {
      expect(isRetryableWhatsAppFailure(0)).toBe(true);
      expect(isRetryableWhatsAppFailure(429)).toBe(true);
      expect(isRetryableWhatsAppFailure(503)).toBe(true);
      expect(isRetryableWhatsAppFailure(400, 131056)).toBe(true);
    });

    it("does not retry a rejected payload or an expired token", () => {
      expect(isRetryableWhatsAppFailure(400, 131047)).toBe(false);
      expect(isRetryableWhatsAppFailure(401, 190)).toBe(false);
    });
  });

  it("describes a failure without leaking the payload", () => {
    expect(
      describeWhatsAppFailure({
        message: "Invalid parameter",
        status: 400,
        code: 100,
        traceId: "Axyz",
        retryable: false
      })
    ).toBe("Invalid parameter (status=400 code=100 fbtrace=Axyz)");
  });
});

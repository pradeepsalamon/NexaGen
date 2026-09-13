import {
  buildMessagesUrl,
  isWhatsAppConfigured,
  type WhatsAppEnv
} from "./whatsapp.config";

const baseEnv: WhatsAppEnv = {
  WHATSAPP_ACCESS_TOKEN: "token-123",
  WHATSAPP_PHONE_NUMBER_ID: "111222333",
  WHATSAPP_API_BASE_URL: "https://graph.facebook.com",
  WHATSAPP_API_VERSION: "v21.0",
  WHATSAPP_DEFAULT_COUNTRY_CODE: "91",
  WHATSAPP_TIMEOUT_MS: 10000
};

describe("whatsapp.config", () => {
  it("needs both a token and a phone number id to be configured", () => {
    expect(isWhatsAppConfigured(baseEnv)).toBe(true);
    expect(isWhatsAppConfigured({ ...baseEnv, WHATSAPP_ACCESS_TOKEN: undefined })).toBe(false);
    expect(isWhatsAppConfigured({ ...baseEnv, WHATSAPP_PHONE_NUMBER_ID: undefined })).toBe(
      false
    );
  });

  describe("buildMessagesUrl", () => {
    it("builds the versioned send endpoint", () => {
      expect(buildMessagesUrl(baseEnv)).toBe(
        "https://graph.facebook.com/v21.0/111222333/messages"
      );
    });

    it("tolerates a trailing slash on the base url", () => {
      expect(
        buildMessagesUrl({ ...baseEnv, WHATSAPP_API_BASE_URL: "https://graph.facebook.com/" })
      ).toBe("https://graph.facebook.com/v21.0/111222333/messages");
    });

    it("throws when credentials are missing", () => {
      expect(() => buildMessagesUrl({ ...baseEnv, WHATSAPP_ACCESS_TOKEN: undefined })).toThrow(
        /WHATSAPP_ACCESS_TOKEN/
      );
    });
  });
});

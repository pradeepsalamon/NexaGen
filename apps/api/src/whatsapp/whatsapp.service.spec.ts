import { BadRequestException, Logger, ServiceUnavailableException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import * as configModule from "@nexa-chess/config/api";
import type { ApiEnv } from "@nexa-chess/config/api";
import { WhatsAppSendError, WhatsAppService } from "./whatsapp.service";

const OK_BODY = {
  messaging_product: "whatsapp",
  contacts: [{ input: "919876543210", wa_id: "919876543210" }],
  messages: [{ id: "wamid.ABC" }]
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

describe("WhatsAppService", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, OK_BODY));
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const setupService = async (envMocks: Partial<ApiEnv> = {}) => {
    const env: ApiEnv = {
      CORS_ORIGIN: "http://localhost:3000",
      FRONTEND_URL: undefined,
      JWT_ACCESS_SECRET: "access-secret",
      JWT_ACCESS_TTL: "15m",
      JWT_REFRESH_SECRET: "refresh-secret",
      JWT_REFRESH_SHORT_TTL: "1d",
      JWT_REFRESH_TTL: "7d",
      LOGIN_RESPONSE_DELAY: "500ms",
      NODE_ENV: "test",
      PASSWORD_RESET_RESPONSE_DELAY: "5s",
      PORT: 3001,
      TRASH_RETENTION_DAYS: 30,
      SMTP_PORT: 587,
      SMTP_SECURE: false,
      STOCKFISH_POOL_SIZE: 1,
      STOCKFISH_MOVETIME: 800,
      TRUST_PROXY_HOPS: 0,
      RECORDING_STORAGE_DIR: "/recordings",
      RECORDING_STORAGE_LIMIT_GB: 130,
      RECORDING_MIN_RETENTION_DAYS: 14,
      RECORDING_STORAGE_TARGET: "local" as const,
      ANALYTICS_STORAGE_WARN_PERCENT: 70,
      ANALYTICS_STORAGE_CRITICAL_PERCENT: 85,
      ANALYTICS_LOW_ATTENDANCE_PERCENT: 75,
      ANALYTICS_INACTIVE_DAYS: 30,
      ANALYTICS_CACHE_TTL_SECONDS: 300,
      REDIS_URL: undefined,
      QUEUE_PREFIX: "nexa",
      QUEUE_CONCURRENCY: 5,
      WHATSAPP_ACCESS_TOKEN: "token-123",
      WHATSAPP_PHONE_NUMBER_ID: "111222333",
      WHATSAPP_API_BASE_URL: "https://graph.facebook.com",
      WHATSAPP_API_VERSION: "v21.0",
      WHATSAPP_DEFAULT_COUNTRY_CODE: "91",
      WHATSAPP_TIMEOUT_MS: 10000,
      PAYMENTS_ENABLED: true,
      PAYMENTS_MODE: "sandbox",
      PAYMENTS_DEFAULT_CURRENCY: "INR",
      PAYMENTS_ORDER_TTL_MINUTES: 30,
      PAYMENTS_HTTP_TIMEOUT_MS: 15000,
      PAYMENTS_HEALTH_WINDOW_HOURS: 24,
      PAYMENTS_HEALTH_MIN_SUCCESS_RATE: 40,
      PAYMENTS_HEALTH_MIN_SAMPLES: 10,
      PAYMENTS_INVOICE_PREFIX: "NEXA",
      PAYMENTS_TAX_LABEL: "GST",
      CASHFREE_API_VERSION: "2023-08-01",
      STRIPE_API_VERSION: "2024-06-20",
      ...envMocks
    };

    jest.spyOn(configModule, "getApiEnv").mockReturnValue(env);

    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsAppService]
    }).compile();

    return module.get(WhatsAppService);
  };

  describe("configuration", () => {
    it("reports configured when credentials are set", async () => {
      const service = await setupService();

      expect(service.isConfigured()).toBe(true);
    });

    it("refuses to send without credentials", async () => {
      const service = await setupService({ WHATSAPP_ACCESS_TOKEN: undefined });

      expect(service.isConfigured()).toBe(false);
      await expect(
        service.sendText({ to: "+919876543210", body: "hi" })
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("documents", () => {
    it("uploads a PDF to the media endpoint and returns the handle", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { id: "media_abc123" }));
      const service = await setupService();

      const result = await service.uploadMedia(
        Buffer.from("%PDF-1.3"),
        "NEXA-INV-2026-000001.pdf"
      );

      expect(result.mediaId).toBe("media_abc123");

      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toMatch(/\/media$/);
      expect(init.body).toBeInstanceOf(FormData);
      // fetch must set the multipart boundary itself; an explicit Content-Type
      // here produces a malformed upload.
      expect(init.headers["Content-Type"]).toBeUndefined();
    });

    it("treats an upload with no id as a failure rather than sending nothing", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, {}));
      const service = await setupService();

      await expect(
        service.uploadMedia(Buffer.from("%PDF-"), "x.pdf")
      ).rejects.toBeInstanceOf(WhatsAppSendError);
    });

    it("sends a document by media id, with the body as its caption", async () => {
      const service = await setupService();

      await service.sendDocument({
        to: "+919876543210",
        mediaId: "media_abc123",
        filename: "NEXA-INV-2026-000001.pdf",
        caption: "Here is your invoice."
      });

      const [, init] = fetchMock.mock.calls[0];
      const payload = JSON.parse(init.body as string);

      expect(payload.type).toBe("document");
      expect(payload.document).toEqual({
        id: "media_abc123",
        filename: "NEXA-INV-2026-000001.pdf",
        caption: "Here is your invoice."
      });
      // A media id and a link are mutually exclusive; the id wins.
      expect(payload.document.link).toBeUndefined();
    });

    it("falls back to a link when there is no uploaded media", async () => {
      const service = await setupService();

      await service.sendDocument({
        to: "+919876543210",
        link: "https://example.test/invoice.pdf",
        filename: "invoice.pdf"
      });

      const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(payload.document.link).toBe("https://example.test/invoice.pdf");
      expect(payload.document.id).toBeUndefined();
    });

    it("refuses a document that names neither a media id nor a link", async () => {
      const service = await setupService();

      await expect(
        service.sendDocument({ to: "+919876543210" })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("attaches a document to a template as its header", async () => {
      const service = await setupService();

      await service.sendTemplate({
        to: "+919876543210",
        name: "invoice_issued",
        bodyParams: ["Priya", "NEXA-INV-2026-000001"],
        headerDocument: {
          mediaId: "media_abc123",
          filename: "NEXA-INV-2026-000001.pdf"
        }
      });

      const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      const header = payload.template.components.find(
        (component: { type: string }) => component.type === "header"
      );

      expect(header.parameters[0]).toEqual({
        type: "document",
        document: { id: "media_abc123", filename: "NEXA-INV-2026-000001.pdf" }
      });
    });

    it("never throws from the best-effort upload", async () => {
      fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
      const service = await setupService();

      const outcome = await service.tryUploadMedia(
        Buffer.from("%PDF-"),
        "x.pdf"
      );

      expect(outcome.ok).toBe(false);
    });

    it("refuses to upload without credentials", async () => {
      const service = await setupService({ WHATSAPP_ACCESS_TOKEN: undefined });

      await expect(
        service.uploadMedia(Buffer.from("%PDF-"), "x.pdf")
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("sendText", () => {
    it("posts a text message to the configured phone number", async () => {
      const service = await setupService();

      const result = await service.sendText({
        to: "098765 43210",
        body: "Class at 6pm"
      });

      expect(result).toEqual({
        messageId: "wamid.ABC",
        to: "919876543210",
        waId: "919876543210"
      });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://graph.facebook.com/v21.0/111222333/messages");
      expect(init.method).toBe("POST");
      expect(init.headers.Authorization).toBe("Bearer token-123");
      expect(JSON.parse(init.body)).toEqual({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: "919876543210",
        type: "text",
        text: { body: "Class at 6pm", preview_url: false }
      });
    });

    it("rejects an unusable phone number before calling the API", async () => {
      const service = await setupService({ WHATSAPP_DEFAULT_COUNTRY_CODE: undefined });

      await expect(service.sendText({ to: "0987", body: "hi" })).rejects.toBeInstanceOf(
        BadRequestException
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects an empty or over-long body", async () => {
      const service = await setupService();

      await expect(
        service.sendText({ to: "+919876543210", body: "   " })
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.sendText({ to: "+919876543210", body: "x".repeat(4097) })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("surfaces a provider error with its retryability", async () => {
      const service = await setupService();
      fetchMock.mockResolvedValue(
        jsonResponse(429, { error: { message: "rate limited", code: 130429 } })
      );

      await expect(
        service.sendText({ to: "+919876543210", body: "hi" })
      ).rejects.toMatchObject({
        name: "WhatsAppSendError",
        failure: { status: 429, code: 130429, retryable: true }
      });
    });

    it("treats a network failure as retryable", async () => {
      const service = await setupService();
      fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

      const error = await service
        .sendText({ to: "+919876543210", body: "hi" })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(WhatsAppSendError);
      expect((error as WhatsAppSendError).retryable).toBe(true);
    });
  });

  describe("sendTemplate", () => {
    it("posts a template with its body params", async () => {
      const service = await setupService();

      await service.sendTemplate({
        to: "+919876543210",
        name: "class_reminder",
        bodyParams: ["Asha", "6:00 PM"]
      });

      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: "919876543210",
        type: "template",
        template: {
          name: "class_reminder",
          language: { code: "en_US" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: "Asha" },
                { type: "text", text: "6:00 PM" }
              ]
            }
          ]
        }
      });
    });

    it("requires a template name", async () => {
      const service = await setupService();

      await expect(
        service.sendTemplate({ to: "+919876543210", name: " " })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("best-effort sends", () => {
    it("returns a failure instead of throwing", async () => {
      const service = await setupService();
      fetchMock.mockResolvedValue(
        jsonResponse(400, { error: { message: "bad number", code: 131026 } })
      );

      await expect(
        service.trySendText({ to: "+919876543210", body: "hi" })
      ).resolves.toEqual({
        ok: false,
        error: expect.objectContaining({ status: 400, code: 131026, retryable: false })
      });
    });

    it("reports a validation failure as a non-retryable outcome", async () => {
      const service = await setupService({ WHATSAPP_DEFAULT_COUNTRY_CODE: undefined });

      await expect(service.trySendText({ to: "0987", body: "hi" })).resolves.toMatchObject({
        ok: false,
        error: { retryable: false }
      });
    });
  });

  describe("sendTextToMany", () => {
    it("de-duplicates recipients and keeps one failure from sinking the rest", async () => {
      const service = await setupService();
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, OK_BODY))
        .mockResolvedValueOnce(
          jsonResponse(400, { error: { message: "nope", code: 131026 } })
        );

      const outcomes = await service.sendTextToMany(
        ["+919876543210", "+919876543210", "+919000000000"],
        "Class at 6pm"
      );

      expect(Object.keys(outcomes)).toEqual(["+919876543210", "+919000000000"]);
      expect(outcomes["+919876543210"].ok).toBe(true);
      expect(outcomes["+919000000000"].ok).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it("normalizes a recipient without sending", async () => {
    const service = await setupService();

    expect(service.normalizeRecipient("098765 43210")).toBe("919876543210");
    expect(service.normalizeRecipient("nope")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

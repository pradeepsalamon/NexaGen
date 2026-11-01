import { Test, TestingModule } from "@nestjs/testing";
import { MailService } from "./mail.service";
import { SystemMessageRenderer } from "./system-message-renderer.service";
import { PrismaService } from "../prisma/prisma.service";
import { ServiceUnavailableException } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import * as configModule from "@nexa-chess/config/api";
import type { ApiEnv } from "@nexa-chess/config/api";

jest.mock("nodemailer");

describe("MailService", () => {
  let service: MailService;
  let mockSendMail: jest.Mock;
  let findTemplate: jest.Mock;

  beforeEach(() => {
    mockSendMail = jest.fn().mockResolvedValue({});
    findTemplate = jest.fn().mockResolvedValue(null);
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: mockSendMail,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
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
      MFA_REQUIRED_ROLES: "",
      NODE_ENV: "test",
      PASSWORD_RESET_RESPONSE_DELAY: "5s",
      PORT: 3001,
      SMTP_FROM: "test@example.com",
      SMTP_HOST: "smtp.example.com",
      SMTP_PASS: "pass123",
      SMTP_PORT: 587,
      SMTP_SECURE: false,
      SMTP_USER: "testuser",
      TRASH_RETENTION_DAYS: 30,
      STOCKFISH_POOL_SIZE: 1,
      STOCKFISH_MIN_ENGINES: 1,
      STOCKFISH_IDLE_TIMEOUT_S: 60,
      STOCKFISH_MOVETIME: 800,
      STOCKFISH_MOVE_MOVETIME: 2000,
      STOCKFISH_MOVE_MAX_DEPTH: 22,
      STOCKFISH_HASH_MB: 64,
      STOCKFISH_MAX_DEPTH: 20,
      COOKIE_DOMAIN: undefined,
      COOKIE_SAME_SITE: "lax",
      TRUST_PROXY_HOPS: 0,
      RECORDING_STORAGE_DIR: "/recordings",
      RECORDING_STORAGE_LIMIT_GB: 130,
      RECORDING_MIN_RETENTION_DAYS: 14,
      LIVE_CLASS_COACH_ABSENT_GRACE_MINUTES: 10,
      LIVE_CLASS_MAX_OVERRUN_MINUTES: 60,
      RECORDING_STORAGE_TARGET: "local" as const,
      RECORDING_TEMPLATE_BASE_URL: undefined,
      ANALYTICS_STORAGE_WARN_PERCENT: 70,
      ANALYTICS_STORAGE_CRITICAL_PERCENT: 85,
      ANALYTICS_LOW_ATTENDANCE_PERCENT: 75,
      ANALYTICS_INACTIVE_DAYS: 30,
      ANALYTICS_CACHE_TTL_SECONDS: 300,
      REDIS_URL: undefined,
      QUEUE_PREFIX: "nexa",
      QUEUE_CONCURRENCY: 5,
      WHATSAPP_ACCESS_TOKEN: undefined,
      WHATSAPP_PHONE_NUMBER_ID: undefined,
      WHATSAPP_API_BASE_URL: "https://graph.facebook.com",
      WHATSAPP_API_VERSION: "v21.0",
      WHATSAPP_DEFAULT_COUNTRY_CODE: undefined,
      WHATSAPP_TIMEOUT_MS: 10000,
      EXTERNAL_GAME_IMPORT_ENABLED: false,
      AI_ENABLED: false,
      AI_RUNTIME_SHARED_SECRET: undefined,
      AI_RUNTIME_TIMEOUT_MS: 5000,
      AI_RUNTIME_URL: "http://ai-runtime:8000",
      GAME_ANALYSIS_AUTO_LIVE_GAMES: false,
      GAME_ANALYSIS_CONCURRENCY: 1,
      GAME_ANALYSIS_DAILY_LIMIT: 20,
      GAME_ANALYSIS_ENABLED: true,
      GAME_ANALYSIS_WORKER: true,
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
      providers: [
        MailService,
        SystemMessageRenderer,
        { provide: PrismaService, useValue: { systemMessageTemplate: { findUnique: findTemplate } } }
      ],
    }).compile();

    return module.get<MailService>(MailService);
  };

  describe("when SMTP is configured properly", () => {
    beforeEach(async () => {
      service = await setupService();
    });

    it("should be defined", () => {
      expect(service).toBeDefined();
    });

    it("never trusts a direct email's body as HTML", async () => {
      await service.sendDirectEmail({
        body: "<img src=x onerror=alert(1)>",
        subject: "Hi",
        to: "user@example.com"
      });

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.text).toBe("<img src=x onerror=alert(1)>");
      expect(callArgs.html).not.toContain("<img");
      expect(callArgs.html).toContain("&lt;img");
    });

    it("should send a password reset email successfully", async () => {
      await service.sendPasswordResetLink("user@example.com", "https://reset.link");

      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        auth: {
          user: "testuser",
          pass: "pass123",
        },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        host: "smtp.example.com",
        port: 587,
        secure: false,
        socketTimeout: 30_000,
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.to).toBe("user@example.com");
      expect(callArgs.from).toBe("test@example.com");
      expect(callArgs.subject).toContain("Reset your Nexa Chess password");
      expect(callArgs.text).toContain("https://reset.link");
      expect(callArgs.html).toContain("https://reset.link");
    });

    it("uses an admin's saved wording, and the link survives an edit that drops it", async () => {
      findTemplate.mockResolvedValue({
        actionLabel: "New password",
        body: "Hello from {{academy.name}}.",
        subject: "Password help"
      });

      await service.sendPasswordResetLink("user@example.com", "https://reset.link");

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.subject).toBe("Password help");
      expect(callArgs.text).toBe("Hello from Nexa Chess.\n\nNew password: https://reset.link");
      expect(callArgs.html).toContain('href="https://reset.link"');
      expect(callArgs.html).toContain("New password");
    });

    it("escapes admin wording and member values in a system email", async () => {
      findTemplate.mockResolvedValue({
        actionLabel: null,
        body: "<b>{{email.new}}</b> see https://nexa.test/a?b=1&c=2.",
        subject: "Changed"
      });

      await service.sendEmailChangedNotice("old@example.com", "<script>x</script>@example.com");

      const { html } = mockSendMail.mock.calls[0][0];
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("<b>");
      expect(html).toContain('<a href="https://nexa.test/a?b=1&amp;c=2"');
    });

    it("formats a body, and a member's value can't add a link or lose a link's characters", async () => {
      findTemplate.mockResolvedValue({
        actionLabel: "Go",
        body: "**Reset** for {{email.new}}: [open it](https://nexa.test/x)",
        subject: "Changed"
      });

      await service.sendEmailChangedNotice("old@example.com", "[Pay](https://evil.test)_a_@example.com");

      const { html, text } = mockSendMail.mock.calls[0][0];
      expect(html).toContain("<strong>Reset</strong>");
      expect(html).toContain('<a href="https://nexa.test/x"');
      expect(html).not.toContain(">Pay</a>");
      expect(text).toContain("[Pay](https://evil.test)_a_@example.com");
      expect(text).toContain("open it (https://nexa.test/x)");
    });

    it("keeps a reset link's token intact through the escaping", async () => {
      await service.sendPasswordResetLink("user@example.com", "https://nexa.test/reset?token=a_b*c_d");

      const { html, text } = mockSendMail.mock.calls[0][0];
      expect(html).toContain('href="https://nexa.test/reset?token=a_b*c_d"');
      expect(text).toContain("https://nexa.test/reset?token=a_b*c_d");
    });

    it("links an address in a direct email", async () => {
      await service.sendDirectEmail({ body: "See https://nexa.test/a_b.", subject: "Hi", to: "user@example.com" });

      const { html } = mockSendMail.mock.calls[0][0];
      expect(html).toContain('<a href="https://nexa.test/a_b"');
    });

    it("leaves no gap where an empty optional value was", async () => {
      await service.sendAccountDeletionResolved({ completed: false, email: "a@example.com", note: null });

      expect(mockSendMail.mock.calls[0][0].text).toBe(
        "Your request to delete your Nexa Chess account was not completed."
      );
    });

    it("sends a rule email as escaped plain text with a one-line subject", async () => {
      mockSendMail.mockResolvedValue({ messageId: "<abc@smtp>" });

      const id = await service.sendRuleEmail({
        body: "<img src=x>",
        subject: "Hello\r\nBcc: someone@example.com",
        to: "user@example.com"
      });

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(id).toBe("<abc@smtp>");
      expect(callArgs.subject).toBe("Hello Bcc: someone@example.com");
      expect(callArgs.text).toBe("<img src=x>");
      expect(callArgs.html).not.toContain("<img");
    });
  });

  describe("when SMTP is not configured", () => {
    it("should throw a ServiceUnavailableException", async () => {
      service = await setupService({ SMTP_HOST: undefined });

      await expect(service.sendPasswordResetLink("user@example.com", "https://reset.link"))
        .rejects
        .toThrow(ServiceUnavailableException);
        
      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });
});

import { Test, TestingModule } from "@nestjs/testing";
import { MailService } from "./mail.service";
import { ServiceUnavailableException } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import * as configModule from "@nexa-chess/config/api";
import type { ApiEnv } from "@nexa-chess/config/api";

jest.mock("nodemailer");

describe("MailService", () => {
  let service: MailService;
  let mockSendMail: jest.Mock;

  beforeEach(() => {
    mockSendMail = jest.fn().mockResolvedValue({});
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
      providers: [MailService],
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

    it("should send a password reset email successfully", async () => {
      await service.sendPasswordResetLink("user@example.com", "https://reset.link");

      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        auth: {
          user: "testuser",
          pass: "pass123",
        },
        host: "smtp.example.com",
        port: 587,
        secure: false,
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.to).toBe("user@example.com");
      expect(callArgs.from).toBe("test@example.com");
      expect(callArgs.subject).toContain("Reset your Nexa Chess password");
      expect(callArgs.text).toContain("https://reset.link");
      expect(callArgs.html).toContain("https://reset.link");
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

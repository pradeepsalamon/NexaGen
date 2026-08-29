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
      STOCKFISH_MOVETIME: 800,
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

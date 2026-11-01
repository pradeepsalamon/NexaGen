import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SYSTEM_MESSAGE_DEFINITIONS, SYSTEM_MESSAGE_KEYS } from "@nexa-chess/types";
import { MailService } from "../mail/mail.service";
import { SystemMessageRenderer } from "../mail/system-message-renderer.service";
import { PrismaService } from "../prisma/prisma.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { MessagingRuleService } from "./messaging-rule.service";
import { SystemMessageService } from "./system-message.service";

const ADMIN = { id: "admin_1", email: "admin@example.com", phoneNumber: "+919876543210" };

describe("SystemMessageService", () => {
  let service: SystemMessageService;
  let templates: { deleteMany: jest.Mock; findMany: jest.Mock; upsert: jest.Mock };
  let mail: { isConfigured: jest.Mock; sendSystemMessageSample: jest.Mock };
  let whatsapp: { isConfigured: jest.Mock; normalizeRecipient: jest.Mock; trySendText: jest.Mock };

  beforeEach(async () => {
    templates = {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockImplementation(({ create }) =>
        Promise.resolve({ ...create, updatedAt: new Date(), updatedBy: null })
      )
    };
    mail = {
      isConfigured: jest.fn().mockReturnValue(true),
      sendSystemMessageSample: jest.fn().mockResolvedValue(undefined)
    };
    whatsapp = {
      isConfigured: jest.fn().mockReturnValue(true),
      normalizeRecipient: jest.fn().mockReturnValue("919876543210"),
      trySendText: jest.fn().mockResolvedValue({ ok: true, result: { messageId: "wamid.1" } })
    };

    const module = await Test.createTestingModule({
      providers: [
        SystemMessageService,
        { provide: MailService, useValue: mail },
        { provide: PrismaService, useValue: { systemMessageTemplate: templates } },
        { provide: SystemMessageRenderer, useValue: { render: jest.fn().mockResolvedValue({ body: "Rendered" }) } },
        { provide: MessagingRuleService, useValue: { assertAdmin: jest.fn().mockResolvedValue(ADMIN) } },
        { provide: WhatsAppService, useValue: whatsapp }
      ]
    }).compile();

    service = module.get(SystemMessageService);
  });

  it("lists every message, on its default wording until someone edits it", async () => {
    const { messages } = await service.list("token");

    expect(messages.map((message) => message.key)).toEqual(SYSTEM_MESSAGE_KEYS);
    expect(messages.every((message) => !message.isCustomized)).toBe(true);
  });

  it("saves new wording", async () => {
    const saved = await service.update("token", "PASSWORD_RESET", {
      actionLabel: "New password",
      body: "Choose a new password.",
      subject: "Password help"
    });

    expect(templates.upsert).toHaveBeenCalled();
    expect(saved).toMatchObject({ isCustomized: true, subject: "Password help" });
  });

  it("clears the row when the wording goes back to the default", async () => {
    const { defaults } = SYSTEM_MESSAGE_DEFINITIONS.PASSWORD_RESET;

    const saved = await service.update("token", "PASSWORD_RESET", defaults);

    expect(templates.upsert).not.toHaveBeenCalled();
    expect(templates.deleteMany).toHaveBeenCalledWith({ where: { key: "PASSWORD_RESET" } });
    expect(saved.isCustomized).toBe(false);
  });

  it("refuses a WhatsApp invitation that drops its join link", async () => {
    await expect(
      service.update("token", "DEMO_INVITATION_WHATSAPP", {
        actionLabel: null,
        body: "You're invited!",
        subject: null
      })
    ).rejects.toThrow(BadRequestException);
    expect(templates.upsert).not.toHaveBeenCalled();
  });

  it("refuses an email without a subject", async () => {
    await expect(
      service.update("token", "EMAIL_CHANGED", { actionLabel: null, body: "Changed.", subject: null })
    ).rejects.toThrow(BadRequestException);
  });

  it("sends an email test only to the admin's own account", async () => {
    const result = await service.test("token", "PASSWORD_RESET", { phoneNumber: "+15550000000" });

    expect(mail.sendSystemMessageSample).toHaveBeenCalledWith("PASSWORD_RESET", "admin@example.com");
    expect(result).toMatchObject({ sent: true, to: "a•••@example.com" });
  });

  it("reports a failed email test instead of throwing", async () => {
    mail.sendSystemMessageSample.mockRejectedValue(new Error("SMTP down"));

    const result = await service.test("token", "PASSWORD_RESET", {});

    expect(result).toMatchObject({ error: "SMTP down", sent: false });
  });

  it("sends a WhatsApp test as text", async () => {
    const result = await service.test("token", "DEMO_REGISTRATION_WHATSAPP", {});

    expect(whatsapp.trySendText).toHaveBeenCalledWith({ body: "Rendered", to: "919876543210" });
    expect(mail.sendSystemMessageSample).not.toHaveBeenCalled();
    expect(result.sent).toBe(true);
  });
});

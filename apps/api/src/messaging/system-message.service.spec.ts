import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SYSTEM_MESSAGE_DEFINITIONS, SYSTEM_MESSAGE_KEYS } from "@nexa-chess/types";
import { MailService } from "../mail/mail.service";
import { SystemMessageRenderer } from "../mail/system-message-renderer.service";
import { NotificationService } from "../notification/notification.service";
import { PrismaService } from "../prisma/prisma.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { MessagingRuleService } from "./messaging-rule.service";
import { SystemMessageService } from "./system-message.service";

const ADMIN = { id: "admin_1", email: "admin@example.com", phoneNumber: "+919876543210", tenantId: "tenant_nexa" };

describe("SystemMessageService", () => {
  let service: SystemMessageService;
  let assertAdmin: jest.Mock;
  let templates: { deleteMany: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock; upsert: jest.Mock };
  let mail: { isConfigured: jest.Mock; sendSystemMessageSample: jest.Mock };
  let whatsapp: { isConfigured: jest.Mock; normalizeRecipient: jest.Mock; trySendMessage: jest.Mock };
  let renderAll: jest.Mock;
  let notify: jest.Mock;

  beforeEach(async () => {
    assertAdmin = jest.fn().mockResolvedValue(ADMIN);
    templates = {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation(({ create }) =>
        Promise.resolve({ ...create, updatedAt: new Date(), updatedBy: null })
      )
    };
    mail = {
      isConfigured: jest.fn().mockReturnValue(true),
      sendSystemMessageSample: jest.fn().mockResolvedValue(undefined)
    };
    notify = jest.fn().mockResolvedValue(undefined);
    renderAll = jest
      .fn()
      .mockResolvedValue({ body: "Rendered", subject: "Subject", whatsapp: "Rendered for WhatsApp", whatsappTemplate: null });
    whatsapp = {
      isConfigured: jest.fn().mockReturnValue(true),
      normalizeRecipient: jest.fn().mockReturnValue("919876543210"),
      trySendMessage: jest.fn().mockResolvedValue({ ok: true, result: { messageId: "wamid.1" } })
    };

    const module = await Test.createTestingModule({
      providers: [
        SystemMessageService,
        { provide: MailService, useValue: mail },
        { provide: PrismaService, useValue: { systemMessageTemplate: templates } },
        {
          provide: SystemMessageRenderer,
          useValue: { renderAll }
        },
        { provide: NotificationService, useValue: { notify } },
        { provide: MessagingRuleService, useValue: { assertAdmin } },
        { provide: WhatsAppService, useValue: whatsapp }
      ]
    }).compile();

    service = module.get(SystemMessageService);
  });

  const save = (key: keyof typeof SYSTEM_MESSAGE_DEFINITIONS, overrides: Record<string, unknown> = {}) => {
    const definition = SYSTEM_MESSAGE_DEFINITIONS[key];
    return service.update("token", key, {
      ...definition.defaults,
      channels: [...definition.defaultChannels],
      whatsappBody: null,
      ...overrides
    });
  };

  it("lists every message, on its default wording and channels until someone edits it", async () => {
    const { messages } = await service.list("token");

    expect(messages.map((message) => message.key)).toEqual(SYSTEM_MESSAGE_KEYS);
    expect(messages.every((message) => !message.isCustomized)).toBe(true);
    expect(messages.find((message) => message.key === "NEW_LEAD_ADMIN")?.channels).toEqual(["EMAIL", "IN_APP"]);
  });

  it("every message supports email, WhatsApp and in-app unless its note says why not", () => {
    for (const definition of Object.values(SYSTEM_MESSAGE_DEFINITIONS)) {
      if (definition.channels.length < 3) expect(definition.channelNote).toBeTruthy();
      expect(definition.defaultChannels.every((channel) => definition.channels.includes(channel))).toBe(true);
      expect(definition.defaultChannels.length).toBeGreaterThan(0);
    }
  });

  it("hides platform-only messages from another academy's admins and refuses to edit them", async () => {
    assertAdmin.mockResolvedValue({ ...ADMIN, tenantId: "tenant_rook" });
    const { messages } = await service.list("token");
    expect(messages.map((message) => message.key)).not.toContain("TENANT_INTEGRITY_ALERT");
    expect(messages.map((message) => message.key)).toContain("NEW_LEAD_ADMIN");
    await expect(save("TENANT_INTEGRITY_ALERT")).rejects.toThrow("Message not found.");
  });

  it("saves new wording", async () => {
    const saved = await save("PASSWORD_RESET", { body: "Choose a new password.", subject: "Password help" });

    expect(templates.upsert).toHaveBeenCalled();
    expect(saved).toMatchObject({ isCustomized: true, subject: "Password help" });
  });

  it("saves the channel switches, one per supported channel", async () => {
    const saved = await save("NEW_LEAD_ADMIN", { channels: ["WHATSAPP", "IN_APP"] });

    expect(templates.upsert.mock.calls[0][0].create).toMatchObject({
      emailEnabled: false,
      inAppEnabled: true,
      whatsappEnabled: true
    });
    expect(saved.channels).toEqual(["WHATSAPP", "IN_APP"]);
  });

  it("refuses a channel the message can't use, and switching every channel off", async () => {
    await expect(save("EMAIL_VERIFICATION", { channels: ["EMAIL", "WHATSAPP"] })).rejects.toThrow(
      /proves the person owns/
    );
    await expect(save("NEW_LEAD_ADMIN", { channels: [] })).rejects.toThrow(/at least one channel/);
    expect(templates.upsert).not.toHaveBeenCalled();
  });

  it("clears the row when wording and channels go back to the default", async () => {
    const saved = await save("PASSWORD_RESET");

    expect(templates.upsert).not.toHaveBeenCalled();
    expect(templates.deleteMany).toHaveBeenCalledWith({ where: { key: "PASSWORD_RESET" } });
    expect(saved.isCustomized).toBe(false);
  });

  it("keeps the academy's own WhatsApp wording, and stores the standard one as null", async () => {
    await save("DEMO_INVITATION", { whatsappBody: "Hi {{guest.name}}, join here: {{links.join}}" });
    expect(templates.upsert.mock.calls[0][0].create.whatsappBody).toBe("Hi {{guest.name}}, join here: {{links.join}}");

    await save("DEMO_INVITATION", {
      subject: "Changed",
      whatsappBody: SYSTEM_MESSAGE_DEFINITIONS.DEMO_INVITATION.defaults.whatsappBody
    });
    expect(templates.upsert.mock.calls[1][0].create.whatsappBody).toBeNull();
  });

  it("refuses a message that drops a placeholder it must keep", async () => {
    await expect(save("TENANT_INTEGRITY_ALERT", { body: "Something happened." })).rejects.toThrow(BadRequestException);
    expect(templates.upsert).not.toHaveBeenCalled();
  });

  it("sends an email test only to the admin's own account", async () => {
    const result = await service.test("token", "PASSWORD_RESET", { channel: "EMAIL", phoneNumber: "+15550000000" });

    expect(mail.sendSystemMessageSample).toHaveBeenCalledWith("PASSWORD_RESET", "admin@example.com");
    expect(result).toMatchObject({ sent: true, to: "a•••@example.com" });
  });

  it("reports a failed email test instead of throwing", async () => {
    mail.sendSystemMessageSample.mockRejectedValue(new Error("SMTP down"));

    const result = await service.test("token", "PASSWORD_RESET", { channel: "EMAIL" });

    expect(result).toMatchObject({ error: "SMTP down", sent: false });
  });

  it("sends a WhatsApp test as the WhatsApp text", async () => {
    const result = await service.test("token", "DEMO_REGISTRATION", { channel: "WHATSAPP" });

    expect(whatsapp.trySendMessage).toHaveBeenCalledWith({ template: null, text: "Rendered for WhatsApp", to: "919876543210" });
    expect(mail.sendSystemMessageSample).not.toHaveBeenCalled();
    expect(result.sent).toBe(true);
  });

  it("sends an in-app test to the admin's own inbox", async () => {
    const result = await service.test("token", "NEW_LEAD_ADMIN", { channel: "IN_APP" });

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ linkPath: "/admin/leads", title: "Subject", type: "SYSTEM_MESSAGE", userId: "admin_1" })
    );
    expect(result.sent).toBe(true);
  });

  it("refuses to test a channel the message doesn't support", async () => {
    await expect(service.test("token", "DEMO_BOOKING", { channel: "IN_APP" })).rejects.toThrow(BadRequestException);
  });

  describe("approved WhatsApp templates", () => {
    const TEMPLATE = {
      whatsappTemplateLanguage: "en",
      whatsappTemplateName: "demo_invite",
      whatsappTemplateParams: ["{{guest.name}}", "{{links.join}}"]
    };

    it("saves a template, trimmed, and returns it", async () => {
      const saved = await save("DEMO_INVITATION", {
        ...TEMPLATE,
        whatsappTemplateName: " demo_invite ",
        whatsappTemplateParams: [" {{guest.name}} ", "", "{{links.join}}"]
      });

      expect(templates.upsert.mock.calls[0][0].create).toMatchObject(TEMPLATE);
      expect(saved).toMatchObject({ ...TEMPLATE, isCustomized: true });
    });

    it("keeps the saved template when an older client saves without the template fields", async () => {
      templates.findUnique.mockResolvedValue({ key: "DEMO_INVITATION", ...TEMPLATE });

      await save("DEMO_INVITATION", { subject: "Changed" });

      expect(templates.upsert.mock.calls[0][0].update).toMatchObject(TEMPLATE);
    });

    it("clears it with a null name, and then the defaults clear the row", async () => {
      templates.findUnique.mockResolvedValue({ key: "DEMO_INVITATION", ...TEMPLATE });

      const saved = await save("DEMO_INVITATION", { whatsappTemplateLanguage: null, whatsappTemplateName: null, whatsappTemplateParams: [] });

      expect(templates.upsert).not.toHaveBeenCalled();
      expect(templates.deleteMany).toHaveBeenCalled();
      expect(saved.whatsappTemplateName).toBeNull();
    });

    it("a template alone keeps the row, even on default wording", async () => {
      await save("DEMO_INVITATION", TEMPLATE);
      expect(templates.upsert).toHaveBeenCalled();
      expect(templates.deleteMany).not.toHaveBeenCalled();
    });

    it("refuses an invalid template, with the reason", async () => {
      await expect(save("DEMO_INVITATION", { whatsappTemplateName: "Demo Invite" })).rejects.toThrow(/lower-case letters/);
      await expect(
        save("DEMO_INVITATION", { whatsappTemplateName: "demo_invite", whatsappTemplateParams: ["{{payment.amount}}"] })
      ).rejects.toThrow(/can't fill \{\{payment.amount\}\}/);
      await expect(save("DEMO_INVITATION", { whatsappTemplateLanguage: "en" })).rejects.toThrow(/Add the template's name/);
      expect(templates.upsert).not.toHaveBeenCalled();
    });

    it("refuses a template on a message that isn't sent by WhatsApp", async () => {
      await expect(save("EMAIL_VERIFICATION", { whatsappTemplateName: "verify" })).rejects.toThrow(
        /isn't sent by WhatsApp/
      );
    });

    it("tests WhatsApp through the saved template, and says which template failed", async () => {
      const template = { bodyParams: ["Asha", "https://nexa.test/demo/x"], language: "en", name: "demo_invite" };
      renderAll.mockResolvedValue({ body: "Rendered", subject: "Subject", whatsapp: "Rendered for WhatsApp", whatsappTemplate: template });
      whatsapp.trySendMessage.mockResolvedValue({ error: { message: "Template name does not exist" }, ok: false });

      const result = await service.test("token", "DEMO_INVITATION", { channel: "WHATSAPP" });

      expect(whatsapp.trySendMessage).toHaveBeenCalledWith({ template, text: "Rendered for WhatsApp", to: "919876543210" });
      expect(result).toMatchObject({ error: 'Template "demo_invite": Template name does not exist', sent: false });
    });
  });
});

import type { JwtService } from "@nestjs/jwt";
import type { MessagingRule } from "@prisma/client";
import type { MailService } from "../mail/mail.service";
import type { PrismaService } from "../prisma/prisma.service";
import { runInTenant } from "../tenancy/tenant-context";
import type { WhatsAppService } from "../whatsapp/whatsapp.service";
import { MessagingRuleService } from "./messaging-rule.service";

// Approved WhatsApp templates on a messaging rule: the same validation and the same send path
// as system messages (@nexa-chess/types whatsapp-template.ts, WhatsAppService.trySendMessage).

const ADMIN = { email: "admin@example.com", id: "admin_1", phoneNumber: "+919876543210", tenantId: "tenant_nexa" };

const rule = (overrides: Partial<MessagingRule> = {}): MessagingRule =>
  ({
    audience: "STUDENTS",
    body: "Hi {{recipient.firstName}}, your class {{class.title}} starts soon.",
    createdAt: new Date(),
    emailEnabled: false,
    enabled: true,
    event: "CLASS_REMINDER",
    id: "rule_1",
    inAppEnabled: true,
    leadTimeMinutes: 60,
    scheduleDayOfWeek: null,
    scheduleHour: null,
    scheduleMinute: null,
    scheduleMode: "IMMEDIATE",
    tenantId: "tenant_nexa",
    title: "Class soon",
    updatedAt: new Date(),
    updatedById: null,
    weekdaysOnly: false,
    whatsappEnabled: true,
    whatsappTemplateLanguage: null,
    whatsappTemplateName: null,
    whatsappTemplateParams: [],
    ...overrides
  }) as MessagingRule;

describe("MessagingRuleService: WhatsApp templates", () => {
  let prisma: {
    messageDelivery: { create: jest.Mock };
    messagingRule: { findUnique: jest.Mock; update: jest.Mock };
  };
  let whatsapp: { isConfigured: jest.Mock; normalizeRecipient: jest.Mock; trySendMessage: jest.Mock };
  let service: MessagingRuleService;

  const inTenant = <T>(fn: () => Promise<T>) => runInTenant("tenant_nexa", "spec", fn);

  beforeEach(() => {
    prisma = {
      messageDelivery: { create: jest.fn().mockResolvedValue({}) },
      messagingRule: {
        findUnique: jest.fn().mockResolvedValue(rule()),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...rule(), ...data, updatedBy: null }))
      }
    };
    whatsapp = {
      isConfigured: jest.fn().mockReturnValue(true),
      normalizeRecipient: jest.fn().mockReturnValue("919876543210"),
      trySendMessage: jest.fn().mockResolvedValue({ ok: true, result: { messageId: "wamid.1" } })
    };
    service = new MessagingRuleService(
      {} as JwtService,
      {} as MailService,
      prisma as unknown as PrismaService,
      whatsapp as unknown as WhatsAppService
    );
    jest.spyOn(service, "assertAdmin").mockResolvedValue(ADMIN as never);
  });

  it("saves a valid template, trimmed", async () => {
    await inTenant(() =>
      service.update("token", "CLASS_REMINDER", {
        whatsappTemplateLanguage: " en ",
        whatsappTemplateName: " class_reminder ",
        whatsappTemplateParams: [" {{recipient.firstName}} ", "{{class.title}}"]
      })
    );

    expect(prisma.messagingRule.update.mock.calls[0][0].data).toMatchObject({
      whatsappTemplateLanguage: "en",
      whatsappTemplateName: "class_reminder",
      whatsappTemplateParams: ["{{recipient.firstName}}", "{{class.title}}"]
    });
  });

  it("refuses an invalid template before writing anything", async () => {
    await expect(
      inTenant(() => service.update("token", "CLASS_REMINDER", { whatsappTemplateName: "Class Reminder!" }))
    ).rejects.toThrow(/lower-case letters/);
    await expect(
      inTenant(() =>
        service.update("token", "CLASS_REMINDER", {
          whatsappTemplateName: "class_reminder",
          whatsappTemplateParams: ["{{invoice.number}}"]
        })
      )
    ).rejects.toThrow(/can't fill \{\{invoice.number\}\}/);
    expect(prisma.messagingRule.update).not.toHaveBeenCalled();
  });

  it("checks a partial change against the saved template, and leaves the template alone when it isn't sent", async () => {
    prisma.messagingRule.findUnique.mockResolvedValue(rule({ whatsappTemplateName: "class_reminder" }));
    await expect(
      inTenant(() => service.update("token", "CLASS_REMINDER", { whatsappTemplateLanguage: "english" }))
    ).rejects.toThrow(/language code/);

    await inTenant(() => service.update("token", "CLASS_REMINDER", { title: "New title" }));
    const data = prisma.messagingRule.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("whatsappTemplateName");
    expect(data).not.toHaveProperty("whatsappTemplateParams");
  });

  it("tests WhatsApp through the rule's template with sample values, and logs the template on the delivery", async () => {
    prisma.messagingRule.findUnique.mockResolvedValue(
      rule({ whatsappTemplateName: "class_reminder", whatsappTemplateParams: ["{{recipient.firstName}}"] })
    );

    const result = await inTenant(() => service.testRule("token", "CLASS_REMINDER", { channel: "WHATSAPP" }));

    expect(result.sent).toBe(true);
    const [message] = whatsapp.trySendMessage.mock.calls[0];
    expect(message).toMatchObject({ template: { language: "en_US", name: "class_reminder" }, to: "919876543210" });
    expect(message.template.bodyParams).toEqual([expect.any(String)]);
    expect(prisma.messageDelivery.create.mock.calls[0][0].data).toMatchObject({ templateName: "class_reminder" });
  });

  it("tests free text when the rule has no template", async () => {
    await inTenant(() => service.testRule("token", "CLASS_REMINDER", { channel: "WHATSAPP" }));

    expect(whatsapp.trySendMessage.mock.calls[0][0]).toMatchObject({ template: null, to: "919876543210" });
  });
});

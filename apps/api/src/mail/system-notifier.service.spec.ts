import type { SystemMessageChannel } from "@nexa-chess/types";
import type { NotificationService } from "../notification/notification.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { WhatsAppService } from "../whatsapp/whatsapp.service";
import type { MailService } from "./mail.service";
import type { SystemMessageRenderer } from "./system-message-renderer.service";
import { SystemNotifier } from "./system-notifier.service";

describe("SystemNotifier", () => {
  let mail: { sendRenderedSystemEmail: jest.Mock };
  let notify: jest.Mock;
  let trySendMessage: jest.Mock;
  let renderAll: jest.Mock;
  let notifier: SystemNotifier;

  const rendered = (channels: SystemMessageChannel[], action: { label: string; url: string } | null = null) => ({
    action,
    body: "**Body**",
    channels,
    subject: "Subject",
    whatsapp: "WhatsApp *text*",
    whatsappTemplate: null as { name: string; language: string; bodyParams: string[] } | null
  });

  beforeEach(() => {
    mail = { sendRenderedSystemEmail: jest.fn().mockResolvedValue(undefined) };
    notify = jest.fn().mockResolvedValue(undefined);
    trySendMessage = jest.fn().mockResolvedValue({ ok: true });
    renderAll = jest.fn().mockResolvedValue(rendered(["EMAIL", "WHATSAPP", "IN_APP"]));
    notifier = new SystemNotifier(
      mail as unknown as MailService,
      { notify } as unknown as NotificationService,
      {} as PrismaService,
      { renderAll } as unknown as SystemMessageRenderer,
      { trySendMessage } as unknown as WhatsAppService
    );
  });

  it("sends on every switched-on channel the recipient can be reached on", async () => {
    const result = await notifier.send("EMAIL_CHANGED", { email: "a@x.test", phone: "+919876543210", userId: "u1" }, {});

    expect(mail.sendRenderedSystemEmail).toHaveBeenCalledWith("a@x.test", expect.objectContaining({ subject: "Subject" }), null);
    expect(trySendMessage).toHaveBeenCalledWith({ template: null, text: "WhatsApp _text_", to: "+919876543210" });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ body: "**Body**", linkPath: "/profile", title: "Subject", type: "SYSTEM_MESSAGE", userId: "u1" })
    );
    expect(result.outcomes).toEqual({ EMAIL: "SENT", IN_APP: "SENT", WHATSAPP: "SENT" });
  });

  it("skips a channel that is switched off, or that the recipient has no contact for", async () => {
    renderAll.mockResolvedValue(rendered(["EMAIL"]));
    const result = await notifier.send("EMAIL_CHANGED", { phone: "+919876543210", userId: "u1" }, {});

    expect(mail.sendRenderedSystemEmail).not.toHaveBeenCalled();
    expect(trySendMessage).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(result.outcomes).toEqual({ EMAIL: "SKIPPED", IN_APP: "SKIPPED", WHATSAPP: "SKIPPED" });
  });

  it("uses a person's own channel choice, but never a channel the message doesn't support", async () => {
    renderAll.mockResolvedValue(rendered(["EMAIL"]));
    await notifier.send(
      "ACCOUNT_ACCESS",
      { email: "s@x.test", phone: "+919876543210", userId: "u1" },
      {},
      { channels: ["WHATSAPP", "IN_APP"] }
    );

    expect(trySendMessage).toHaveBeenCalled();
    expect(mail.sendRenderedSystemEmail).not.toHaveBeenCalled();
    // ACCOUNT_ACCESS carries a one-time link, so it never goes in-app.
    expect(notify).not.toHaveBeenCalled();
  });

  it("sends the academy's approved template instead of free text when it set one", async () => {
    const template = { bodyParams: ["Asha", "https://nexa.test/demo/1"], language: "en", name: "demo_invite" };
    renderAll.mockResolvedValue({ ...rendered(["WHATSAPP"]), whatsappTemplate: template });

    await notifier.send("DEMO_INVITATION", { phone: "+919876543210" }, {});

    expect(trySendMessage).toHaveBeenCalledWith({ template, text: "WhatsApp _text_", to: "+919876543210" });
  });

  it("names the template in a failure, so the log says which one Meta refused", async () => {
    renderAll.mockResolvedValue({
      ...rendered(["WHATSAPP"]),
      whatsappTemplate: { bodyParams: [], language: "en", name: "demo_invite" }
    });
    trySendMessage.mockResolvedValue({ error: { message: "Template name does not exist" }, ok: false });

    const result = await notifier.send("DEMO_INVITATION", { phone: "+919876543210" }, {});

    expect(result.errors.WHATSAPP).toBe('template "demo_invite": Template name does not exist');
  });

  it("opens the action link in-app when it has one", async () => {
    renderAll.mockResolvedValue(rendered(["IN_APP"], { label: "Open", url: "https://nexa.test/admin/platform?tab=integrity" }));
    await notifier.send("TENANT_INTEGRITY_ALERT", { userId: "op1" }, {}, { dedupeKey: "run-1" });

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ dedupeKey: "TENANT_INTEGRITY_ALERT:run-1", linkPath: "/admin/platform?tab=integrity" })
    );
  });

  it("never throws: a failed channel is reported and the others still go", async () => {
    mail.sendRenderedSystemEmail.mockRejectedValue(new Error("SMTP is not configured."));
    trySendMessage.mockResolvedValue({ error: new Error("bad number"), ok: false });

    const result = await notifier.send("EMAIL_CHANGED", { email: "a@x.test", phone: "1", userId: "u1" }, {});

    expect(result.outcomes).toEqual({ EMAIL: "FAILED", IN_APP: "SENT", WHATSAPP: "FAILED" });
    expect(result.errors).toEqual({ EMAIL: "SMTP is not configured.", WHATSAPP: "bad number" });
  });
});

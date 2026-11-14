import { createHmac } from "node:crypto";
import { buildInteractivePayload } from "../whatsapp/whatsapp.utils";
import { formatSupportReference } from "./support-tickets.service";
import { toTemplateParam } from "./support-admin.service";
import { wasRedacted } from "./support-conversation.service";
import { parseWhatsAppWebhook, verifyWhatsAppSignature } from "./whatsapp-webhook.parse";

const SECRET = "app-secret";
const sign = (body: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

function webhook(value: Record<string, unknown>) {
  return {
    entry: [{ changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "PNID" }, ...value } }], id: "WABA" }],
    object: "whatsapp_business_account"
  };
}

describe("verifyWhatsAppSignature", () => {
  const body = JSON.stringify(webhook({}));

  it("accepts the app secret's HMAC over the exact bytes", () => {
    expect(verifyWhatsAppSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects another secret, changed bytes, a missing or malformed header", () => {
    expect(verifyWhatsAppSignature(body, sign(body, "other"), SECRET)).toBe(false);
    expect(verifyWhatsAppSignature(`${body} `, sign(body), SECRET)).toBe(false);
    expect(verifyWhatsAppSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyWhatsAppSignature(body, "sha1=abc", SECRET)).toBe(false);
    expect(verifyWhatsAppSignature(body, "sha256=zz", SECRET)).toBe(false);
    expect(verifyWhatsAppSignature(body, sign(body), "")).toBe(false);
  });
});

describe("parseWhatsAppWebhook", () => {
  it("reads a text message with the sender's profile name", () => {
    const events = parseWhatsAppWebhook(
      webhook({
        contacts: [{ profile: { name: "Priya" }, wa_id: "919876543210" }],
        messages: [{ from: "919876543210", id: "wamid.A", text: { body: "Hi" }, timestamp: "1700000000", type: "text" }]
      })
    );
    expect(events).toEqual([
      {
        dedupeKey: "msg:wamid.A",
        kind: "message",
        messageType: "text",
        occurredAt: new Date(1700000000 * 1000),
        phoneNumberId: "PNID",
        profileName: "Priya",
        redacted: false,
        replyId: null,
        text: "Hi",
        waId: "919876543210",
        wamid: "wamid.A"
      }
    ]);
  });

  it("reads button and list taps by id, and media as unreadable", () => {
    const events = parseWhatsAppWebhook(
      webhook({
        messages: [
          { from: "91", id: "w1", interactive: { button_reply: { id: "confirm.send", title: "Send" }, type: "button_reply" }, type: "interactive" },
          { from: "91", id: "w2", interactive: { list_reply: { id: "menu.refund", title: "Refund request" }, type: "list_reply" }, type: "interactive" },
          { from: "91", id: "w3", image: { id: "media" }, type: "image" }
        ]
      })
    );
    expect(events.map((event) => event.kind === "message" && [event.replyId, event.text, event.messageType])).toEqual([
      ["confirm.send", "Send", "interactive"],
      ["menu.refund", "Refund request", "interactive"],
      [null, null, "image"]
    ]);
  });

  it("redacts a card number before it is ever stored", () => {
    const [event] = parseWhatsAppWebhook(
      webhook({ messages: [{ from: "91", id: "w", text: { body: "card 4111111111111111" }, type: "text" }] })
    );
    expect(event).toMatchObject({ redacted: true, text: "card [card number removed]" });
    expect(wasRedacted(event.kind === "message" ? event.text : null)).toBe(true);
    expect(wasRedacted("nothing here")).toBe(false);
  });

  it("gives each status of a message its own dedupe key, with the error", () => {
    const events = parseWhatsAppWebhook(
      webhook({
        statuses: [
          { id: "wamid.B", recipient_id: "91", status: "delivered", timestamp: "1700000001" },
          { errors: [{ code: 131047, title: "Re-engagement message" }], id: "wamid.B", recipient_id: "91", status: "failed" }
        ]
      })
    );
    expect(events.map((event) => event.dedupeKey)).toEqual(["status:wamid.B:delivered", "status:wamid.B:failed"]);
    expect(events[1]).toMatchObject({ error: "131047: Re-engagement message", kind: "status" });
  });

  it("skips other objects, other fields and malformed entries without throwing", () => {
    expect(parseWhatsAppWebhook({ object: "page" })).toEqual([]);
    expect(parseWhatsAppWebhook(null)).toEqual([]);
    expect(
      parseWhatsAppWebhook({
        entry: [{ changes: [{ field: "account_update", value: {} }, { field: "messages", value: { messages: [{ id: "x" }] } }] }, "junk"],
        object: "whatsapp_business_account"
      })
    ).toEqual([]);
  });
});

describe("support helpers", () => {
  it("formats ticket references", () => {
    expect(formatSupportReference(2026, BigInt(123))).toBe("NXS-2026-000123");
  });

  it("flattens a reply into a valid template parameter", () => {
    expect(toTemplateParam("Hello\n\nthere   friend\t!")).toBe("Hello there friend !");
    expect(toTemplateParam("x".repeat(1000), 10)).toHaveLength(10);
  });

  it("builds Meta's button and list payloads within their limits", () => {
    const buttons = buildInteractivePayload(
      { body: "Send?", buttons: [{ id: "a", title: "A very long button title" }, { id: "b", title: "B" }, { id: "c", title: "C" }, { id: "d", title: "D" }], kind: "buttons", to: "91" },
      "91"
    );
    expect(buttons.interactive.type).toBe("button");
    const buttonAction = buttons.interactive.action as { buttons: { reply: { title: string } }[] };
    expect(buttonAction.buttons).toHaveLength(3);
    expect(buttonAction.buttons[0].reply.title).toHaveLength(20);

    const list = buildInteractivePayload(
      { body: "Pick", button: "Options", kind: "list", rows: [{ description: "d", id: "r1", title: "Row" }], to: "91" },
      "91"
    );
    expect(list).toMatchObject({
      interactive: { action: { button: "Options", sections: [{ rows: [{ description: "d", id: "r1", title: "Row" }] }] }, type: "list" },
      type: "interactive"
    });
  });
});

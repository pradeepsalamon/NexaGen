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
        adReferral: null,
        dedupeKey: "msg:wamid.A",
        kind: "message",
        media: null,
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

  it("keeps an image or a document's media id and details, never as bot text, and redacts its caption", () => {
    const events = parseWhatsAppWebhook(
      webhook({
        messages: [
          { from: "91", id: "m1", image: { caption: "paid, card 4111 1111 1111 1111", id: "img-1", mime_type: "image/jpeg" }, type: "image" },
          { document: { filename: "receipt.pdf", id: "doc-1", mime_type: "application/pdf" }, from: "91", id: "m2", type: "document" },
          { audio: { id: "voice-1", mime_type: "audio/ogg" }, from: "91", id: "m3", type: "audio" }
        ]
      })
    );
    const media = events.map((event) => (event.kind === "message" ? event.media : null));
    expect(media[0]).toMatchObject({ filename: null, id: "img-1", mimeType: "image/jpeg" });
    expect(media[0]?.caption).not.toContain("4111");
    expect(media[1]).toEqual({ caption: null, filename: "receipt.pdf", id: "doc-1", mimeType: "application/pdf" });
    expect(media[2]).toBeNull(); // voice notes aren't kept
    expect(events.every((event) => event.kind !== "message" || event.text === null)).toBe(true);
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

  it("reads a Click-to-WhatsApp ad's referral", () => {
    const [event] = parseWhatsAppWebhook(
      webhook({
        contacts: [{ profile: { name: "Priya" }, wa_id: "919876543210" }],
        messages: [
          {
            from: "919876543210",
            id: "wamid.AD",
            referral: {
              body: "Book a free class",
              ctwa_clid: "ARAkLkA8rmlFeiCktEJQ",
              headline: "Chess for kids",
              media_type: "image",
              source_id: "120210000000000001",
              source_type: "ad",
              source_url: "https://fb.me/abc"
            },
            text: { body: "Hello! Can I get more info on this?" },
            timestamp: "1700000000",
            type: "text"
          }
        ]
      })
    );
    expect(event).toMatchObject({
      adReferral: {
        ctwaClid: "ARAkLkA8rmlFeiCktEJQ",
        headline: "Chess for kids",
        sourceId: "120210000000000001",
        sourceType: "ad",
        sourceUrl: "https://fb.me/abc"
      },
      kind: "message"
    });
  });

  it("ignores an empty or malformed referral", () => {
    const parse = (referral: unknown) =>
      parseWhatsAppWebhook(
        webhook({ messages: [{ from: "919876543210", id: "wamid.R", referral, text: { body: "Hi" }, timestamp: "1700000000", type: "text" }] })
      )[0];
    expect(parse({})).toMatchObject({ adReferral: null });
    expect(parse("ad")).toMatchObject({ adReferral: null });
    expect(parse({ source_id: 42, source_type: "ad" })).toMatchObject({ adReferral: { sourceId: null, sourceType: "ad" } });
  });

  it("skips the WhatsApp Business app's coexistence echoes and syncs without error", () => {
    const echo = {
      entry: [
        {
          changes: [
            {
              field: "smb_message_echoes",
              value: {
                message_echoes: [{ from: "15550001111", id: "wamid.E", text: { body: "Staff reply" }, timestamp: "1700000000", to: "919876543210", type: "text" }],
                messaging_product: "whatsapp",
                metadata: { phone_number_id: "PNID" }
              }
            },
            { field: "smb_app_state_sync", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "PNID" }, state_sync: [{ type: "contact" }] } },
            { field: "history", value: { history: [{ threads: [] }], messaging_product: "whatsapp", metadata: { phone_number_id: "PNID" } } }
          ],
          id: "WABA"
        }
      ],
      object: "whatsapp_business_account"
    };
    expect(parseWhatsAppWebhook(echo)).toEqual([]);
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

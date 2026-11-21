import {
  ALLOWED_NUMBER,
  OTHER_ALLOWED_NUMBER,
  TEST_APP_SECRET,
  TEST_GRAPH_BASE,
  TEST_PHONE_NUMBER_ID,
  TEST_VERIFY_TOKEN,
  restoreWhatsAppEnv
} from "./whatsapp-env";
import { createHmac } from "node:crypto";
import { PassThrough } from "node:stream";
import { v2 as cloudinary } from "cloudinary";
import {
  API_ROUTES,
  DEFAULT_SUPPORT_MENU,
  DEFAULT_TENANT_ID,
  type LeadDetailResponse,
  type PersonalDataExport,
  type SupportContactExport,
  type SupportSavedReplyItem,
  type SupportUnansweredQuestionListResponse,
  type SupportAnalyticsResponse,
  type SupportLinkCodeResponse,
  type SupportTicketDetail,
  type SupportTicketListResponse
} from "@nexa-chess/types";
import { UserRole, type User } from "@prisma/client";
import { FrappeCrmPushService } from "../../../lead/frappe-crm-push.service";
import { LeadService } from "../../../lead/lead.service";
import { setTenantScopeModeForTesting } from "../../../prisma/tenant-scope.extension";
import { SupportAttachmentsService } from "../../../support/support-attachments.service";
import { SupportFollowUpService } from "../../../support/support-follow-up.service";
import { asPlatform, runInTenant } from "../../../tenancy/tenant-context";
import { createTestApp, type TestApp } from "../app";
import { createUser, resetDatabase } from "../db";

// The WhatsApp support bot end to end (docs/WHATSAPP_SUPPORT.md §11): signed
// webhooks into the real app and database, Meta's send API stubbed.

type Sent = { to: string; type: string; body: string };

/** The smallest valid PNG header: what the attachment check looks for. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

describe("WhatsApp support bot (real app, real Postgres)", () => {
  let t: TestApp;
  let admin: User;
  let student: User;
  let sent: Sent[];
  let wamid = 0;
  const realFetch = global.fetch;

  beforeAll(async () => {
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      // A customer's image: Meta's file, and the private copy read back for staff (both stubbed, never fetched).
      if (url.startsWith("https://media.int.test/") || url.startsWith("https://api.cloudinary.com/")) {
        return new Response(new Uint8Array(PNG), { status: 200 });
      }
      if (!url.startsWith(TEST_GRAPH_BASE)) return realFetch(input, init);
      if (!url.endsWith("/messages")) {
        const mediaId = url.split("/").pop();
        return new Response(JSON.stringify({ file_size: PNG.length, id: mediaId, mime_type: "image/png", url: `https://media.int.test/${mediaId}` }), {
          headers: { "Content-Type": "application/json" },
          status: 200
        });
      }
      expect(url).toBe(`${TEST_GRAPH_BASE}/v21.0/${TEST_PHONE_NUMBER_ID}/messages`);
      const payload = JSON.parse(String(init?.body)) as {
        interactive?: { body?: { text?: string }; type: string };
        template?: { name?: string };
        text?: { body?: string };
        to: string;
        type: string;
      };
      const body = payload.text?.body ?? payload.interactive?.body?.text ?? payload.template?.name ?? "";
      sent.push({ body, to: payload.to, type: payload.interactive?.type ?? payload.type });
      wamid += 1;
      return new Response(JSON.stringify({ messages: [{ id: `wamid.out.${wamid}` }], messaging_product: "whatsapp" }), {
        headers: { "Content-Type": "application/json" },
        status: 200
      });
    }) as typeof fetch;
    t = await createTestApp();
  });

  afterAll(async () => {
    global.fetch = realFetch;
    await t?.close();
    restoreWhatsAppEnv();
  });

  beforeEach(async () => {
    sent = [];
    await resetDatabase(t.prisma);
    const active = async (role: UserRole) => {
      const user = await createUser(t.prisma, role);
      return db(() => t.prisma.user.update({ data: { status: "ACTIVE" }, where: { id: user.id } }));
    };
    admin = await active(UserRole.ADMIN);
    student = await active(UserRole.STUDENT);
  });

  const db = <T>(fn: () => Promise<T>) => runInTenant(DEFAULT_TENANT_ID, "test:support", fn);

  let inbound = 0;
  function messageBody(from: string, message: Record<string, unknown>, id = `wamid.in.${++inbound}`) {
    return JSON.stringify({
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                contacts: [{ profile: { name: "Priya" }, wa_id: from }],
                messages: [{ from, id, timestamp: String(Math.floor(Date.now() / 1000)), ...message }],
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "919999999999", phone_number_id: TEST_PHONE_NUMBER_ID }
              }
            }
          ],
          id: "WABA"
        }
      ],
      object: "whatsapp_business_account"
    });
  }
  const textFrom = (from: string, body: string, id?: string) => messageBody(from, { text: { body }, type: "text" }, id);
  const tapFrom = (from: string, replyId: string) =>
    messageBody(from, { interactive: { button_reply: { id: replyId, title: replyId }, type: "button_reply" }, type: "interactive" });

  async function post(raw: string, signature = `sha256=${createHmac("sha256", TEST_APP_SECRET).update(raw).digest("hex")}`) {
    return fetch(`${t.baseUrl.replace("[::1]", "127.0.0.1")}${API_ROUTES.whatsappWebhook}`, {
      body: raw,
      headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature },
      method: "POST"
    });
  }

  /** Waits for every stored event to be handled (processing runs after the 200). */
  async function settle() {
    for (let i = 0; i < 100; i += 1) {
      const pending = await asPlatform("test", () =>
        t.prisma.whatsAppWebhookEvent.count({ where: { ignoredAt: null, processedAt: null } })
      );
      const outbox = await asPlatform("test", () => t.prisma.supportMessage.count({ where: { status: "PENDING" } }));
      if (pending === 0 && outbox === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("WhatsApp events were not processed in time.");
  }

  async function say(raw: string) {
    expect((await post(raw)).status).toBe(200);
    await settle();
  }

  it("answers Meta's subscription handshake only with the verify token", async () => {
    const base = `${t.baseUrl.replace("[::1]", "127.0.0.1")}${API_ROUTES.whatsappWebhook}`;
    const ok = await fetch(`${base}?hub.mode=subscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=1158201444`);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("1158201444");
    const bad = await fetch(`${base}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`);
    expect(bad.status).toBe(403);
  });

  it("refuses an unsigned or wrongly signed body and stores nothing", async () => {
    const raw = textFrom(ALLOWED_NUMBER, "hi");
    expect((await post(raw, "sha256=00")).status).toBe(401);
    expect((await post(raw, "")).status).toBe(401);
    expect(await asPlatform("test", () => t.prisma.whatsAppWebhookEvent.count())).toBe(0);
  });

  it("runs a refund request from greeting to ticket, and tells the admins", async () => {
    await say(textFrom(ALLOWED_NUMBER, "Hello"));
    expect(sent).toEqual([expect.objectContaining({ to: ALLOWED_NUMBER, type: "list" })]);
    expect(sent[0].body).toContain("Nexa Chess");

    await say(textFrom(ALLOWED_NUMBER, "2"));
    await say(textFrom(ALLOWED_NUMBER, "Asha Menon"));
    await say(textFrom(ALLOWED_NUMBER, "March batch, paid 2 March, ref pay_123, my card 4111 1111 1111 1111"));
    await say(tapFrom(ALLOWED_NUMBER, "confirm.send"));

    const ticket = await db(() => t.prisma.supportTicket.findFirstOrThrow({ include: { conversation: true } }));
    expect(ticket).toMatchObject({ category: "REFUND", handoff: false, status: "OPEN", studentName: "Asha Menon" });
    expect(ticket.reference).toMatch(/^NXS-\d{4}-\d{6}$/);
    expect(ticket.details).toContain("[card number removed]");
    expect(ticket.details).not.toContain("4111");
    expect(ticket.conversation.status).toBe("WAITING_AGENT");
    expect(sent.at(-1)?.body).toContain(ticket.reference);
    // The card number warning went out before the confirm step.
    expect(sent.some((message) => message.body.includes("removed a card number"))).toBe(true);

    const notice = await db(() => t.prisma.notification.findFirst({ where: { userId: admin.id } }));
    expect(notice?.title).toContain(ticket.reference);
    expect(notice?.linkPath).toBe(`/admin/support/tickets/${ticket.id}`);

    // Waiting for staff: the bot stays quiet, the ticket rises to the top.
    sent = [];
    await say(textFrom(ALLOWED_NUMBER, "any update?"));
    expect(sent).toEqual([]);
    const transcript = await db(() => t.prisma.supportMessage.count({ where: { conversationId: ticket.conversationId, direction: "INBOUND" } }));
    expect(transcript).toBe(6);
  });

  it("acts on a retried webhook once", async () => {
    const raw = textFrom(ALLOWED_NUMBER, "hi", "wamid.same");
    expect((await post(raw)).status).toBe(200);
    expect((await post(raw)).status).toBe(200);
    await settle();
    expect(await db(() => t.prisma.whatsAppWebhookEvent.count())).toBe(1);
    expect(await db(() => t.prisma.supportMessage.count({ where: { direction: "INBOUND" } }))).toBe(1);
    expect(sent).toHaveLength(1);
  });

  it("keeps one conversation when two messages from one number arrive together", async () => {
    await say(textFrom(ALLOWED_NUMBER, "hi"));
    const [a, b] = await Promise.all([post(textFrom(ALLOWED_NUMBER, "1")), post(textFrom(ALLOWED_NUMBER, "Asha Menon"))]);
    expect([a.status, b.status]).toEqual([200, 200]);
    await settle();
    const conversations = await db(() => t.prisma.supportConversation.findMany());
    expect(conversations).toHaveLength(1);
    expect(await db(() => t.prisma.supportMessage.count({ where: { direction: "INBOUND" } }))).toBe(3);
  });

  it("records but never answers a number outside the test allowlist", async () => {
    await say(textFrom("919111111111", "hi"));
    const event = await db(() => t.prisma.whatsAppWebhookEvent.findFirstOrThrow());
    expect(event.ignoredAt).not.toBeNull();
    expect(await db(() => t.prisma.supportConversation.count())).toBe(0);
    expect(sent).toEqual([]);
  });

  it("moves delivery status forward only, and STOP opts the number out", async () => {
    await say(textFrom(ALLOWED_NUMBER, "hi"));
    const out = await db(() => t.prisma.supportMessage.findFirstOrThrow({ where: { direction: "OUTBOUND" } }));
    const status = (state: string) =>
      JSON.stringify({
        entry: [
          {
            changes: [
              {
                field: "messages",
                value: {
                  metadata: { phone_number_id: TEST_PHONE_NUMBER_ID },
                  statuses: [{ id: out.providerMessageId, recipient_id: ALLOWED_NUMBER, status: state, timestamp: "1700000000" }]
                }
              }
            ]
          }
        ],
        object: "whatsapp_business_account"
      });
    await say(status("read"));
    await say(status("delivered"));
    expect((await db(() => t.prisma.supportMessage.findUniqueOrThrow({ where: { id: out.id } }))).status).toBe("READ");

    await say(textFrom(ALLOWED_NUMBER, "STOP"));
    const contact = await db(() => t.prisma.whatsAppContact.findFirstOrThrow({ where: { waId: ALLOWED_NUMBER } }));
    expect(contact.optedOutAt).not.toBeNull();

    // A messaging-rule message gets the same news: read implies delivered, a late failure marks it FAILED.
    const delivery = (providerMessageId: string) =>
      db(() =>
        t.prisma.messageDelivery.create({
          data: { body: "Class at 5", channel: "WHATSAPP", event: "ANNOUNCEMENT", providerMessageId, recipientPhone: ALLOWED_NUMBER, status: "SENT" }
        })
      );
    const ruleStatus = (providerMessageId: string, state: string) =>
      status(state).replace(String(out.providerMessageId), providerMessageId);
    const read = await delivery("wamid.rule.read");
    const failed = await delivery("wamid.rule.failed");
    await say(ruleStatus("wamid.rule.read", "read"));
    await say(ruleStatus("wamid.rule.failed", "failed"));
    const [readRow, failedRow] = await db(() =>
      Promise.all([read, failed].map((row) => t.prisma.messageDelivery.findUniqueOrThrow({ where: { id: row.id } })))
    );
    expect([readRow.status, Boolean(readRow.deliveredAt), Boolean(readRow.readAt)]).toEqual(["SENT", true, true]);
    expect(failedRow.status).toBe("FAILED");
    expect(failedRow.error).toMatch(/^WhatsApp couldn't deliver it/);
  });

  describe("staff inbox", () => {
    async function handoff(from = ALLOWED_NUMBER) {
      await say(textFrom(from, "hi"));
      await say(textFrom(from, "agent"));
      return db(() => t.prisma.supportTicket.findFirstOrThrow({ where: { contact: { waId: from } } }));
    }

    it("lists, opens, replies, notes and resolves a ticket", async () => {
      const ticket = await handoff();
      await handoff(OTHER_ALLOWED_NUMBER);

      const list = await t.call(admin, "GET", `${API_ROUTES.adminSupport.tickets}?status=OPEN&search=${ALLOWED_NUMBER}`);
      expect(list.status).toBe(200);
      const items = (list.body as SupportTicketListResponse).items;
      expect(items.map((item) => item.id)).toEqual([ticket.id]);
      expect(items[0]).toMatchObject({ category: "OTHER", conversationStatus: "WAITING_AGENT", handoff: true });

      const counts = await t.call(admin, "GET", API_ROUTES.adminSupport.counts);
      expect(counts.body).toEqual({ IN_PROGRESS: 0, OPEN: 2, RESOLVED: 0 });

      sent = [];
      const reply = await t.call(admin, "POST", API_ROUTES.adminSupport.reply(ticket.id), { body: "Hi Priya, how can I help?" });
      expect(reply.status).toBe(201);
      expect(reply.body).toMatchObject({ author: "AGENT", status: "SENT" });
      expect(sent).toEqual([{ body: "Hi Priya, how can I help?", to: ALLOWED_NUMBER, type: "text" }]);

      // A person owns the conversation now: the bot says nothing.
      sent = [];
      await say(textFrom(ALLOWED_NUMBER, "menu"));
      expect(sent).toEqual([]);

      const note = await t.call(admin, "POST", API_ROUTES.adminSupport.notes(ticket.id), { body: "Called the parent." });
      expect(note.status).toBe(201);

      const resolved = await t.call(admin, "PATCH", API_ROUTES.adminSupport.ticket(ticket.id), { status: "RESOLVED" });
      expect(resolved.status).toBe(200);
      const detail = resolved.body as SupportTicketDetail;
      expect(detail).toMatchObject({ assignedTo: { id: admin.id }, conversationStatus: "CLOSED", status: "RESOLVED" });
      expect(detail.events.map((event) => event.kind)).toEqual(["HANDOFF", "NOTE", "STATUS_CHANGED"]);

      const messages = await t.call(admin, "GET", `${API_ROUTES.adminSupport.messages(ticket.id)}?limit=2`);
      expect(messages.status).toBe(200);
      const page = messages.body as { items: { author: string }[]; nextCursor: string | null };
      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).not.toBeNull();

      // The next message starts a fresh conversation with a greeting.
      sent = [];
      await say(textFrom(ALLOWED_NUMBER, "thanks"));
      expect(sent[0]).toMatchObject({ type: "list" });

      // Who had the conversation, in order (plan §5.2).
      const changes = await db(() =>
        t.prisma.supportConversationEvent.findMany({ orderBy: { createdAt: "asc" }, where: { conversationId: ticket.conversationId } })
      );
      expect(changes.map((change) => [change.fromStatus, change.toStatus, change.reason, change.actorId])).toEqual([
        ["BOT", "WAITING_AGENT", "HANDOFF", null],
        ["WAITING_AGENT", "AGENT", "STAFF_REPLY", admin.id],
        ["AGENT", "CLOSED", "TICKET_RESOLVED", admin.id]
      ]);

      const analytics = await t.call(admin, "GET", `${API_ROUTES.adminSupport.analytics}?days=7&tz=Asia/Kolkata`);
      expect(analytics.status).toBe(200);
      const summary = analytics.body as SupportAnalyticsResponse;
      expect(summary).toMatchObject({ conversations: 3, days: 7, handedToStaff: 2, tickets: { opened: 2, resolved: 1 } });
      expect(summary.firstReply).toMatchObject({ answered: 1, waiting: 1 });
      expect(summary.daily).toHaveLength(8);
      expect(summary.daily.reduce((sum, day) => sum + day.handoffs, 0)).toBe(2);
      expect((await t.call(admin, "GET", `${API_ROUTES.adminSupport.analytics}?days=12`)).status).toBe(400);
      expect((await t.call(admin, "GET", `${API_ROUTES.adminSupport.analytics}?tz=Mars/Base`)).status).toBe(400);
    });

    it("keeps an image a parent sends for staff, never reads it, and deletes the copy with the contact", async () => {
      // Fake storage credentials and a stubbed upload: nothing reaches a real Cloudinary account.
      const saved = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].map((key) => [key, process.env[key]] as const);
      Object.assign(process.env, { CLOUDINARY_API_KEY: "int-key", CLOUDINARY_API_SECRET: "int-secret", CLOUDINARY_CLOUD_NAME: "int-cloud" });
      cloudinary.config({ api_key: "int-key", api_secret: "int-secret", cloud_name: "int-cloud" });
      const upload = jest.spyOn(cloudinary.uploader, "upload_stream").mockImplementation(((options: { public_id: string }, done: (error: unknown, result: unknown) => void) => {
        const stream = new PassThrough();
        stream.on("finish", () => done(undefined, { bytes: PNG.length, public_id: options.public_id }));
        stream.resume();
        return stream;
      }) as never);
      const destroy = jest.spyOn(cloudinary.uploader, "destroy").mockResolvedValue({ result: "ok" } as never);
      try {
        const ticket = await handoff();
        sent = [];
        await say(messageBody(ALLOWED_NUMBER, { image: { caption: "fees paid", id: "img-1", mime_type: "image/png" }, type: "image" }));
        expect(sent).toEqual([]); // staff have it: the bot stays quiet
        const attachment = await db(() => t.prisma.supportAttachment.findFirstOrThrow());
        expect(attachment).toMatchObject({ bytes: PNG.length, mediaId: "img-1", mimeType: "image/png", status: "STORED" });
        expect(attachment.storageKey).toContain(`support/${attachment.id}`);

        const page = await t.call(admin, "GET", API_ROUTES.adminSupport.messages(ticket.id));
        const items = (page.body as { items: Array<{ body: string; attachment: unknown }> }).items;
        expect(items.find((item) => item.attachment)).toMatchObject({ attachment: { id: attachment.id, kind: "image", status: "STORED" }, body: "[Image] fees paid" });
        expect((await t.call(admin, "GET", API_ROUTES.adminSupport.attachment(attachment.id))).status).toBe(200);
        expect((await t.call(student, "GET", API_ROUTES.adminSupport.attachment(attachment.id))).status).toBe(403);

        // While the bot has the conversation it thanks the parent but never reads the file.
        await say(textFrom(OTHER_ALLOWED_NUMBER, "hi"));
        sent = [];
        await say(messageBody(OTHER_ALLOWED_NUMBER, { image: { id: "img-2", mime_type: "image/png" }, type: "image" }));
        expect(sent[0]?.body).toContain("kept your file for our team");

        // Erasing the contact leaves the file without a message; the sweep deletes the copy, then the row.
        const owner = await db(async () => {
          const user = await createUser(t.prisma, UserRole.SUPER_ADMIN);
          return t.prisma.user.update({ data: { status: "ACTIVE" }, where: { id: user.id } });
        });
        expect((await t.call(owner, "DELETE", API_ROUTES.adminSupport.contact(ticket.contactId))).status).toBe(200);
        const removed = await db(() => t.app.get(SupportAttachmentsService).removeOrphans());
        expect(removed).toBe(1);
        expect(destroy).toHaveBeenCalledWith(attachment.storageKey, { resource_type: "raw", type: "authenticated" });
        expect(await db(() => t.prisma.supportAttachment.count({ where: { id: attachment.id } }))).toBe(0);
      } finally {
        upload.mockRestore();
        destroy.mockRestore();
        for (const [key, value] of saved) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    });

    it("exports a contact's data, and a super admin erases it (keeping only a STOP)", async () => {
      const ticket = await handoff();
      const exported = await t.call(admin, "GET", API_ROUTES.adminSupport.contactExport(ticket.contactId));
      expect(exported.status).toBe(200);
      const data = exported.body as SupportContactExport;
      expect(data.contact.waId).toBe(ALLOWED_NUMBER);
      expect(data.tickets.map((row) => row.reference)).toEqual([ticket.reference]);
      expect(data.conversations[0].messages.map((message) => message.direction)).toContain("INBOUND");

      // Erasing is for super admins only.
      expect((await t.call(admin, "DELETE", API_ROUTES.adminSupport.contact(ticket.contactId))).status).toBe(403);
      const owner = await db(async () => {
        const user = await createUser(t.prisma, UserRole.SUPER_ADMIN);
        return t.prisma.user.update({ data: { status: "ACTIVE" }, where: { id: user.id } });
      });
      const erased = await t.call(owner, "DELETE", API_ROUTES.adminSupport.contact(ticket.contactId));
      expect(erased.status).toBe(200);
      expect(erased.body).toMatchObject({ keptOptOut: false, tickets: 1 });
      const left = await db(() =>
        Promise.all([
          t.prisma.whatsAppContact.count({ where: { waId: ALLOWED_NUMBER } }),
          t.prisma.supportTicket.count(),
          t.prisma.supportMessage.count(),
          t.prisma.whatsAppWebhookEvent.count({ where: { waId: ALLOWED_NUMBER } }),
          t.prisma.supportContactErasure.count({ where: { contactId: ticket.contactId, erasedById: owner.id } })
        ])
      );
      expect(left).toEqual([0, 0, 0, 0, 1]);

      // A number that said STOP stays, bare, so automatic messages stay off.
      const other = await handoff(OTHER_ALLOWED_NUMBER);
      await say(textFrom(OTHER_ALLOWED_NUMBER, "STOP"));
      const keep = await t.call(owner, "DELETE", API_ROUTES.adminSupport.contact(other.contactId));
      expect(keep.body).toMatchObject({ keptOptOut: true });
      const bare = await db(() => t.prisma.whatsAppContact.findFirstOrThrow({ where: { waId: OTHER_ALLOWED_NUMBER } }));
      expect([bare.profileName, bare.optedOutAt === null]).toEqual([null, false]);
      expect(await db(() => t.prisma.supportConversation.count({ where: { contactId: bare.id } }))).toBe(0);
    });

    it("returns a conversation to the bot", async () => {
      const ticket = await handoff();
      expect((await t.call(admin, "POST", API_ROUTES.adminSupport.takeOver(ticket.id))).status).toBe(201);
      const back = await t.call(admin, "POST", API_ROUTES.adminSupport.returnToBot(ticket.id));
      expect((back.body as SupportTicketDetail).conversationStatus).toBe("BOT");
      const reasons = await db(() =>
        t.prisma.supportConversationEvent.findMany({ orderBy: { createdAt: "asc" }, select: { reason: true }, where: { conversationId: ticket.conversationId } })
      );
      expect(reasons.map((row) => row.reason)).toEqual(["HANDOFF", "STAFF_TAKE_OVER", "STAFF_RETURN"]);
      sent = [];
      await say(textFrom(ALLOWED_NUMBER, "2"));
      expect(sent[0].body).toContain("student's name");
    });

    it("refuses a reply after the 24-hour window when no template is set", async () => {
      const ticket = await handoff();
      await db(() =>
        t.prisma.whatsAppContact.updateMany({ data: { lastInboundAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }, where: {} })
      );
      const reply = await t.call(admin, "POST", API_ROUTES.adminSupport.reply(ticket.id), { body: "Hello" });
      expect(reply.status).toBe(409);
    });

    it("is for admins only, and another academy's ticket is not found", async () => {
      const ticket = await handoff();
      expect((await t.call(student, "GET", API_ROUTES.adminSupport.tickets)).status).toBe(403);
      expect((await t.call(student, "GET", API_ROUTES.adminSupport.ticket(ticket.id))).status).toBe(403);

      const otherTenant = "tenant_int_support_other";
      await t.prisma.tenant.create({ data: { id: otherTenant, name: "Other", slug: "int-support-other" } });
      const otherTicket = await runInTenant(otherTenant, "test: other academy ticket", async () => {
        const contact = await t.prisma.whatsAppContact.create({ data: { waId: OTHER_ALLOWED_NUMBER } });
        const conversation = await t.prisma.supportConversation.create({ data: { contactId: contact.id, status: "WAITING_AGENT" } });
        return t.prisma.supportTicket.create({
          data: { category: "OTHER", contactId: contact.id, conversationId: conversation.id, dedupeKey: "other", reference: "NXS-2026-999999" }
        });
      });
      const otherAnswer = await runInTenant(otherTenant, "test: other academy answer", () =>
        t.prisma.supportSavedReply.create({ data: { body: "Theirs", title: "Theirs" } })
      );
      const otherQuestion = await runInTenant(otherTenant, "test: other academy question", () =>
        t.prisma.supportUnansweredQuestion.create({ data: { normalized: "theirs", text: "Theirs?" } })
      );
      setTenantScopeModeForTesting("enforce");
      try {
        for (const [method, path, body] of [
          ["GET", API_ROUTES.adminSupport.ticket(otherTicket.id), undefined],
          ["GET", API_ROUTES.adminSupport.messages(otherTicket.id), undefined],
          ["POST", API_ROUTES.adminSupport.reply(otherTicket.id), { body: "hi" }],
          ["POST", API_ROUTES.adminSupport.notes(otherTicket.id), { body: "hi" }],
          ["PATCH", API_ROUTES.adminSupport.ticket(otherTicket.id), { status: "RESOLVED" }],
          ["POST", API_ROUTES.adminSupport.takeOver(otherTicket.id), undefined],
          ["POST", API_ROUTES.adminSupport.returnToBot(otherTicket.id), undefined],
          ["PUT", API_ROUTES.adminSupport.savedReply(otherAnswer.id), ANSWER],
          ["DELETE", API_ROUTES.adminSupport.savedReply(otherAnswer.id), undefined],
          ["POST", API_ROUTES.adminSupport.dismissUnanswered(otherQuestion.id), undefined],
          ["GET", API_ROUTES.adminSupport.contactExport(otherTicket.contactId), undefined]
        ] as const) {
          expect({ path, status: (await t.call(admin, method, path, body)).status }).toEqual({ path, status: 404 });
        }
        // Erasing is super-admin only (an admin gets 403 first); even Nexa's super admin can't reach another academy's contact.
        const owner = await db(async () => {
          const user = await createUser(t.prisma, UserRole.SUPER_ADMIN);
          return t.prisma.user.update({ data: { status: "ACTIVE" }, where: { id: user.id } });
        });
        expect((await t.call(owner, "DELETE", API_ROUTES.adminSupport.contact(otherTicket.contactId))).status).toBe(404);
        const list = await t.call(admin, "GET", API_ROUTES.adminSupport.tickets);
        expect((list.body as SupportTicketListResponse).items.map((item) => item.id)).toEqual([ticket.id]);
        const answers = await t.call(admin, "GET", API_ROUTES.adminSupport.savedReplies);
        expect(answers.body).toEqual([]);
        const questions = await t.call(admin, "GET", API_ROUTES.adminSupport.unanswered);
        expect((questions.body as SupportUnansweredQuestionListResponse).items).toEqual([]);
      } finally {
        setTenantScopeModeForTesting(null);
      }
    });
  });

  describe("course enquiries, demo bookings and follow-ups", () => {
    it("answers a typed question from the saved answers, which admins manage", async () => {
      const created = await t.call(admin, "POST", API_ROUTES.adminSupport.savedReplies, ANSWER);
      expect(created.status).toBe(201);
      const answer = created.body as SupportSavedReplyItem;
      expect(answer).toMatchObject({ inBotMenu: true, keywords: ["fee", "price"], title: "Fees" });
      expect((await t.call(student, "GET", API_ROUTES.adminSupport.savedReplies)).status).toBe(403);
      expect((await t.call(admin, "POST", API_ROUTES.adminSupport.savedReplies, { ...ANSWER, title: "x".repeat(25) })).status).toBe(400);

      await say(textFrom(ALLOWED_NUMBER, "Hi, what are the fees?"));
      expect(sent.map((message) => message.body)).toEqual([
        expect.stringContaining("Nexa Chess"),
        ANSWER.body,
        expect.stringContaining("Anything else?")
      ]);

      const edited = await t.call(admin, "PUT", API_ROUTES.adminSupport.savedReply(answer.id), { ...ANSWER, showInBot: false });
      expect((edited.body as SupportSavedReplyItem).inBotMenu).toBe(false);
      sent = [];
      await say(textFrom(ALLOWED_NUMBER, "price?"));
      expect(sent.map((message) => message.body)).not.toContain(ANSWER.body);

      expect((await t.call(admin, "DELETE", API_ROUTES.adminSupport.savedReply(answer.id))).status).toBe(200);
      expect((await t.call(admin, "GET", API_ROUTES.adminSupport.savedReplies)).body).toEqual([]);
    });

    it("asks about a misspelling, and lists what it couldn't answer for admins", async () => {
      expect((await t.call(admin, "POST", API_ROUTES.adminSupport.savedReplies, ANSWER)).status).toBe(201);
      await say(textFrom(ALLOWED_NUMBER, "hi"));
      sent = [];
      await say(textFrom(ALLOWED_NUMBER, "prise?"));
      expect(sent).toEqual([expect.objectContaining({ body: 'Did you mean "Fees"?', type: "button" })]);
      await say(tapFrom(ALLOWED_NUMBER, "suggest.no"));
      // Asked twice by two parents, in different case: one row, counted twice.
      await say(textFrom(ALLOWED_NUMBER, "Do you teach in Tamil?"));
      await say(textFrom(OTHER_ALLOWED_NUMBER, "hi"));
      await say(textFrom(OTHER_ALLOWED_NUMBER, "do you teach in tamil"));

      const list = await t.call(admin, "GET", API_ROUTES.adminSupport.unanswered);
      expect(list.status).toBe(200);
      const items = (list.body as SupportUnansweredQuestionListResponse).items;
      expect(items.map((item) => [item.text, item.timesAsked])).toEqual([
        ["do you teach in tamil", 2],
        ["prise?", 1]
      ]);
      expect((await t.call(student, "GET", API_ROUTES.adminSupport.unanswered)).status).toBe(403);
      expect((await t.call(admin, "GET", `${API_ROUTES.adminSupport.unanswered}?page=0`)).status).toBe(400);

      expect((await t.call(admin, "POST", API_ROUTES.adminSupport.dismissUnanswered(items[0].id))).status).toBe(201);
      const after = (await t.call(admin, "GET", API_ROUTES.adminSupport.unanswered)).body as SupportUnansweredQuestionListResponse;
      expect(after.items.map((item) => item.text)).toEqual(["prise?"]);
      // Asked again: it comes back.
      await say(textFrom(ALLOWED_NUMBER, "menu"));
      await say(textFrom(ALLOWED_NUMBER, "1"));
      await say(textFrom(ALLOWED_NUMBER, "Do you teach in Tamil?"));
      const back = (await t.call(admin, "GET", API_ROUTES.adminSupport.unanswered)).body as SupportUnansweredQuestionListResponse;
      expect(back.items[0]).toMatchObject({ text: "Do you teach in Tamil?", timesAsked: 3 });
    });

    it("books a free demo: a WhatsApp lead, a linked ticket and one lead alert", async () => {
      await say(textFrom(ALLOWED_NUMBER, "hi"));
      await say(textFrom(ALLOWED_NUMBER, "1"));
      await say(tapFrom(ALLOWED_NUMBER, "course.demo"));
      await say(textFrom(ALLOWED_NUMBER, "Asha Menon"));
      await say(textFrom(ALLOWED_NUMBER, "9"));
      await say(tapFrom(ALLOWED_NUMBER, "demo.level.beginner"));
      await say(textFrom(ALLOWED_NUMBER, "Priya Menon"));
      await say(textFrom(ALLOWED_NUMBER, "Saturday morning"));
      await say(tapFrom(ALLOWED_NUMBER, "confirm.send"));

      const lead = await db(() => t.prisma.lead.findFirstOrThrow({ include: { activities: true } }));
      expect(lead).toMatchObject({
        experienceLevel: "beginner",
        parentName: "Priya Menon",
        phone: ALLOWED_NUMBER,
        source: "WhatsApp",
        studentAge: 9,
        studentName: "Asha Menon"
      });
      expect(lead.activities[0].description).toContain("Preferred time: Saturday morning");
      const ticket = await db(() => t.prisma.supportTicket.findFirstOrThrow());
      expect(ticket).toMatchObject({ category: "COURSE", leadId: lead.id, studentName: "Asha Menon" });
      expect(sent.at(-1)?.body).toContain(ticket.reference);

      // One alert: the lead one, not a second "support ticket" one.
      const notices = await db(() => t.prisma.notification.findMany({ where: { userId: admin.id } }));
      expect(notices).toHaveLength(1);
      expect(notices[0].title).toContain("Asha Menon");

      const detail = await t.call(admin, "GET", API_ROUTES.adminSupport.ticket(ticket.id));
      expect((detail.body as SupportTicketDetail).lead).toEqual({ id: lead.id, status: "NEW", studentName: "Asha Menon" });
      const leadDetail = await t.call(admin, "GET", API_ROUTES.adminLeads.get(lead.id));
      expect((leadDetail.body as LeadDetailResponse).lead.whatsappTicket).toEqual({ id: ticket.id, reference: ticket.reference });

      // Booking again from the same number adds to the lead instead of a twin.
      await say(textFrom(ALLOWED_NUMBER, "menu"));
      await say(textFrom(ALLOWED_NUMBER, "1"));
      await say(textFrom(ALLOWED_NUMBER, "book a demo"));
      for (const answer of ["Ravi Menon", "12", "3", "Priya Menon", "Sunday", "yes"]) await say(textFrom(ALLOWED_NUMBER, answer));
      expect(await db(() => t.prisma.lead.count())).toBe(1);
      expect(await db(() => t.prisma.leadActivity.count({ where: { activityType: "WHATSAPP_DEMO_REQUEST", leadId: lead.id } }))).toBe(1);
    });

    it("copies a new WhatsApp lead to Frappe CRM once, when the push is on", async () => {
      const push = t.app.get(FrappeCrmPushService);
      const config = jest.spyOn(push, "config").mockReturnValue({
        apiKey: "k",
        apiSecret: "s",
        countryCode: "91",
        leadSource: "Direct WhatsApp",
        leadStatus: "New Inquiry",
        stageSync: false,
        url: "https://crm.int.test",
        websiteLeadSource: "Website Form"
      });
      const crmCalls: { body: Record<string, unknown>; url: string }[] = [];
      const stub = global.fetch;
      global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (!url.startsWith("https://crm.int.test/")) return stub(input, init);
        // The look-up for a lead with the same number: Frappe has none.
        if (init?.method === "GET") return new Response(JSON.stringify({ data: [] }), { status: 200 });
        crmCalls.push({ body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>, url });
        return new Response(JSON.stringify({ data: { name: url.includes("CRM%20Lead") ? "CRM-LEAD-2026-00001" : "n1" } }), { status: 200 });
      }) as typeof fetch;
      try {
        await say(textFrom(ALLOWED_NUMBER, "hi"));
        await say(textFrom(ALLOWED_NUMBER, "1"));
        await say(textFrom(ALLOWED_NUMBER, "book a demo"));
        for (const answer of ["Ravi Menon", "12", "3", "Priya Menon", "Sunday", "yes"]) await say(textFrom(ALLOWED_NUMBER, answer));

        const lead = await db(() => t.prisma.lead.findFirstOrThrow({ include: { activities: true, crmPush: true } }));
        expect(lead.crmPush).toMatchObject({ externalId: "CRM-LEAD-2026-00001", status: "SENT" });
        expect(lead.activities.map((activity) => activity.activityType)).toContain("CRM_PUSHED");
        expect(crmCalls[0].body).toMatchObject({ first_name: "Priya Menon", mobile_no: `+${ALLOWED_NUMBER.replace(/\D/g, "")}`, source: "Direct WhatsApp" });
        expect(crmCalls[1].body).toMatchObject({ reference_docname: "CRM-LEAD-2026-00001", reference_doctype: "CRM Lead" });

        // The same parent again adds to the NexaGen lead; Frappe isn't sent a twin.
        await say(textFrom(ALLOWED_NUMBER, "menu"));
        await say(textFrom(ALLOWED_NUMBER, "1"));
        await say(textFrom(ALLOWED_NUMBER, "book a demo"));
        for (const answer of ["Asha Menon", "9", "1", "Priya Menon", "Monday", "yes"]) await say(textFrom(ALLOWED_NUMBER, answer));
        expect(crmCalls).toHaveLength(2);
        expect(await db(() => t.prisma.crmLeadPush.count())).toBe(1);
      } finally {
        global.fetch = stub;
        config.mockRestore();
      }
    });

    it("copies a website-form lead to Frappe CRM, and only adds a note when Frappe already has the number", async () => {
      const push = t.app.get(FrappeCrmPushService);
      const leads = t.app.get(LeadService);
      const config = jest.spyOn(push, "config").mockReturnValue({
        apiKey: "k",
        apiSecret: "s",
        countryCode: "91",
        leadSource: "Direct WhatsApp",
        leadStatus: "New Inquiry",
        stageSync: false,
        url: "https://crm.int.test",
        websiteLeadSource: "Website Form"
      });
      // A one-lead Frappe: it remembers the numbers it was sent and finds them again.
      const frappeNumbers: string[] = [];
      const posts: { body: Record<string, unknown>; url: string }[] = [];
      const stub = global.fetch;
      global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (!url.startsWith("https://crm.int.test/")) return stub(input, init);
        const answer = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });
        if (init?.method === "GET") {
          if (url.includes("/api/resource/FCRM%20Note")) return answer([]);
          return answer(frappeNumbers.some((number) => decodeURIComponent(url).includes(`%${number.slice(-10)}"`)) ? [{ name: "CRM-LEAD-2026-00009" }] : []);
        }
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        posts.push({ body, url });
        if (typeof body.mobile_no === "string") frappeNumbers.push(body.mobile_no);
        return answer({ name: url.includes("CRM%20Lead") ? "CRM-LEAD-2026-00009" : "n1" });
      }) as typeof fetch;
      const form = { experienceLevel: "beginner" as const, parentName: "Priya Menon", phone: "98765 43210", studentAge: 9, studentName: "Ravi Menon" };
      const sent = async (leadId: string) => {
        for (let i = 0; i < 50; i += 1) {
          const row = await db(() => t.prisma.crmLeadPush.findUnique({ where: { leadId } }));
          if (row?.status === "SENT") return row;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error(`The Frappe copy of ${leadId} was never sent.`);
      };
      try {
        const first = await db(() => leads.createLead(form, { sessionId: undefined }));
        expect(await sent(first.lead.id)).toMatchObject({ externalId: "CRM-LEAD-2026-00009" });
        expect(posts.map((post) => post.url.split("/api/resource/")[1])).toEqual(["CRM%20Lead", "FCRM%20Note"]);
        expect(posts[0].body).toMatchObject({ first_name: "Priya Menon", mobile_no: "+919876543210", source: "Website Form", student_name: "Ravi Menon" });

        // The same family fills the form again: Frappe keeps its one lead and gets a second note.
        const second = await db(() => leads.createLead({ ...form, studentName: "Asha Menon" }, { sessionId: undefined }));
        expect(await sent(second.lead.id)).toMatchObject({ externalId: "CRM-LEAD-2026-00009" });
        expect(posts.map((post) => post.url.split("/api/resource/")[1])).toEqual(["CRM%20Lead", "FCRM%20Note", "FCRM%20Note"]);
        expect(posts[2].body).toMatchObject({ reference_docname: "CRM-LEAD-2026-00009", title: "From NexaGen (website form)" });
        const activity = await db(() => t.prisma.leadActivity.findFirstOrThrow({ where: { activityType: "CRM_PUSHED", leadId: second.lead.id } }));
        expect(activity.title).toBe("Added to a Frappe CRM lead");
      } finally {
        global.fetch = stub;
        config.mockRestore();
      }
    });

    it("links a parent's number with a staff code, then tells only that number the next class", async () => {
      const settings = {
        accountAnswers: true,
        agentReplyTemplate: "",
        agentReplyTemplateLanguage: "en",
        botEnabled: true,
        hours: null,
        leadNudgeHours: 20,
        menu: DEFAULT_SUPPORT_MENU,
        outOfHoursMessage: "",
        staffReminderMinutes: 15,
        testNumbers: []
      };
      expect((await t.call(admin, "PUT", API_ROUTES.adminSupport.settings, settings)).status).toBe(200);
      const coach = await db(() => createUser(t.prisma, UserRole.COACH));
      const batch = await db(() =>
        t.prisma.batch.create({ data: { name: "Knights Tuesday", students: { create: { studentId: student.id } } } })
      );
      const startsAt = new Date(Date.now() + 26 * 60 * 60_000);
      await db(() =>
        t.prisma.coachClass.create({
          data: { batchId: batch.id, coachId: coach.id, endsAt: new Date(startsAt.getTime() + 3_600_000), startsAt, status: "SCHEDULED" }
        })
      );

      // Not linked yet: no account data, only how to link.
      await say(textFrom(ALLOWED_NUMBER, "hi"));
      sent = [];
      await say(textFrom(ALLOWED_NUMBER, "next class"));
      expect(sent.map((message) => message.body).join("\n")).toContain("isn't linked to a student yet");
      expect(sent.map((message) => message.body).join("\n")).not.toContain("Knights");

      // Only admins make codes, only for this academy's students.
      expect((await t.call(student, "POST", API_ROUTES.adminSupport.linkCodes, { studentId: student.id })).status).toBe(403);
      expect((await t.call(admin, "POST", API_ROUTES.adminSupport.linkCodes, { studentId: admin.id })).status).toBe(404);
      const made = await t.call(admin, "POST", API_ROUTES.adminSupport.linkCodes, { studentId: student.id });
      expect(made.status).toBe(200);
      const { code } = made.body as SupportLinkCodeResponse;
      expect(code).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/);
      expect(await db(() => t.prisma.supportLinkCode.count({ where: { codeHash: code } }))).toBe(0);

      sent = [];
      await say(textFrom(ALLOWED_NUMBER, `link ${code.toLowerCase().replace("-", "")}`));
      expect(sent.at(-1)?.body).toContain("now linked to");
      sent = [];
      await say(textFrom(ALLOWED_NUMBER, "Next class"));
      expect(sent.at(-1)?.body).toContain("(Knights Tuesday)");

      // The code is spent: another number can't reuse it.
      sent = [];
      await say(textFrom(OTHER_ALLOWED_NUMBER, `LINK ${code}`));
      expect(sent.at(-1)?.body).toContain("didn't work");
      sent = [];
      await say(textFrom(OTHER_ALLOWED_NUMBER, "next class"));
      expect(sent.at(-1)?.body).not.toContain("Knights");

      // Too many wrong codes: the number has to wait.
      for (let i = 0; i < 5; i += 1) await say(textFrom(OTHER_ALLOWED_NUMBER, "LINK ZZZZ-ZZZZ"));
      const another = (await t.call(admin, "POST", API_ROUTES.adminSupport.linkCodes, { studentId: student.id })).body as SupportLinkCodeResponse;
      sent = [];
      await say(textFrom(OTHER_ALLOWED_NUMBER, `LINK ${another.code}`));
      expect(sent.at(-1)?.body).toContain("Too many codes");

      // Staff see the link on the ticket page and can remove it.
      await say(textFrom(ALLOWED_NUMBER, "agent"));
      const ticket = await db(() => t.prisma.supportTicket.findFirstOrThrow({ where: { contact: { waId: ALLOWED_NUMBER } } }));
      const detail = (await t.call(admin, "GET", API_ROUTES.adminSupport.ticket(ticket.id))).body as SupportTicketDetail;
      expect(detail.contact.linkedStudents.map((link) => link.id)).toEqual([student.id]);
      // The student's own data export lists the linked number.
      const exported = await t.call(student, "GET", API_ROUTES.privacy.dataExport);
      expect((exported.body as PersonalDataExport).sections.whatsAppLinks).toEqual([expect.objectContaining({ whatsAppNumber: ALLOWED_NUMBER })]);
      const unlink = await t.call(admin, "DELETE", API_ROUTES.adminSupport.contactLink(detail.contact.id, student.id));
      expect(unlink.status).toBe(200);
      expect(await db(() => t.prisma.supportContactLink.count())).toBe(0);
      expect((await t.call(admin, "DELETE", API_ROUTES.adminSupport.contactLink(detail.contact.id, student.id))).status).toBe(404);
    });

    it("books a real demo time: a registration, the join link, and nothing left for staff", async () => {
      const coach = await db(() => createUser(t.prisma, UserRole.COACH));
      const schedule = await db(() =>
        t.prisma.demoSchedule.create({ data: { coachId: coach.id, slots: [], slug: "int-trial", topic: "Chess basics" } })
      );
      const startsAt = new Date(Date.now() + 2 * 24 * 60 * 60_000);
      const occurrence = (offsetMs: number) =>
        db(() =>
          t.prisma.coachClass.create({
            data: {
              coachId: coach.id,
              demoScheduleId: schedule.id,
              endsAt: new Date(startsAt.getTime() + offsetMs + 60 * 60_000),
              isDemo: true,
              startsAt: new Date(startsAt.getTime() + offsetMs),
              status: "SCHEDULED",
              topic: "Chess basics"
            }
          })
        );
      const first = await occurrence(0);
      const second = await occurrence(24 * 60 * 60_000);

      async function upToTime(from: string) {
        await say(textFrom(from, "hi"));
        await say(textFrom(from, "1"));
        await say(tapFrom(from, "course.demo"));
        for (const answer of ["Asha Menon", "9"]) await say(textFrom(from, answer));
        await say(tapFrom(from, "demo.level.beginner"));
        sent = [];
        await say(textFrom(from, "Priya Menon"));
        expect(sent.at(-1)).toMatchObject({ type: "list" });
      }

      await upToTime(ALLOWED_NUMBER);
      await say(tapFrom(ALLOWED_NUMBER, `demo.slot.${first.id}`));
      await say(tapFrom(ALLOWED_NUMBER, "confirm.send"));

      const lead = await db(() => t.prisma.lead.findFirstOrThrow({ where: { phone: ALLOWED_NUMBER } }));
      expect(lead).toMatchObject({ assignedClassId: first.id, status: "DEMO_SCHEDULED" });
      const registration = await db(() => t.prisma.demoClassRegistration.findFirstOrThrow({ where: { classId: first.id } }));
      expect(registration).toMatchObject({ leadId: lead.id, source: "LEAD" });
      expect(sent.at(-1)?.body).toContain("You're booked: free demo class on");
      expect(sent.at(-1)?.body).toContain(`/demo/${first.id}?invite=${registration.inviteToken}`);
      const ticket = await db(() => t.prisma.supportTicket.findFirstOrThrow({ where: { leadId: lead.id } }));
      expect(ticket.status).toBe("RESOLVED");
      const conversation = await db(() =>
        t.prisma.supportConversation.findFirstOrThrow({ include: { events: { orderBy: { createdAt: "asc" } } }, where: { id: ticket.conversationId } })
      );
      expect(conversation.status).toBe("BOT");
      expect(conversation.events.map((event) => event.reason)).toEqual(["HANDOFF", "DEMO_BOOKED"]);

      // The class is cancelled between the pick and the confirm: never "booked", staff fix the time.
      await upToTime(OTHER_ALLOWED_NUMBER);
      await say(tapFrom(OTHER_ALLOWED_NUMBER, `demo.slot.${second.id}`));
      await db(() => t.prisma.coachClass.update({ data: { status: "CANCELLED" }, where: { id: second.id } }));
      sent = [];
      await say(tapFrom(OTHER_ALLOWED_NUMBER, "confirm.send"));
      expect(sent.map((message) => message.body).join("\n")).not.toContain("You're booked");
      expect(sent.at(-1)?.body).toContain("Our team will message you here soon to fix a time.");
      const otherTicket = await db(() =>
        t.prisma.supportTicket.findFirstOrThrow({ where: { contact: { waId: OTHER_ALLOWED_NUMBER } } })
      );
      expect(otherTicket.status).toBe("OPEN");
      expect(await db(() => t.prisma.demoClassRegistration.count({ where: { classId: second.id } }))).toBe(0);
    });

    it("reminds admins about a request nobody answered, at most twice", async () => {
      const followUps = t.app.get(SupportFollowUpService);
      await say(textFrom(ALLOWED_NUMBER, "hi"));
      await say(textFrom(ALLOWED_NUMBER, "agent"));
      const ticket = await db(() => t.prisma.supportTicket.findFirstOrThrow());
      const before = await db(() => t.prisma.notification.count({ where: { userId: admin.id } }));

      expect(await followUps.remindStaff(new Date())).toBe(0); // too early
      expect(await followUps.remindStaff(new Date(Date.now() + 16 * 60_000))).toBe(1);
      expect(await followUps.remindStaff(new Date(Date.now() + 17 * 60_000))).toBe(0); // already sent
      expect(await followUps.remindStaff(new Date(Date.now() + 22.5 * 60 * 60_000))).toBe(1); // window closing
      expect(await followUps.remindStaff(new Date(Date.now() + 23 * 60 * 60_000))).toBe(0);
      const reminders = await db(() =>
        t.prisma.notification.findMany({ orderBy: { createdAt: "asc" }, skip: before, where: { userId: admin.id } })
      );
      expect(reminders.map((notice) => notice.title)).toEqual([
        expect.stringContaining(ticket.reference),
        expect.stringContaining(ticket.reference)
      ]);

      // A staff reply stops the reminders.
      await db(() => t.prisma.supportTicket.update({ data: { remindersSent: 0 }, where: { id: ticket.id } }));
      await t.call(admin, "POST", API_ROUTES.adminSupport.reply(ticket.id), { body: "Hello!" });
      expect(await followUps.remindStaff(new Date(Date.now() + 16 * 60_000))).toBe(0);
    });

    it("shows the academy's own main menu: hidden options, new order and titles", async () => {
      const base = {
        accountAnswers: false,
        agentReplyTemplate: "",
        agentReplyTemplateLanguage: "en",
        botEnabled: true,
        hours: null,
        leadNudgeHours: 20,
        outOfHoursMessage: "",
        staffReminderMinutes: 15,
        testNumbers: [ALLOWED_NUMBER]
      };
      const byCategory = Object.fromEntries(DEFAULT_SUPPORT_MENU.map((item) => [item.category, item]));
      const menu = [
        { ...byCategory.CLASS, title: "Class problem" },
        { ...byCategory.COURSE },
        { ...byCategory.REFUND, enabled: false },
        { ...byCategory.PAYMENT, enabled: false },
        { ...byCategory.TECH },
        { ...byCategory.OTHER }
      ];
      // The way to a person can't be switched off.
      const noPerson = menu.map((item) => (item.category === "OTHER" ? { ...item, enabled: false } : item));
      expect((await t.call(admin, "PUT", API_ROUTES.adminSupport.settings, { ...base, menu: noPerson })).status).toBe(400);
      const saved = await t.call(admin, "PUT", API_ROUTES.adminSupport.settings, { ...base, menu });
      expect(saved.status).toBe(200);
      expect((saved.body as { menu: unknown }).menu).toEqual(menu);

      sent = [];
      await say(textFrom(ALLOWED_NUMBER, "hi"));
      expect(sent[0]).toMatchObject({ type: "list" });
      expect(sent[0].body).toContain("(1–4)");
      // "1" is now the first visible option.
      sent = [];
      await say(textFrom(ALLOWED_NUMBER, "1"));
      expect(sent[0].body).toContain("student's name");
      const conversation = await db(() => t.prisma.supportConversation.findFirstOrThrow({ where: { status: { not: "CLOSED" } } }));
      expect(conversation.draft).toMatchObject({ category: "CLASS" });
      // A hidden option isn't guessed from words either.
      await say(textFrom(ALLOWED_NUMBER, "menu"));
      sent = [];
      await say(textFrom(ALLOWED_NUMBER, "I want a refund"));
      expect(sent[0].body).toContain("didn't get that");
    });

    it("outside the team's hours: the academy's away message after a hand-off, reminders wait", async () => {
      const followUps = t.app.get(SupportFollowUpService);
      // No open day at all: always outside hours, whatever time the suite runs.
      const settings = {
        accountAnswers: false,
        agentReplyTemplate: "",
        agentReplyTemplateLanguage: "en",
        botEnabled: true,
        hours: { days: [], timezone: "Asia/Kolkata" },
        leadNudgeHours: 20,
        menu: DEFAULT_SUPPORT_MENU,
        outOfHoursMessage: "We're back on Monday at 9.",
        staffReminderMinutes: 15,
        testNumbers: [ALLOWED_NUMBER]
      };
      expect((await t.call(admin, "PUT", API_ROUTES.adminSupport.settings, settings)).status).toBe(200);
      await say(textFrom(ALLOWED_NUMBER, "hi"));
      sent = [];
      await say(textFrom(ALLOWED_NUMBER, "agent"));
      expect(sent.at(-1)?.body).toBe("We're back on Monday at 9.");

      // Said once, at the hand-off: another message while waiting gets nothing.
      sent = [];
      await say(textFrom(ALLOWED_NUMBER, "hello?"));
      expect(sent).toEqual([]);
      expect(await followUps.remindStaff(new Date(Date.now() + 16 * 60_000))).toBe(0);

      // Open every day, all day: the waiting reminder goes.
      const allDay = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ close: "23:59", day, open: "00:00" }));
      await t.call(admin, "PUT", API_ROUTES.adminSupport.settings, { ...settings, hours: { days: allDay, timezone: "Asia/Kolkata" } });
      expect(await followUps.remindStaff(new Date(Date.now() + 16 * 60_000))).toBe(1);
    });

    it("nudges a quiet course enquiry once, inside the reply window, and never after STOP", async () => {
      const followUps = t.app.get(SupportFollowUpService);
      await say(textFrom(ALLOWED_NUMBER, "hi"));
      await say(textFrom(ALLOWED_NUMBER, "1"));
      await say(textFrom(OTHER_ALLOWED_NUMBER, "hi"));
      await say(textFrom(OTHER_ALLOWED_NUMBER, "1"));
      await say(textFrom(OTHER_ALLOWED_NUMBER, "STOP"));
      sent = [];

      expect(await followUps.nudgeParents(new Date(Date.now() + 19 * 60 * 60_000))).toBe(0);
      expect(await followUps.nudgeParents(new Date(Date.now() + 21 * 60 * 60_000))).toBe(1);
      expect(sent).toEqual([expect.objectContaining({ body: expect.stringContaining("free demo"), to: ALLOWED_NUMBER, type: "button" })]);
      expect(await followUps.nudgeParents(new Date(Date.now() + 22 * 60 * 60_000))).toBe(0);

      // Tapping it starts the booking.
      sent = [];
      await say(tapFrom(ALLOWED_NUMBER, "course.demo"));
      expect(sent[0].body).toContain("student's name");
    });
  });
});

const ANSWER = {
  body: "Group classes are 2,000 rupees a month.",
  description: "Monthly fees",
  keywords: ["Fee", " price "],
  showInBot: true,
  sortOrder: 0,
  title: "Fees"
};

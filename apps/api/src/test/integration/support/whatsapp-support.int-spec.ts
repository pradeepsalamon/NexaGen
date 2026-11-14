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
import {
  API_ROUTES,
  DEFAULT_TENANT_ID,
  type LeadDetailResponse,
  type SupportContactExport,
  type SupportSavedReplyItem,
  type SupportUnansweredQuestionListResponse,
  type SupportTicketDetail,
  type SupportTicketListResponse
} from "@nexa-chess/types";
import { UserRole, type User } from "@prisma/client";
import { setTenantScopeModeForTesting } from "../../../prisma/tenant-scope.extension";
import { SupportFollowUpService } from "../../../support/support-follow-up.service";
import { asPlatform, runInTenant } from "../../../tenancy/tenant-context";
import { createTestApp, type TestApp } from "../app";
import { createUser, resetDatabase } from "../db";

// The WhatsApp support bot end to end (docs/WHATSAPP_SUPPORT.md §11): signed
// webhooks into the real app and database, Meta's send API stubbed.

type Sent = { to: string; type: string; body: string };

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
      if (!url.startsWith(TEST_GRAPH_BASE)) return realFetch(input, init);
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
      const conversation = await db(() => t.prisma.supportConversation.findFirstOrThrow({ where: { id: ticket.conversationId } }));
      expect(conversation.status).toBe("BOT");

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

    it("outside the team's hours: the academy's away message after a hand-off, reminders wait", async () => {
      const followUps = t.app.get(SupportFollowUpService);
      // No open day at all: always outside hours, whatever time the suite runs.
      const settings = {
        agentReplyTemplate: "",
        agentReplyTemplateLanguage: "en",
        botEnabled: true,
        hours: { days: [], timezone: "Asia/Kolkata" },
        leadNudgeHours: 20,
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

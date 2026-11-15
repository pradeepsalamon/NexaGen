import type { JobLockService } from "../prisma/job-lock.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { WhatsAppService } from "../whatsapp/whatsapp.service";
import { SUPPORT_BOT_REPLY_SUPERSEDED, SupportOutboxService } from "./support-outbox.service";

type Row = {
  attempts: number;
  author: "AGENT" | "BOT";
  body: string;
  claimedAt: Date | null;
  createdAt: Date;
  error: string | null;
  id: string;
  nextAttemptAt: Date | null;
  payload: null;
  status: string;
};

const t = (minute: number) => new Date(Date.UTC(2026, 10, 14, 12, minute));

/** Just enough of Prisma for one conversation's outbox. */
function setup(conversationStatus: string, rows: Row[], takeOverAt: Date | null = null) {
  const sent: string[] = [];
  const matches = (row: Row, where: { id?: string; status?: string }) =>
    (!where.id || row.id === where.id) && (!where.status || row.status === where.status);
  const prisma = {
    supportMessage: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.author === "AGENT") {
          const after = (where.createdAt as { gt: Date }).gt;
          return rows.find((row) => row.author === "AGENT" && row.createdAt > after) ?? null;
        }
        const next = rows.filter((row) => row.status === "PENDING").sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
        return next ? { ...next, conversation: { contact: { waId: "919876543210" }, status: conversationStatus } } : null;
      }),
      update: jest.fn(async ({ data, where }: { data: Partial<Row>; where: { id: string } }) => {
        Object.assign(rows.find((row) => row.id === where.id)!, data);
      }),
      updateMany: jest.fn(async ({ data, where }: { data: Partial<Row> & { attempts?: unknown }; where: { id: string; status?: string } }) => {
        const row = rows.find((candidate) => matches(candidate, where));
        if (!row) return { count: 0 };
        const { attempts: _attempts, ...rest } = data;
        Object.assign(row, rest);
        return { count: 1 };
      })
    },
    supportTicketEvent: {
      findFirst: jest.fn(async ({ where }: { where: { createdAt: { gt: Date } } }) =>
        takeOverAt && takeOverAt > where.createdAt.gt ? { id: "event" } : null
      )
    }
  };
  const whatsapp = {
    isConfigured: () => true,
    trySendText: jest.fn(async ({ body }: { body: string }) => {
      sent.push(body);
      return { ok: true, result: { messageId: `wamid.${sent.length}` } };
    })
  };
  const outbox = new SupportOutboxService(
    {} as JobLockService,
    prisma as unknown as PrismaService,
    whatsapp as unknown as WhatsAppService
  );
  return { outbox, rows, sent };
}

function row(id: string, author: Row["author"], minute: number, extra: Partial<Row> = {}): Row {
  return {
    attempts: 0,
    author,
    body: id,
    claimedAt: null,
    createdAt: t(minute),
    error: null,
    id,
    nextAttemptAt: null,
    payload: null,
    status: "PENDING",
    ...extra
  };
}

describe("SupportOutboxService.sendPending ownership", () => {
  it("sends bot replies while the bot has the conversation", async () => {
    const { outbox, rows, sent } = setup("BOT", [row("hello", "BOT", 1), row("menu", "BOT", 2)]);
    await outbox.sendPending("c1");
    expect(sent).toEqual(["hello", "menu"]);
    expect(rows.every((r) => r.status === "SENT")).toBe(true);
  });

  it("still sends the bot's hand-off note while the conversation waits for staff", async () => {
    const { outbox, sent } = setup("WAITING_AGENT", [row("passed to our team", "BOT", 1)]);
    await outbox.sendPending("c1");
    expect(sent).toEqual(["passed to our team"]);
  });

  it("drops a bot reply waiting for a retry once staff replied, and sends the staff reply at once", async () => {
    const retry = row("bot answer", "BOT", 1, { attempts: 1, nextAttemptAt: new Date(Date.now() + 15 * 60_000) });
    const { outbox, rows, sent } = setup("AGENT", [retry, row("Hi, Priya here", "AGENT", 2)]);
    await outbox.sendPending("c1");
    expect(sent).toEqual(["Hi, Priya here"]);
    expect(rows[0]).toMatchObject({ error: SUPPORT_BOT_REPLY_SUPERSEDED, status: "FAILED" });
  });

  it("drops a bot reply when staff took over and handed back after it was written", async () => {
    const { outbox, rows, sent } = setup("BOT", [row("old bot answer", "BOT", 1)], t(3));
    await outbox.sendPending("c1");
    expect(sent).toEqual([]);
    expect(rows[0].status).toBe("FAILED");
  });

  it("keeps a bot reply written after the hand-back", async () => {
    const { outbox, sent } = setup("BOT", [row("new menu", "BOT", 5)], t(3));
    await outbox.sendPending("c1");
    expect(sent).toEqual(["new menu"]);
  });

  it("always sends staff replies, even after the conversation closed", async () => {
    const { outbox, sent } = setup("CLOSED", [row("Resolved, thanks!", "AGENT", 1)]);
    await outbox.sendPending("c1");
    expect(sent).toEqual(["Resolved, thanks!"]);
  });
});

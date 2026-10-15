import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import { UserStatus } from "@prisma/client";
import { chatMessagesQuerySchema, directChatAllowed, directConversationKey } from "@nexa-chess/types";
import type { PrismaService } from "../prisma/prisma.service";
import { ChatService } from "./chat.service";

const user = (id: string, role: string) => ({ firstName: id, id, lastName: null, role });

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    batch: null,
    batchId: null,
    id: "conv-1",
    members: [],
    name: null,
    type: "DIRECT",
    ...overrides,
  };
}

describe("directChatAllowed", () => {
  it("never lets two students message privately", () => {
    expect(directChatAllowed("STUDENT", "STUDENT", true)).toBe(false);
  });
  it("lets a coach and a student talk only while they share a batch", () => {
    expect(directChatAllowed("COACH", "STUDENT", true)).toBe(true);
    expect(directChatAllowed("STUDENT", "COACH", true)).toBe(true);
    expect(directChatAllowed("STUDENT", "COACH", false)).toBe(false);
  });
  it("lets staff reach anyone, and keeps coaches out of each other's DMs", () => {
    expect(directChatAllowed("ADMIN", "STUDENT", false)).toBe(true);
    expect(directChatAllowed("STUDENT", "SUPER_ADMIN", false)).toBe(true);
    expect(directChatAllowed("COACH", "COACH", true)).toBe(false);
  });
  it("keys a pair the same way whichever side starts", () => {
    expect(directConversationKey("b", "a")).toBe(directConversationKey("a", "b"));
  });
});

describe("ChatService", () => {
  let prisma: Record<string, Record<string, jest.Mock>> & { $transaction: jest.Mock };
  let service: ChatService;
  const as = (id: string, role: string) =>
    prisma.user.findUnique.mockResolvedValue({ id, role, status: UserStatus.ACTIVE });

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      batchCoach: { count: jest.fn().mockResolvedValue(1), findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      batchStudent: { count: jest.fn().mockResolvedValue(1), findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      chatMessage: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      conversation: {
        create: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      conversationMember: {
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
        upsert: jest.fn(),
      },
      user: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    } as never;
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: "x", type: "access" }) };
    service = new ChatService(jwt as unknown as JwtService, prisma as unknown as PrismaService);
  });

  describe("direct messages", () => {
    it("refuses a student messaging another student, at the API", async () => {
      as("s1", "STUDENT");
      prisma.user.findFirst.mockResolvedValue(user("s2", "STUDENT"));
      await expect(service.startDirect("t", "s2")).rejects.toThrow(/Students can't message each other/);
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it("refuses a coach messaging a student outside their batches", async () => {
      as("c1", "COACH");
      prisma.user.findFirst.mockResolvedValue(user("s9", "STUDENT"));
      prisma.batchStudent.findFirst.mockResolvedValue(null);
      await expect(service.startDirect("t", "s9")).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("opens one thread per pair for a coach and their student", async () => {
      as("c1", "COACH");
      prisma.user.findFirst.mockResolvedValue(user("s1", "STUDENT"));
      prisma.batchStudent.findFirst.mockResolvedValue({ id: "bs" });
      prisma.conversation.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValue(conversation({ members: [{ role: "MEMBER", user: user("c1", "COACH"), userId: "c1" }, { role: "MEMBER", user: user("s1", "STUDENT"), userId: "s1" }] }));
      prisma.conversation.create.mockResolvedValue({ id: "conv-1" });
      prisma.conversationMember.findUnique.mockResolvedValue({ joinedAt: new Date(), lastReadAt: null, leftAt: null });

      const detail = await service.startDirect("t", "s1");
      expect(prisma.conversation.create.mock.calls[0][0].data).toMatchObject({ directKey: directConversationKey("c1", "s1"), type: "DIRECT" });
      expect(detail).toMatchObject({ canSend: true, title: "s1", type: "DIRECT" });
    });

    it("keeps history readable but stops sending once coach and student no longer share a batch", async () => {
      as("s1", "STUDENT");
      prisma.conversation.findUnique.mockResolvedValue(
        conversation({ members: [{ role: "MEMBER", user: user("c1", "COACH"), userId: "c1" }, { role: "MEMBER", user: user("s1", "STUDENT"), userId: "s1" }] }),
      );
      prisma.conversationMember.findUnique.mockResolvedValue({ joinedAt: new Date(), lastReadAt: null, leftAt: null });
      prisma.batchStudent.findFirst.mockResolvedValue(null);
      await expect(service.listMessages("t", "conv-1", chatMessagesQuerySchema.parse({}))).resolves.toEqual({ messages: [], nextBefore: null });
      await expect(service.sendMessage("t", "conv-1", { body: "hi", clientId: "client-123" })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("conversation access", () => {
    it("answers 404 for a thread the caller isn't in (changing the id in the URL gets nothing)", async () => {
      as("s1", "STUDENT");
      prisma.conversation.findUnique.mockResolvedValue(conversation({ id: "someone-elses" }));
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      await expect(service.listMessages("t", "someone-elses", chatMessagesQuerySchema.parse({}))).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.sendMessage("t", "someone-elses", { body: "x", clientId: "client-123" })).rejects.toBeInstanceOf(NotFoundException);
    });

    it("lets a student into their own batch's thread only, from their enrolment on", async () => {
      as("s1", "STUDENT");
      const enrolledAt = new Date("2026-10-01T00:00:00Z");
      prisma.conversation.findUnique.mockResolvedValue(
        conversation({ batch: { id: "b1", isDeleted: false, name: "Batch 1" }, batchId: "b1", type: "BATCH" }),
      );
      prisma.batchStudent.findFirst.mockResolvedValue({ enrolledAt });
      await service.listMessages("t", "conv-1", chatMessagesQuerySchema.parse({}));
      expect(prisma.chatMessage.findMany.mock.calls[0][0].where).toEqual({
        AND: [{ createdAt: { gte: enrolledAt } }],
        conversationId: "conv-1",
      });

      prisma.batchStudent.findFirst.mockResolvedValue(null);
      await expect(service.listMessages("t", "conv-1", chatMessagesQuerySchema.parse({}))).rejects.toBeInstanceOf(NotFoundException);
    });

    it("cuts a removed group member off", async () => {
      as("s1", "STUDENT");
      prisma.conversation.findUnique.mockResolvedValue(conversation({ name: "Squad", type: "GROUP" }));
      prisma.conversationMember.findUnique.mockResolvedValue({ joinedAt: new Date(), lastReadAt: null, leftAt: new Date() });
      await expect(service.getConversation("t", "conv-1")).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("sending", () => {
    beforeEach(() => {
      as("c1", "COACH");
      prisma.conversation.findUnique.mockResolvedValue(
        conversation({ batch: { id: "b1", isDeleted: false, name: "Batch 1" }, batchId: "b1", type: "BATCH" }),
      );
      prisma.batchCoach.findFirst.mockResolvedValue({ id: "bc" });
    });

    it("stores a message and marks it read for the sender", async () => {
      const createdAt = new Date();
      prisma.chatMessage.create.mockResolvedValue({ body: "hello", clientId: "client-123", conversationId: "conv-1", createdAt, id: "m1", sender: user("c1", "COACH") });
      const msg = await service.sendMessage("t", "conv-1", { body: "hello", clientId: "client-123" });
      expect(msg).toMatchObject({ body: "hello", id: "m1", sender: { id: "c1" } });
      expect(prisma.conversation.update).toHaveBeenCalledWith({ data: { lastMessageAt: createdAt }, where: { id: "conv-1" } });
      expect(prisma.conversationMember.upsert).toHaveBeenCalled();
    });

    it("returns the original message for a retried send instead of duplicating it", async () => {
      prisma.chatMessage.findUnique.mockResolvedValue({ body: "hello", clientId: "client-123", conversationId: "conv-1", createdAt: new Date(), id: "m1", sender: user("c1", "COACH") });
      const msg = await service.sendMessage("t", "conv-1", { body: "hello", clientId: "client-123" });
      expect(msg.id).toBe("m1");
      expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    });

    it("rejects a client id reused in another conversation", async () => {
      prisma.chatMessage.findUnique.mockResolvedValue({ body: "x", clientId: "client-123", conversationId: "other", createdAt: new Date(), id: "m1", sender: null });
      await expect(service.sendMessage("t", "conv-1", { body: "x", clientId: "client-123" })).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("groups", () => {
    it("never lets a student create one", async () => {
      as("s1", "STUDENT");
      await expect(service.createGroup("t", { memberIds: ["s2"], name: "Us" })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("only lets a coach add students from their own batches", async () => {
      as("c1", "COACH");
      prisma.user.findMany.mockResolvedValue([{ id: "s1" }]);
      await expect(service.createGroup("t", { memberIds: ["s1", "s-outside"], name: "Squad" })).rejects.toThrow(/own batches/);
      expect(prisma.user.findMany.mock.calls[0][0].where.studentBatches).toBeDefined();
    });

    it("only lets the owner (or an admin) change members", async () => {
      as("c2", "COACH");
      prisma.conversation.findUnique.mockResolvedValue(
        conversation({ members: [{ role: "OWNER", user: user("c1", "COACH"), userId: "c1" }, { role: "MEMBER", user: user("c2", "COACH"), userId: "c2" }], name: "Squad", type: "GROUP" }),
      );
      prisma.conversationMember.findUnique.mockResolvedValue({ joinedAt: new Date(), lastReadAt: null, leftAt: null });
      await expect(service.updateGroupMembers("t", "conv-1", { add: ["s1"], remove: [] })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it("creates each batch thread once (skipDuplicates) when listing", async () => {
    as("s1", "STUDENT");
    prisma.batchStudent.findMany.mockResolvedValue([{ batch: { id: "b1", name: "Batch 1" } }]);
    await service.listConversations("t");
    expect(prisma.conversation.createMany).toHaveBeenCalledWith({ data: [{ batchId: "b1", type: "BATCH" }], skipDuplicates: true });
  });
});
